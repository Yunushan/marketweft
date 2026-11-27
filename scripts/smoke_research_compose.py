"""Verify private Compose restart and recovery in existing and fresh volumes."""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
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
RECEIPTS_PER_PEER = 5
SNAPSHOT_RECEIPTS = 2 * RECEIPTS_PER_PEER
RECOVERED_RECEIPTS = SNAPSHOT_RECEIPTS + RECEIPTS_PER_PEER


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


def exercise(image, tls, peer, restore_from=None):
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

    def export(name, destination):
        compose("cp", f"research:{AUDIT}/{name}.sqlite", str(destination))
        return destination

    try:
        compose("config", "--quiet")
        for scope in ("formula", "screen"):
            issued = compose("run", "--rm", "--no-deps", "-T", "credential-admin",
                             "credential", "issue", CREDENTIALS, scope, "300")
            (peer / f"{scope}.json").write_bytes(issued)
        if restore_from is not None:
            source = "/transfer/snapshot.sqlite"
            operator = ("run", "--rm", "--no-deps", "-T", "--volume", f"{restore_from}:{source}:ro", "audit-admin")
            verification = json.loads(compose(*operator, "audit", "verify", source))
            assert verification == {
                "schema_version": 2, "receipts": SNAPSHOT_RECEIPTS, "unfinished": 0,
                "bytes": restore_from.stat().st_size,
                "sha256": hashlib.sha256(restore_from.read_bytes()).hexdigest(),
            }
            try:
                compose(*operator, "audit", "restore", source, f"{AUDIT}/audit.sqlite", "--sha256", "0" * 64)
            except subprocess.CalledProcessError as error:
                assert b"did not match the expected digest" in error.stderr, error.stderr
            else:
                raise AssertionError("An incorrect snapshot digest was accepted.")
            restored = compose(*operator, "audit", "restore", source, f"{AUDIT}/audit.sqlite",
                               "--sha256", verification["sha256"])
            assert restored.strip() == f"Verified {SNAPSHOT_RECEIPTS} audit receipts, 0 unfinished.".encode()
        start()
        container = compose("ps", "-q", "research").decode().strip()
        assert container and not docker("port", container).strip()
        client()
        if restore_from is not None:
            audit("backup", "audit", "destination", RECOVERED_RECEIPTS)
            return export("destination", peer / "audit-destination.sqlite")
        compose("restart", "research")
        start()
        client()
        audit("backup", "audit", "snapshot", SNAPSHOT_RECEIPTS)
        audit("restore", "snapshot", "recovered", SNAPSHOT_RECEIPTS)
        environment["MARKETWEFT_RESEARCH_AUDIT_FILE"] = "recovered.sqlite"
        start()
        client()
        audit("backup", "recovered", "reopened", RECOVERED_RECEIPTS)
        return export("snapshot", peer / "audit-source.sqlite")
    finally:
        compose("down", "--volumes", "--remove-orphans")


def receipts(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)) as database:
        assert database.execute("PRAGMA quick_check").fetchone() == ("ok",)
        return database.execute(
            "SELECT receipt_id, transport, scope, started_at, finished_at, outcome "
            "FROM research_receipts ORDER BY receipt_id"
        ).fetchall()


if __name__ == "__main__":
    try:
        with tempfile.TemporaryDirectory(prefix="marketweft-compose-") as directory:
            tls, peer = Path(directory) / "tls", Path(directory) / "peer"
            tls.mkdir()
            peer.mkdir()
            certificate(tls, peer)
            try:
                source = exercise(sys.argv[1], tls, peer)
                source.chmod(0o444)
                try:
                    destination = exercise(sys.argv[1], tls, peer, restore_from=source)
                finally:
                    source.chmod(0o600)
                original, recovered = receipts(source), receipts(destination)
                assert len(original) == SNAPSHOT_RECEIPTS and recovered[:SNAPSHOT_RECEIPTS] == original
                assert [row[0] for row in recovered[SNAPSHOT_RECEIPTS:]] == list(
                    range(SNAPSHOT_RECEIPTS + 1, RECOVERED_RECEIPTS + 1)
                )
                assert [row[2] for row in recovered[-RECEIPTS_PER_PEER:]] == ["formula", "screen", "screen", "screen", "screen"]
                assert all(row[-1] == "completed" for row in recovered)
            finally:
                tls.chmod(0o700)
        print("Verified private Compose restart and receipt continuity after a separate fresh-volume restore.")
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors="replace").strip() or str(error)) from error
