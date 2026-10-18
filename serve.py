#!/usr/bin/env python3
"""Static file server for the configurator with cache disabled,
so edits are always visible after a normal page reload."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

handler = functools.partial(NoCacheHandler, directory='/home/mike/loft-design')
print(f'Serving http://0.0.0.0:{PORT} (no-cache)')
ThreadingHTTPServer(('0.0.0.0', PORT), handler).serve_forever()
