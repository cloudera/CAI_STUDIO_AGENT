import socket
import threading
import os

from studio.ops import get_ops_endpoint
from studio.consts import DEFAULT_AS_OPS_PROXY_PORT

ops_addr = get_ops_endpoint()

LOCAL_PORT = int(DEFAULT_AS_OPS_PROXY_PORT)
TARGET_ADDR = os.getenv("AGENT_STUDIO_OPS_IP")
TARGET_PORT = int(os.getenv("AGENT_STUDIO_OPS_PORT"))

shutdown_flag = threading.Event()

def handle_client(client_socket, target_address, target_port):
    """Handles traffic between the client and the target server."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as target_socket:
        target_socket.connect((target_address, target_port))
        
        client_to_target = threading.Thread(target=forward_data, args=(client_socket, target_socket))
        target_to_client = threading.Thread(target=forward_data, args=(target_socket, client_socket))
        
        client_to_target.start()
        target_to_client.start()
        
        client_to_target.join()
        target_to_client.join()

def forward_data(source, destination):
    """Forwards data from source to destination."""
    try:
        while not shutdown_flag.is_set():
            data = source.recv(4096)
            if not data:
                break
            destination.sendall(data)
    except socket.error:
        pass
    finally:
        source.close()
        destination.close()

def start_server(local_port, target_address, target_port):
    """Starts the port forwarder server."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind(('127.0.0.1', local_port))
        server_socket.listen(5)
        print(f"Port forwarder running on 127.0.0.1:{local_port}, forwarding to {target_address}:{target_port}")
        
        try:
            while not shutdown_flag.is_set():
                client_socket, _ = server_socket.accept()
                client_thread = threading.Thread(
                    target=handle_client, 
                    args=(client_socket, target_address, target_port)
                )
                client_thread.start()
        except KeyboardInterrupt:
            print("Shutting down ops proxy server...")
            shutdown_flag.set()
        finally:
            server_socket.close()

if __name__ == "__main__":
    start_server(LOCAL_PORT, TARGET_ADDR, TARGET_PORT)
