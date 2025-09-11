import subprocess
import os
import threading
from kombu import Connection
import sys

# ---------------------------
# Kombu Initialization
# ---------------------------

# Create a Kombu connection using the in-memory transport
kombu_connection = Connection("memory://")
# Ensure the connection is established
kombu_connection.connect()
# Global dictionary to store per-trace queues
trace_queues = {}

# ---------------------------
# Ops Proxy Functionality
# ---------------------------

# Global shutdown flag for proxy
proxy_shutdown_flag = threading.Event()


def start_ops_proxy_server(local_port, target_address, target_port):
    """Starts the ops proxy server with HTML rewriting to fix Phoenix config."""
    import http.server
    import urllib.request
    import re
    
    class PhoenixProxyHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.proxy_request()
        
        def do_POST(self):
            self.proxy_request()
            
        def do_PUT(self):
            self.proxy_request()
            
        def do_DELETE(self):
            self.proxy_request()
            
        def handle_events_request(self):
            """Handle /events requests with Kombu logic."""
            import json
            import urllib.parse
            
            try:
                if self.command == 'GET':
                    # Handle GET /events?trace_id=...
                    parsed_url = urllib.parse.urlparse(self.path)
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    trace_id = query_params.get('trace_id', [None])[0]
                    
                    messages, status_code = handle_events_get_data(trace_id)
                    
                    self.send_response(status_code)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"events": messages}).encode('utf-8'))
                elif self.command == 'POST':
                    # Handle POST /events with JSON body
                    content_length = int(self.headers.get("Content-Length", 0))
                    body = self.rfile.read(content_length)
                    try:
                        data = json.loads(body)
                    except json.JSONDecodeError:
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{"error": "Invalid JSON"}')
                        return

                    trace_id = data.get("trace_id")
                    event_content = data.get("event")
                    if not trace_id or not event_content:
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{"error": "Missing trace_id or event"}')
                        return

                    # Get (or create) the queue associated with this trace_id
                    queue = get_or_create_queue(trace_id)
                    # Publish the message to the Kombu queue
                    queue.put(event_content)

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"status": "200"}')
                else:
                    self.send_response(405)  # Method not allowed
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Method not allowed"}')
                    
            except Exception as e:
                print(f"Events handling error: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            
        def proxy_request(self):
            # Handle /events requests with Kombu logic
            if self.path.startswith('/events'):
                self.handle_events_request()
                return
            
            # Build target URL for Phoenix requests
            target_url = f"http://{target_address}:{target_port}{self.path}"
            
            try:
                # Create request to Phoenix
                req = urllib.request.Request(target_url, method=self.command)
                
                # Forward headers (excluding problematic ones)
                for header, value in self.headers.items():
                    if header.lower() not in ['host', 'connection', 'accept-encoding']:
                        req.add_header(header, value)
                
                # Don't request compressed responses to avoid encoding issues
                req.add_header('Accept-Encoding', 'identity')
                
                # Forward body for POST/PUT requests
                if self.command in ['POST', 'PUT', 'PATCH']:
                    content_length = int(self.headers.get('Content-Length', 0))
                    if content_length > 0:
                        req.data = self.rfile.read(content_length)
                
                # Make request to Phoenix
                response = None
                try:
                    response = urllib.request.urlopen(req)
                except urllib.error.HTTPError as http_err:
                    # Handle HTTP status codes like 304, 404, etc. as valid responses
                    response = http_err
                
                content_type = response.headers.get('Content-Type', '')
                response_data = response.read()
                
                # Rewrite HTML for all HTML responses (root and sub-routes)
                if 'text/html' in content_type:
                    html_content = response_data.decode('utf-8', errors='ignore')
                    
                    # Fix Phoenix's basename configuration
                    html_content = re.sub(
                        r'basename:\s*"[^"]*"',
                        'basename: "/api/ops"',
                        html_content
                    )
                    
                    # Add base tag for asset resolution - use absolute path
                    if '<head>' in html_content:
                        html_content = html_content.replace(
                            '<head>',
                            '<head><base href="/api/ops/">'
                        )
                    
                    # Fix asset paths to use the correct proxy path
                    # Handle /assets/ paths (avoid double-prefixing)
                    html_content = re.sub(
                        r'(src|href)="(/assets/[^"]*)"',
                        lambda m: m.group(1) + '="/api/ops' + m.group(2) + '"' if not m.group(0).startswith('="/api/ops') else m.group(0),
                        html_content
                    )
                    # Handle root-level asset files like modernizr.js (avoid double-prefixing and API routes)
                    html_content = re.sub(
                        r'(src|href)="(/(?!api/)[^/"][^"]*\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map))"',
                        lambda m: m.group(1) + '="/api/ops' + m.group(2) + '"' if not '/api/ops' in m.group(0) else m.group(0),
                        html_content
                    )
                    
                    response_data = html_content.encode('utf-8')
                
                # Send response
                self.send_response(response.status)
                for header, value in response.headers.items():
                    if header.lower() not in ['connection', 'transfer-encoding', 'content-encoding', 'content-length']:
                        self.send_header(header, value)
                
                # Set correct content length for potentially modified content
                self.send_header('Content-Length', str(len(response_data)))
                self.end_headers()
                self.wfile.write(response_data)
                
                # Close response if it's not already closed
                if hasattr(response, 'close'):
                    response.close()
                    
            except Exception as e:
                print(f"Proxy error: {e}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'Proxy Error')
    
    # Start HTTP server
    server = http.server.HTTPServer(('127.0.0.1', local_port), PhoenixProxyHandler)
    print(f"HTTP proxy with HTML rewriting running on 127.0.0.1:{local_port}")
    
    def run_server():
        try:
            server.serve_forever()
        except Exception as e:
            print(f"Proxy server error: {e}")
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    return server


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
    app_data_dir = os.getenv("APP_DATA_DIR")
    if app_data_dir is None:
        raise ValueError("APP_DATA_DIR environment variable must be set.")
    if app_dir is None:
        raise ValueError("APP_DIR environment variable must be set.")
    
    # Set internal Phoenix port
    os.environ["INTERNAL_PHOENIX_PORT"] = "50053"
    
    out = subprocess.run([f"bash {os.path.join(app_dir, 'bin/start-agent-ops-phoenix-embedded.sh')}"], shell=True, check=True)


def start_ops_proxy(serving_port):
    """
    Start the ops proxy to forward from external port (50052) to internal Phoenix (50053).
    """
    print("Starting ops proxy server...")
    
    try:
        proxy_server = start_ops_proxy_server(serving_port, "127.0.0.1", 50053)
        return proxy_server
    except Exception as e:
        print(f"Ops proxy server error: {e}")
        return None


# ---------------------------
# Event Handling Functions
# ---------------------------

def handle_events_get_data(trace_id):
    """
    Handle GET request for crew events by trace_id.
    """
    if not trace_id:
        return {"error": "Missing trace_id"}, 400

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

    return messages, 200


if __name__ == "__main__":
    start_phoenix_server()
    print("Phoenix ops server started successfully!")

    if len(sys.argv) > 1:
        serving_port = int(sys.argv[1])
    else:
        serving_port = 50052
    
    # Start the proxy server
    proxy_server = start_ops_proxy(serving_port)
    print("Ops proxy server started successfully!")
    
    print("Event handling functions are available for integration with Next.js API routes.")
    
    # Keep the process running to maintain Phoenix server and proxy
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down ops server...")
        if proxy_server:
            proxy_server.shutdown()
        proxy_shutdown_flag.set()
        print("Proxy shutdown complete")