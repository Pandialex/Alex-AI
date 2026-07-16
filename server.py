#!/usr/bin/env python3
"""
Alex-AI local server.

Serves the static site AND proxies /v1/* to the NVIDIA API, injecting the
API key server-side. This keeps the key out of the browser and works around
NVIDIA's lack of CORS support (which causes "Failed to fetch" on direct
browser calls).

Run:
    python server.py

Then open http://localhost:8000

Standard library only — no pip install required.
"""

import http.client
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))

# ---- config (from .env, with sane defaults) --------------------------------
def load_env(path):
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                env[key.strip()] = val.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env

ENV = load_env(os.path.join(ROOT, ".env"))
API_KEY = ENV.get("API_KEY") or ENV.get("GROQ_API_KEY") or os.environ.get("API_KEY", "")
UPSTREAM_HOST = ENV.get("UPSTREAM_HOST", "integrate.api.nvidia.com")
PORT = int(ENV.get("PORT", os.environ.get("PORT", "8000")))

# Headers we must not blindly forward.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length", "host",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # connection-close => simple streaming

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- CORS preflight (only needed if site is opened on another origin) --
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        if self._is_api():
            self._proxy("GET")
        else:
            self._serve_static()

    def do_POST(self):
        if self._is_api():
            self._proxy("POST")
        else:
            self.send_error(404, "Not found")

    # ---- helpers -----------------------------------------------------------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")

    def _is_api(self):
        return urlsplit(self.path).path.startswith("/v1/")

    def _proxy(self, method):
        if not API_KEY:
            self.send_error(500, "Server has no API_KEY (set it in .env)")
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None

        out_headers = {
            "Authorization": "Bearer " + API_KEY,
            "Accept": self.headers.get("Accept", "application/json"),
        }
        ctype = self.headers.get("Content-Type")
        if ctype:
            out_headers["Content-Type"] = ctype

        try:
            conn = http.client.HTTPSConnection(UPSTREAM_HOST, timeout=120)
            conn.request(method, self.path, body=body, headers=out_headers)
            resp = conn.getresponse()
        except Exception as exc:  # upstream unreachable
            self.send_error(502, "Upstream error: %s" % exc)
            return

        self.send_response(resp.status)
        self._cors()
        for key, val in resp.getheaders():
            if key.lower() in HOP_BY_HOP:
                continue
            self.send_header(key, val)
        self.end_headers()

        # Stream the body through so SSE tokens arrive live. read1() returns
        # data as soon as it's available instead of blocking for a full buffer.
        try:
            while True:
                chunk = resp.read1(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # client navigated away / stopped generating
        finally:
            conn.close()

    def _serve_static(self):
        path = urlsplit(self.path).path
        if path == "/":
            path = "/index.html"
        # Resolve safely inside ROOT to prevent path traversal.
        rel = os.path.normpath(path.lstrip("/")).replace("\\", "/")
        full = os.path.join(ROOT, *rel.split("/"))
        if not os.path.abspath(full).startswith(ROOT) or not os.path.isfile(full):
            self.send_error(404, "Not found")
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    if not API_KEY:
        print("WARNING: no API_KEY found in .env — chat requests will fail.\n")
    print("Alex-AI running at  http://localhost:%d" % PORT)
    print("Proxying /v1/* -> https://%s/v1/*" % UPSTREAM_HOST)
    print("Press Ctrl+C to stop.\n")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
