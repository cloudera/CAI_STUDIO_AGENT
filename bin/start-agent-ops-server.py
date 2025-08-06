import subprocess
import cmlapi
import os
from typing import Dict 
import json
from studio.consts import DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT
import http.server
import http.client
import urllib.parse
from kombu import Connection, Exchange
from kombu.simple import SimpleQueue

# ---------------------------
# Kombu Initialization
# ---------------------------

# Create a Kombu connection using the in-memory transport
kombu_connection = Connection("memory://")
# Ensure the connection is established
kombu_connection.connect()
# Global dictionary to store per-trace queues
trace_queues = {}


def get_or_create_queue(trace_id):
    """
    Retrieve or create a SimpleQueue for a given trace_id.
    The queue is bound to the 'crew_events' exchange using the trace_id as routing key.
    """
    if trace_id not in trace_queues:
        simple_queue = kombu_connection.SimpleQueue(name=trace_id)
        trace_queues[trace_id] = simple_queue
    return trace_queues[trace_id]


def start_phoenix_server():
    """
    Start up the actual phoenix observability platform server process.
    """
    
    print("Starting up the Phoenix ops platform server...")
    app_dir = os.getenv("APP_DIR")
    if app_dir is None:
        raise ValueError("APP_DIR environment variable must be set.")
    out = subprocess.run([f"bash {os.path.join(app_dir, 'bin/start-agent-ops-phoenix.sh')}"], shell=True, check=True)


def set_ops_server_discovery():
    """
    Write this application pod's IP and port to the project
    environment variables. This will allow other pods and workflows
    to access the UI through http://<ip>:<port>/, and the graphql
    endpoint through http://<ip>:<port>/graphql
    """

    # Set some new environment variables
    os.environ["AGENT_STUDIO_OPS_IP"] = os.getenv("CDSW_IP_ADDRESS")
    os.environ["AGENT_STUDIO_OPS_PORT"] = DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT
    cml = cmlapi.default_client()
    project_id = os.getenv("CDSW_PROJECT_ID")
    proj: cmlapi.Project = cml.get_project(project_id)
    proj_env: Dict = json.loads(proj.environment)
    proj_env.update({
        "AGENT_STUDIO_OPS_IP": os.environ["AGENT_STUDIO_OPS_IP"],
        "AGENT_STUDIO_OPS_PORT": os.environ["AGENT_STUDIO_OPS_PORT"]
    })
    updated_project: cmlapi.Project = cmlapi.Project(
        environment= json.dumps(proj_env)
    )
    out: cmlapi.Project = cml.update_project(updated_project, project_id=project_id)
    print("LLM Ops Server discoverable through project env variables!")


# Define the target server to forward requests to
TARGET_SERVER = "0.0.0.0"


# ---------------------------
# HTTP Server Handler
# ---------------------------
class ProxyHandler(http.server.BaseHTTPRequestHandler):
    """
    We do not inherently serve the ops platform on $CDSW_APP_PORT because this
    port is gated with authentication, which affects both our /v1/trace calls
    and the /graphql calls to this endpoint. Instead, we serve on a dedicated
    port in the container, and forward all traffic from CDSW_APP_PORT to 
    our phoenix server with this python middleware.
    """
    
    def do_POST(self):
        if self.path.startswith("/events"):
            self.handle_events_post()
        else:
            self.forward_request()
    

    def do_GET(self):
        if self.path.startswith("/events"):
            self.handle_events_get()
        else:
            self.forward_request()


    def handle_events_post(self):
        # Read and parse the JSON body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        trace_id = data.get("trace_id")
        event_content = data.get("event")
        if not trace_id or not event_content:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing trace_id or event")
            return

        # Get (or create) the queue associated with this trace_id
        queue = get_or_create_queue(trace_id)
        # Publish the message to the Kombu queue
        queue.put(event_content)

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status": "200"}')


    def handle_events_get(self):
        # Parse query parameters to extract trace_id
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        trace_id = params.get("trace_id", [None])[0]

        if not trace_id:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing trace_id")
            return

        queue = get_or_create_queue(trace_id)
        messages = []
        # Retrieve and flush all messages from the queue
        while True:
            try:
                message = queue.get_nowait()  # non-blocking
                messages.append(message.payload)
                message.ack()  # Acknowledge to remove the message
            except Exception:
                # No more messages in the queue
                break

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(messages).encode("utf-8"))



    def forward_request(self):

        # The target URL is where the phoenix server resides
        target_url = f"http://{TARGET_SERVER}:{DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT}{self.path}"

        # Forward the request to the target server
        url = urllib.parse.urlparse(target_url)
        conn = http.client.HTTPConnection(url.hostname, url.port)

        # Forward the headers
        headers = {key: value for key, value in self.headers.items()}

        # Read the body (for POST requests)
        body = None
        if self.command == "POST":
            content_length = self.headers.get("Content-Length")
            if content_length:
                body = self.rfile.read(int(content_length))

        # Send the request to the target server
        conn.request(self.command, url.path + ("?" + url.query if url.query else ""), body, headers)
        response = conn.getresponse()

        # Send the response back to the client
        self.send_response(response.status)
        for key, value in response.getheaders():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.read())
        

def run_proxy_server():
    """
    Start up the proxy server. This makes the phoenix observability platform visible right from the 
    CDSW application by forwarding all CDSW_APP_PORT traffic to the dedicated phoenix server running
    on a separate host port.
    """
    server_address = ("127.0.0.1", int(os.getenv("CDSW_APP_PORT")))
    print(f"Starting proxy server on {server_address[0]}:{server_address[1]}, forwarding to {TARGET_SERVER}")
    httpd = http.server.HTTPServer(server_address, ProxyHandler)
    httpd.serve_forever()


set_ops_server_discovery()
start_phoenix_server()
run_proxy_server()