#!/usr/bin/env python3
"""Exercise the helper from an installed tool against an authenticated local v3 feed."""

import base64
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.etree import ElementTree as ET
import zipfile


def main():
    helpers = list(Path(sys.argv[1]).rglob("NuGetFeedHelper/CodeTestament.NuGetFeed.dll"))
    assert len(helpers) == 1, f"Expected one packaged feed helper, found {len(helpers)}"
    helper = helpers[0].resolve()
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("lib/net8.0/Private.Smoke.dll", b"")
    token = "fixture-credential-not-a-secret"
    authorization = "Basic " + base64.b64encode(f"aws:{token}".encode()).decode()
    authenticated = set()

    class Feed(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get("Authorization") != authorization:
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="fixture"')
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            authenticated.add(self.path)
            body = json.dumps({"version": "3.0.0", "resources": [{
                "@id": f"http://127.0.0.1:{self.server.server_port}/flat/",
                "@type": "PackageBaseAddress/3.0.0",
            }]}).encode() if self.path == "/index.json" else payload.getvalue()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Feed) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory(prefix="codetestament-packaged-feed-") as directory:
                url = f"http://127.0.0.1:{server.server_port}/index.json"
                config = ET.Element("configuration")
                sources = ET.SubElement(config, "packageSources")
                ET.SubElement(sources, "clear")
                ET.SubElement(sources, "add", key="PrivateSmoke", value=url)
                credentials = ET.SubElement(ET.SubElement(config, "packageSourceCredentials"), "PrivateSmoke")
                ET.SubElement(credentials, "add", key="Username", value="aws")
                ET.SubElement(credentials, "add", key="ClearTextPassword", value=token)
                ET.SubElement(credentials, "add", key="ValidAuthenticationTypes", value="basic")
                ET.ElementTree(config).write(Path(directory) / "NuGet.Config", encoding="utf-8")
                request = {"Directory": directory, "Sources": [url], "Package": "private.smoke", "Version": "2.0.0"}
                result = subprocess.run(["dotnet", str(helper)], input=json.dumps(request) + "\n",
                                        text=True, capture_output=True, cwd=directory, timeout=30, check=True)
                assert token not in result.stdout and token not in result.stderr
                response = json.loads(result.stdout)
                assert response["Frameworks"]["Frameworks"] == ["net8.0"], response
                assert response["Reasons"] == [], response
                assert authenticated == {"/index.json", "/flat/private.smoke/2.0.0/private.smoke.2.0.0.nupkg"}, authenticated
        finally:
            server.shutdown()
            worker.join()
    print("Installed NuGet helper: authenticated index and candidate download passed.")


if __name__ == "__main__":
    main()
