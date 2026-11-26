"""Verify private Compose startup, restart and restored SQLite reuse."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid

from package_research_oci import ROOT, docker


COMPOSE = ROOT / "apps/research-service/deploy/compose.yaml"
PEER = ROOT / "apps/research-service/tests/private_peer_smoke.py"
PYTHON = "docker.io/library/python:3.14.7-slim-trixie@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d"
CREDENTIALS = "/var/lib/marketweft/credentials/credentials.sqlite"
AUDIT = "/var/lib/marketweft/audit"
HOST = "research.marketweft.test"
PORT = "4174"


def certificate(tls, peer):
    cert, key = tls / "tls.crt", tls / "tls.key"
    subprocess.run([
        "openssl", "req", "-newkey", "rsa:2048", "-x509", "-nodes", "-sha256", "-days", "1",
        "-subj", f"/CN={HOST}", "-addext", f"subjectAltName=DNS:{HOST}",
        "-keyout", str(key), "-out", str(cert),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=25)
    tls.chmod(0o555)
    key.chmod(0o444)
    shutil.copyfile(cert, peer / "tls.crt")


def exercise(image, tls, peer):
    project = f"mwcompose-{uuid.uuid4().hex[:10]}"
    environment = dict(
        os.environ,
        MARKETWEFT_RESEARCH_IMAGE=image, MARKETWEFT_RESEARCH_HOST=HOST, MARKETWEFT_RESEARCH_PORT=PORT,
        MARKETWEFT_RESEARCH_TLS_DIRECTORY=str(tls), MARKETWEFT_RESEARCH_SUBNET="172.30.248.0/24",
        MARKETWEFT_RESEARCH_BIND_IP="172.30.248.10", MARKETWEFT_RESEARCH_AUDIT_FILE="audit.sqlite",
    )

    def compose(*args):
        return docker("compose", "--file", str(COMPOSE), "--project-name", project, *args, env=environment)

    def client():
        docker(
            "run", "--rm", "--network", f"{project}_research",
            "--mount", f"type=bind,source={peer},target=/peer,readonly",
            "--mount", f"type=bind,source={ROOT},target=/repo,readonly",
            PYTHON, "python", "-B", f"/repo/{PEER.relative_to(ROOT).as_posix()}", f"https://{HOST}:{PORT}",
        )

    def start():
        compose("up", "--detach", "--wait", "--wait-timeout", "30", "research")

    def audit(command, source, target, count):
        output = compose(
            "exec", "-T", "research", "marketweft-research-service", "audit", command,
            f"{AUDIT}/{source}.sqlite", f"{AUDIT}/{target}.sqlite",
        )
        assert output.strip() == f"Verified {count} audit receipts, 0 unfinished.".encode()

    try:
        compose("config", "--quiet")
        for scope in ("formula", "screen"):
            issued = compose("run", "--rm", "--no-deps", "-T", "credential-admin",
                             "credential", "issue", CREDENTIALS, scope, "300")
            (peer / f"{scope}.json").write_bytes(issued)
        start()
        container = compose("ps", "-q", "research").decode().strip()
        assert container and not docker("port", container).strip()
        client()
        compose("restart", "research")
        start()
        client()
        audit("backup", "audit", "snapshot", 6)
        audit("restore", "snapshot", "recovered", 6)
        environment["MARKETWEFT_RESEARCH_AUDIT_FILE"] = "recovered.sqlite"
        start()
        client()
        audit("backup", "recovered", "reopened", 9)
    finally:
        compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    try:
        with tempfile.TemporaryDirectory(prefix="marketweft-compose-") as directory:
            tls, peer = Path(directory) / "tls", Path(directory) / "peer"
            tls.mkdir()
            peer.mkdir()
            certificate(tls, peer)
            try:
                exercise(sys.argv[1], tls, peer)
            finally:
                tls.chmod(0o700)
        print("Verified private Compose restart, six recovered receipts and three new receipts.")
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors="replace").strip() or str(error)) from error
