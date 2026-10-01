from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import socket

PORT = 8000

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

if __name__ == '__main__':
    ip = local_ip()
    print(f"\nLottery Predictor PWA running at: http://{ip}:{PORT}")
    print("Keep this window open while using the PWA on iPhone.")
    print("Press Ctrl+C to stop.\n")
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
