import http.server
import json
import sys
import socketserver

RESULTS = {}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/results'):
            parts = self.path.split('?')
            if len(parts) > 1:
                data = parts[1]
                RESULTS['raw'] = data
                print("\n=== RESULTS CAPTURED ===")
                print(data)
            self.send_response(204)
            self.end_headers()
        else:
            super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode()
        try:
            data = json.loads(body)
            RESULTS.update(data)
            with open('_test_output.json', 'w') as f:
                json.dump(data, f)
            print("\n=== TEST RESULTS ===")
            print("Passed: %d / %d" % (data.get('passed', 0), data.get('total', 0)))
            print("Failed: %d" % data.get('failed', 0))
            if data.get('failed', 0) == 0:
                print("🎉 ALL TESTS PASSED!")
            else:
                print("⚠️  SOME TESTS FAILED")
        except:
            RESULTS['raw'] = body
            print("\n=== RAW RESULT ===")
            print(body)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'ok')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9000
httpd = socketserver.TCPServer(('', PORT), Handler)
print("Test server on http://localhost:%d" % PORT)
print("Open http://localhost:%d/tests.html in browser" % PORT)
print("Waiting for test results...")
httpd.serve_forever()
