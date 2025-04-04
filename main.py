import webview
import threading
import http.server
import socketserver
import os
import socket
import urllib.parse
import logging
import sys
import base64
import math
import shutil
from typing import Dict, List, Optional, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('PentoolFileTransfer')

# Keep track of the original working directory
original_path = os.getcwd()

# --- Custom HTTP Handler ---
class SingleFileHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    A request handler that only serves a specific file specified
    during server initialization. All other requests get a 404.
    """
    # Class variable to hold the target filename
    target_filename = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.target_filename is None:
            self.send_error(500, "Server Misconfiguration: Target filename not set.")
            return

        # Decode the requested path
        requested_path = urllib.parse.unquote(self.path.lstrip('/'))

        # Prevent directory traversal attacks
        normalized_requested = os.path.normpath(requested_path)
        normalized_target = os.path.normpath(self.target_filename)

        # Check if the requested filename matches the target filename
        if normalized_requested == normalized_target:
            # Serve the file from the root URL path
            self.path = '/' + self.target_filename
            try:
                super().do_GET()
            except Exception as e:
                logger.error(f"Error serving file: {e}")
                self.send_error(500, f"Error serving file: {str(e)}")
        else:
            self.send_error(404, f"File not found. Only serving '{self.target_filename}'")

    # Disable directory listing
    def list_directory(self, path):
        self.send_error(404, "Directory listing disabled")
        return None

    # Override log_message to use our logging system
    def log_message(self, format, *args):
        logger.info(f"HTTP: {format % args}")


class Api:
    def __init__(self):
        self.server = None
        self.thread = None
        self.serve_filename = None
        self.serve_directory = None
        self.selected_full_path = None
        self.port = 8000
        self.ip_address = None
        self.chunk_directory = None # For storing chunked files

    def select_file(self) -> Optional[str]:
        """Opens a file dialog and returns the selected file path."""
        global window
        if not window:
            logger.error("Error: Window object not available for file dialog.")
            return None

        try:
            result = window.create_file_dialog(webview.OPEN_DIALOG)
            if not result:
                logger.info("File selection cancelled.")
                self.selected_full_path = None
                return None
                
            # result is often a tuple, take the first element
            selected_path = result[0] if isinstance(result, (list, tuple)) and len(result) > 0 else result
            if not isinstance(selected_path, str):
                logger.error(f"File selection returned unexpected type: {type(selected_path)}")
                self.selected_full_path = None
                return None
                
            logger.info(f"File selected: {selected_path}")
            self.selected_full_path = selected_path
            return selected_path
        except Exception as e:
            logger.error(f"Error during file selection: {e}")
            self.selected_full_path = None
            return None

    def start_server(self, filename_unused, port) -> Dict[str, Any]:
        """
        Start the HTTP server to serve the selected file.
        Returns a dict with server status and info.
        """
        if self.server:
            logger.warning("Server already running.")
            return {'success': False, 'error': 'Server already running.'}

        if not self.selected_full_path:
            logger.error("No file selected.")
            return {'success': False, 'error': 'No file selected.'}

        try:
            self.port = int(port)
            full_path = self.selected_full_path
            
            # Verify file exists and is readable
            if not os.path.exists(full_path):
                error_msg = f"File not found: {full_path}"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}
                
            if not os.path.isfile(full_path):
                error_msg = f"Not a file: {full_path}"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}
                
            try:
                with open(full_path, 'rb') as _:
                    pass  # Test file is readable
            except PermissionError:
                error_msg = f"Permission denied to read file: {full_path}"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}
            
            # Setup server paths
            self.serve_directory = os.path.dirname(full_path)
            self.serve_filename = os.path.basename(full_path)

            # Setup custom handler
            SingleFileHTTPRequestHandler.target_filename = self.serve_filename
            handler = SingleFileHTTPRequestHandler

            # Change to the directory containing the file
            try:
                os.chdir(self.serve_directory)
                logger.info(f"Changed working directory to: {self.serve_directory}")
            except FileNotFoundError:
                error_msg = f"Directory not found: {self.serve_directory}"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}
            except PermissionError:
                error_msg = f"Permission denied to access directory: {self.serve_directory}"
                logger.error(error_msg)
                return {'success': False, 'error': error_msg}

            # Get the best IP address for serving
            self.ip_address = self.get_best_ip_address()
            if not self.ip_address:
                self.ip_address = "127.0.0.1"  # Fallback to localhost
                
            # Start the server
            try:
                self.server = socketserver.TCPServer(("0.0.0.0", self.port), handler)
                self.thread = threading.Thread(target=self.server.serve_forever)
                self.thread.daemon = True
                self.thread.start()
                logger.info(f"Server started on {self.ip_address}:{self.port} serving '{self.serve_filename}'")
                return {
                    'success': True,
                    'filename': self.serve_filename,
                    'port': self.port,
                    'directory': self.serve_directory,
                    'ip': self.ip_address
                }
            except OSError as e:
                if e.errno == 98:  # Address already in use
                    error_msg = f"Port {self.port} is already in use. Please choose another port."
                else:
                    error_msg = f"Error starting server: {e}"
                logger.error(error_msg)
                self._cleanup_on_error()
                return {'success': False, 'error': error_msg}
                
        except ValueError:
            error_msg = f"Invalid port number '{port}'"
            logger.error(error_msg)
            return {'success': False, 'error': error_msg}
        except Exception as e:
            error_msg = f"Unexpected error starting server: {e}"
            logger.error(error_msg)
            self._cleanup_on_error()
            return {'success': False, 'error': error_msg}
            
    def file_to_base64(self, filepath: str) -> Dict[str, Any]:
        """
        Convert a file to base64 encoding
        Returns the base64 encoded string
        """
        if not filepath or not os.path.exists(filepath):
            return {'success': False, 'error': 'File not found'}
            
        try:
            with open(filepath, 'rb') as file:
                encoded_data = base64.b64encode(file.read()).decode('utf-8')
                return {
                    'success': True, 
                    'data': encoded_data, 
                    'size': len(encoded_data),
                    'filename': os.path.basename(filepath)
                }
        except Exception as e:
            logger.error(f"Error encoding file to base64: {e}")
            return {'success': False, 'error': str(e)}
            
    def split_file(self, filepath: str, chunk_size_kb: int = 1024) -> Dict[str, Any]:
        """
        Split a file into smaller chunks
        Returns information about the chunks created
        """
        if not filepath or not os.path.exists(filepath):
            return {'success': False, 'error': 'File not found'}
            
        try:
            # Convert KB to bytes
            chunk_size = chunk_size_kb * 1024
            
            # Create output directory for chunks if needed
            filename = os.path.basename(filepath)
            chunk_dir = os.path.join(os.path.dirname(filepath), f"{filename}_chunks")
            
            # Clean up any existing chunks directory
            if os.path.exists(chunk_dir):
                shutil.rmtree(chunk_dir)
                
            os.makedirs(chunk_dir, exist_ok=True)
            self.chunk_directory = chunk_dir
            
            # Get file size and calculate number of chunks
            file_size = os.path.getsize(filepath)
            num_chunks = math.ceil(file_size / chunk_size)
            
            # Prepare info for chunks
            chunks = []
            
            with open(filepath, 'rb') as infile:
                for i in range(num_chunks):
                    chunk_name = f"{filename}.{i+1:03d}"
                    chunk_path = os.path.join(chunk_dir, chunk_name)
                    
                    with open(chunk_path, 'wb') as outfile:
                        data = infile.read(chunk_size)
                        outfile.write(data)
                        
                    chunks.append({
                        'name': chunk_name,
                        'path': chunk_path,
                        'size': len(data)
                    })
                    
            logger.info(f"Split {filepath} into {len(chunks)} chunks in {chunk_dir}")
            return {
                'success': True,
                'chunks': chunks,
                'original_file': filename,
                'total_size': file_size,
                'chunk_size': chunk_size,
                'chunk_dir': chunk_dir
            }
                
        except Exception as e:
            logger.error(f"Error splitting file: {e}")
            # Clean up any partial work
            if self.chunk_directory and os.path.exists(self.chunk_directory):
                try:
                    shutil.rmtree(self.chunk_directory)
                except:
                    pass
            return {'success': False, 'error': str(e)}

    def _cleanup_on_error(self):
        """Clean up resources after an error"""
        if os.getcwd() != original_path:
            try:
                os.chdir(original_path)
                logger.info(f"Restored working directory to: {original_path}")
            except Exception as e:
                logger.error(f"Error restoring original directory: {e}")
        
        self.server = None
        self.thread = None
        SingleFileHTTPRequestHandler.target_filename = None
            
    def stop_server(self) -> Dict[str, Any]:
        """Stop the HTTP server"""
        if not self.server:
            logger.warning("Server not running.")
            return {'success': False, 'error': 'Server was not running.'}

        try:
            logger.info("Stopping server...")
            self.server.shutdown()
            self.server.server_close()
            
            # Wait for thread with timeout
            if self.thread and self.thread.is_alive():
                self.thread.join(timeout=1.0)
                if self.thread.is_alive():
                    logger.warning("Server thread did not exit cleanly.")
            
            # Clean up resources
            self.server = None
            self.thread = None
            self.serve_filename = None
            self.ip_address = None
            SingleFileHTTPRequestHandler.target_filename = None

            # Restore original directory
            current_cwd = os.getcwd()
            if current_cwd != original_path:
                try:
                    os.chdir(original_path)
                    logger.info(f"Restored working directory to: {original_path}")
                except Exception as e:
                    logger.error(f"Error restoring directory: {e}")
                    return {'success': True, 'warning': f'Server stopped, but failed to restore original directory: {e}'}
            
            logger.info("Server stopped successfully.")
            return {'success': True}
            
        except Exception as e:
            error_msg = f"Error stopping server: {e}"
            logger.error(error_msg)
            
            # Attempt to force cleanup even on error
            self.server = None
            self.thread = None
            self.serve_filename = None  
            self.ip_address = None
            SingleFileHTTPRequestHandler.target_filename = None
            
            if os.getcwd() != original_path:
                try:
                    os.chdir(original_path)
                    logger.info(f"Restored working directory to: {original_path}")
                except Exception as chdir_err:
                    logger.error(f"Additionally failed to restore original directory: {chdir_err}")
            
            return {'success': False, 'error': error_msg}

    def get_ip_addresses(self) -> List[str]:
        """Get list of available IP addresses on this system"""
        addresses = []
        
        # Try to get primary IP from dummy connection
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.1)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and ip != '127.0.0.1' and ip != '127.0.1.1':
                addresses.append(ip)
            s.close()
        except Exception as e:
            logger.warning(f"Could not get IP via dummy connection: {e}")

        # Get all interface addresses as fallback/addition
        try:
            host_name = socket.gethostname()
            try:
                all_ips = socket.getaddrinfo(host_name, None, socket.AF_INET)
            except socket.gaierror:
                all_ips = socket.getaddrinfo(host_name, None)

            for item in all_ips:
                if item[0] == socket.AF_INET:
                    ip_addr = item[4][0]
                    if ip_addr not in addresses and ip_addr != '127.0.0.1' and ip_addr != '127.0.1.1':
                        addresses.append(ip_addr)
        except Exception as e:
            logger.warning(f"Could not get IP addresses via getaddrinfo: {e}")

        # Add localhost if no other addresses were found
        if not addresses:
            logger.warning("Could not detect external IP, falling back to 127.0.0.1")
            addresses.append("127.0.0.1")
            
        logger.info(f"Detected IP Addresses: {addresses}")
        return addresses
        
    def get_best_ip_address(self) -> Optional[str]:
        """Return the best IP address to use for the server"""
        addresses = self.get_ip_addresses()
        # Prefer non-localhost address
        for addr in addresses:
            if addr != "127.0.0.1" and addr != "127.0.1.1":
                return addr
        # Fallback to localhost
        # Return 127.0.0.1 only if it's the only one found (or no others)
        return "127.0.0.1" if "127.0.0.1" in addresses else (addresses[0] if addresses else None)


# Global window variable needed for file dialog access from API class
window = None

def main():
    global window, original_path
    
    # Store the original path before doing anything else
    original_path = os.path.abspath(os.getcwd())
    logger.info(f"Original working directory: {original_path}")
    
    # Create API instance
    api = Api()
    
    # Create the webview window with improved dimensions
    window = webview.create_window(
        'PenTool File Transfer',
        'web/index.html',
        js_api=api,
        width=850,
        height=750,
        min_size=(600, 500)
    )

    # Ensure server is stopped cleanly on window close
    def on_closing():
        logger.info("Window closing, stopping server if running...")
        api.stop_server()

    window.events.closing += on_closing

    # Start pywebview 
    webview.start(debug=False)
    
    # Final cleanup check
    final_cwd = os.path.abspath(os.getcwd())
    if final_cwd != original_path:
        logger.warning(f"Restoring original CWD '{original_path}' from '{final_cwd}' after main exit.")
        try:
            os.chdir(original_path)
        except Exception as e:
            logger.error(f"Error restoring CWD after main exit: {e}")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        logger.error(f"Unhandled exception in main: {e}")
        # Ensure we restore the original directory even on crash
        if os.getcwd() != original_path:
            try:
                os.chdir(original_path)
            except Exception as e:
                logger.error(f"Failed to restore original directory on crash: {e}")