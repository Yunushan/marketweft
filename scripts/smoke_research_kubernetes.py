"""Exercise the release OCI image in a disposable Kubernetes cluster."""
from base64 import b64encode
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import uuid

from package_research_oci import ROOT, docker
from smoke_research_compose import AUDIT, CREDENTIALS, PEER, PYTHON


LAYOUT = ROOT / "apps/research-service/deploy/kubernetes"
FIXTURES = ROOT / "crates/core/tests/fixtures"
NODE_IMAGE = "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5"
NAMESPACE = "marketweft-research"
SERVICE = "marketweft-research"
DEPLOYMENT = f"deployment/{SERVICE}"
HOST = f"{SERVICE}.{NAMESPACE}.svc.cluster.local"
WAIT_FOR_PEER_TLS = b"""
import socket
import ssl
import sys
import time

host = sys.argv[1]
trust = ssl.create_default_context(cafile="/peer/tls.crt")
deadline = time.monotonic() + 30
while True:
    try:
        with socket.create_connection((host, 4174), timeout=2) as connection:
            with trust.wrap_socket(connection, server_hostname=host):
                break
    except (ConnectionRefusedError, TimeoutError):
        if time.monotonic() >= deadline:
            raise
        time.sleep(0.25)
"""


def command(*args, timeout=240):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout).stdout


def fixture_pod(name, image, credentials=False):
    spec = {
        "automountServiceAccountToken": False,
        "containers": [{
            "name": "fixture",
            "image": image,
            "imagePullPolicy": "Never",
            "command": ["sleep", "900"],
        }],
    }
    labels = {}
    if credentials:
        spec["securityContext"] = {
            "runAsNonRoot": True, "runAsUser": 65532, "runAsGroup": 65532, "fsGroup": 65532,
        }
        spec["containers"][0]["volumeMounts"] = [{
            "name": "credentials", "mountPath": "/var/lib/marketweft/credentials",
        }]
        spec["volumes"] = [{
            "name": "credentials", "persistentVolumeClaim": {"claimName": "research-credentials"},
        }]
    else:
        labels["marketweft-research-access"] = "authorized"
    return json.dumps({
        "apiVersion": "v1", "kind": "Pod",
        "metadata": {"name": name, "labels": labels}, "spec": spec,
    }).encode()


