"""Local CORS bridge from HELURIO (port 8000) to StartLux (port 8090)."""

import json
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "http://127.0.0.1:8090"
ALLOWED_ORIGINS = {
    "https://startlux-kids-fit.helios-li6767.chatgpt.site",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        request = urllib.request.Request(
            f"{UPSTREAM}{self.path}",
            data=body,
            method=self.command,
            headers={"Content-Type": self.headers.get("Content-Type", "application/json")},
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = response.read()
                status = response.status
                content_type = response.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as error:
            payload = error.read()
            status = error.code
            content_type = error.headers.get("Content-Type", "application/json")
        except Exception as error:
            payload = json.dumps({"error": f"StartLux upstream unavailable: {error}"}).encode()
            status = 502
            content_type = "application/json"
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    do_GET = _proxy
    do_POST = _proxy

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print("HELURIO StartLux bridge: http://127.0.0.1:8000 -> http://127.0.0.1:8090", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()

