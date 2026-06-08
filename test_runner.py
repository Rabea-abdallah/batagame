import http.server
import json
import threading
import time
import urllib.request

TEST_RESULTS = {}

class TestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/results':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode()
            data = json.loads(body)
            TEST_RESULTS.update(data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
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
            self.wfile.write(json.dumps(TEST_RESULTS).encode())
            return
        return super().do_GET()

def run_server():
    server = http.server.HTTPServer(('', 9000), TestHandler)
    print("Server running on http://localhost:9000")
    server.serve_forever()

t = threading.Thread(target=run_server, daemon=True)
t.start()
time.sleep(0.5)

print("Server started. Waiting for test results...")
print("Open http://localhost:9000/tests.html in your browser")
print()

# Wait for results
for i in range(60):
    if TEST_RESULTS:
        break
    time.sleep(1)
    if i % 5 == 0 and i > 0:
        print("Still waiting for test results... (%ds)" % i)

if TEST_RESULTS:
    print("\n=== TEST RESULTS ===")
    print("Passed: %s" % TEST_RESULTS.get('passed', '?'))
    print("Failed: %s" % TEST_RESULTS.get('failed', '?'))
    print("Total: %s" % TEST_RESULTS.get('total', '?'))
    if TEST_RESULTS.get('details'):
        print("\nDetails:")
        for d in TEST_RESULTS['details']:
            status = 'PASS' if d.get('passed') else 'FAIL'
            print("  [%s] %s" % (status, d.get('name', '?')))
else:
    print("\nNo results received. Make sure the browser is open to the test page.")
    print("Polling once more...")
    try:
        r = urllib.request.urlopen('http://localhost:9000/poll', timeout=3)
        print("Current results:", r.read().decode())
    except:
        print("Server may not be running.")
