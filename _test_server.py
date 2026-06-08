import http.server
import json
import threading
import time
import socketserver

RESULTS = {}
RESULTS_READY = False

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        global RESULTS, RESULTS_READY
        if self.path == '/results':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode()
            RESULTS = json.loads(body)
            RESULTS_READY = True
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'ok')
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/poll':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(RESULTS).encode())
        else:
            super().do_GET()

httpd = socketserver.TCPServer(('', 9001), Handler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
print("Server on http://localhost:9001")
print("Open http://localhost:9001/tests.html in browser")

for i in range(120):
    if RESULTS_READY:
        break
    time.sleep(0.5)

if RESULTS_READY:
    print("\n=== TEST RESULTS ===")
    print("Passed: %s" % RESULTS.get('passed', '?'))
    print("Failed: %s" % RESULTS.get('failed', '?'))
    print("Total: %s" % RESULTS.get('total', '?'))
else:
    print("\nNo results received after 60 seconds")

httpd.shutdown()