def exercise(archive, temporary):
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    cluster = f"marketweft-{uuid.uuid4().hex[:8]}"
    test_image = f"marketweft-kubernetes-peer:{cluster}"
    test_archive = temporary / "peer.tar"
    node = f"{cluster}-control-plane"
    config = str(temporary / "kubeconfig")
    cert, key = temporary / "tls.crt", temporary / "tls.key"

    def kube(*args, content=None):
        return docker("exec", "-i", node, "kubectl", "--kubeconfig", "/etc/kubernetes/admin.conf",
                      "--namespace", NAMESPACE, *args, input=content)

    def wait_for_research():
        kube("rollout", "status", DEPLOYMENT, "--timeout=110s")

    def put(path, data):
        kube("exec", "-i", "research-peer", "--", "sh", "-c", 'cat > "$1"', "sh", path, content=data)

    def client(stage):
        print(f"Checking peer HTTPS {stage}.", flush=True)
        kube("exec", "-i", "research-peer", "--", "python", "-B", "-", HOST, content=WAIT_FOR_PEER_TLS)
        kube("exec", "-i", "research-peer", "--", "python", "-B", "-",
             f"https://{HOST}:4174", content=PEER.read_bytes())

    def audit(operation, source, destination, count):
        output = kube("exec", DEPLOYMENT, "--", "marketweft-research-service", "audit", operation,
                      f"{AUDIT}/{source}.sqlite", f"{AUDIT}/{destination}.sqlite")
        expected = f"Verified {count} audit receipts, 0 unfinished.".encode()
        assert output.strip() == expected, output

    command("openssl", "req", "-newkey", "rsa:2048", "-x509", "-nodes", "-sha256", "-days", "1",
            "-subj", f"/CN={HOST}", "-addext", f"subjectAltName=DNS:{HOST}",
            "-keyout", str(key), "-out", str(cert), timeout=25)
    docker("pull", "--platform", "linux/amd64", PYTHON)
    docker("tag", PYTHON, test_image)
    try:
        docker("image", "save", "--platform", "linux/amd64", "--output", str(test_archive), test_image)
        command("kind", "create", "cluster", "--name", cluster, "--image", NODE_IMAGE,
                "--kubeconfig", config, "--wait", "100s")
        command("kind", "load", "image-archive", "--name", cluster, str(archive))
        command("kind", "load", "image-archive", "--name", cluster, str(test_archive))
        sources = BytesIO()
        with tarfile.open(fileobj=sources, mode="w") as bundle:
            bundle.add(LAYOUT, arcname="marketweft-layout")
        docker("exec", "-i", node, "tar", "-xf", "-", "-C", "/tmp", input=sources.getvalue())
        rendered = kube("kustomize", "/tmp/marketweft-layout")
        kube("apply", "-f", "-", content=(LAYOUT / "namespace.yaml").read_bytes())
        kube("apply", "-f", "-", content=(LAYOUT / "storage.yaml").read_bytes())
        secret = {
            "apiVersion": "v1", "kind": "Secret", "metadata": {"name": "research-tls"},
            "type": "kubernetes.io/tls",
            "data": {file.name: b64encode(file.read_bytes()).decode() for file in (cert, key)},
        }
        kube("create", "-f", "-", content=json.dumps(secret).encode())
        kube("apply", "-f", "-", content=fixture_pod("credentials-fixture", f"marketweft-research:{version}", True))
        kube("apply", "-f", "-", content=fixture_pod("research-peer", test_image))
        kube("wait", "--for=condition=Ready", "pod/credentials-fixture", "pod/research-peer", "--timeout=100s")
        kube("exec", "research-peer", "--", "mkdir", "-p", "/peer", "/repo/crates/core/tests/fixtures")
        put("/peer/tls.crt", cert.read_bytes())
        for scope in ("formula", "screen"):
            issued = kube("exec", "credentials-fixture", "--", "marketweft-research-service",
                          "credential", "issue", CREDENTIALS, scope, "600")
            put(f"/peer/{scope}.json", issued)
        kube("delete", "pod/credentials-fixture", "--timeout=80s")
        for filename in ("synthetic-formula-bars.csv", "synthetic-universe.csv", "synthetic-universe-prices.csv"):
            put(f"/repo/crates/core/tests/fixtures/{filename}", (FIXTURES / filename).read_bytes())
        kube("apply", "-f", "-", content=rendered)
        wait_for_research()
        service = json.loads(kube("get", "service", SERVICE, "-o", "json"))["spec"]
        assert service["type"] == "ClusterIP" and not service.get("externalIPs")
        assert kube("exec", DEPLOYMENT, "--", "id", "-u").strip() == b"65532"
        client("after startup")
        kube("rollout", "restart", DEPLOYMENT)
        wait_for_research()
        client("after restart")
        audit("backup", "audit", "snapshot", 6)
        audit("restore", "snapshot", "recovered", 6)
        kube("set", "env", DEPLOYMENT, f"MARKETWEFT_RESEARCH_AUDIT_DB={AUDIT}/recovered.sqlite")
        wait_for_research()
        client("with the restored ledger")
        audit("backup", "recovered", "reopened", 9)
    except (subprocess.CalledProcessError, AssertionError):
        for resources in (("get", "pods,service,endpointslices", "-o", "wide"),
                          ("logs", DEPLOYMENT, "--tail=15")):
            try:
                print(kube(*resources).decode(errors="replace"), file=sys.stderr)
            except subprocess.CalledProcessError:
                pass
        raise
    finally:
        try:
            command("kind", "delete", "cluster", "--name", cluster, "--kubeconfig", config)
        finally:
            docker("image", "rm", test_image)


if __name__ == "__main__":
    try:
        with tempfile.TemporaryDirectory(prefix="marketweft-kind-") as directory:
            exercise(Path(sys.argv[1]).resolve(strict=True), Path(directory))
        print("Verified Kubernetes startup, restart, six recovered receipts and three new receipts.")
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors="replace").strip() or str(error)) from error
