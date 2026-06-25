#!/usr/bin/env python3
"""Static dev server that disables caching, so edits always show on refresh."""
import http.server, socketserver

PORT = 5180

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"serving http://localhost:{PORT} (no-cache)")
    httpd.serve_forever()
