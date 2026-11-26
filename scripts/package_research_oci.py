"""Build, inspect, load and exercise the Linux x64 research-service OCI archive."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = ROOT / "apps/research-service/Dockerfile"
FIXTURE = ROOT / "crates/core/tests/fixtures/synthetic-formula-bars.csv"
BUILDKIT = "docker.io/moby/buildkit:v0.30.0@sha256:0168606be2315b7c807a03b3d8aa79beefdb31c98740cebdffdfeebf31190c9f"
EXECUTABLE = "/usr/local/bin/marketweft-research-service"
DATA = "/var/lib/marketweft"


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, capture_output=True, timeout=180, **kwargs).stdout


def build(context, archive, image, version, revision):
    parameters = [
        "--platform", "linux/amd64", "--network", "none",
        "--provenance=false", "--sbom=false",
        "--file", str(DOCKERFILE), "--tag", image,
        "--label", f"org.opencontainers.image.version={version}",
        "--label", f"org.opencontainers.image.revision={revision}",
        "--output", f"type=docker,oci-mediatypes=true,dest={archive}", str(context),
    ]
    try:
        docker("buildx", "build", *parameters)
        return
    except subprocess.CalledProcessError as error:
        diagnostic = error.stderr.decode(errors="replace").lower()
        if "docker driver" not in diagnostic or "not supported" not in diagnostic:
            raise

    builder = f"marketweft-oci-{uuid.uuid4().hex[:10]}"
    docker("buildx", "create", "--driver", "docker-container", "--name", builder,
           "--driver-opt", f"image={BUILDKIT}")
    try:
        docker("buildx", "build", "--builder", builder, *parameters)
    finally:
        docker("buildx", "rm", builder)


def inspect(archive, version, revision):
    with tarfile.open(archive) as image:
        def blob_path(descriptor):
            algorithm, digest = descriptor["digest"].split(":")
            assert algorithm == "sha256"
            return f"blobs/sha256/{digest}"

        def blob(descriptor):
            path = blob_path(descriptor)
            digest = path.rsplit("/", 1)[-1]
            with image.extractfile(path) as source:
                content = source.read()
            assert len(content) == descriptor["size"], digest
            assert hashlib.sha256(content).hexdigest() == digest
            return content

        assert json.load(image.extractfile("oci-layout"))["imageLayoutVersion"] == "1.0.0"
        index = json.load(image.extractfile("index.json"))
        assert index["schemaVersion"] == 2
        descriptor, = index["manifests"]
        assert descriptor["mediaType"] == "application/vnd.oci.image.manifest.v1+json"
        manifest = json.loads(blob(descriptor))
        compatible, = json.load(image.extractfile("manifest.json"))
        assert compatible["Config"] == blob_path(manifest["config"])
        assert compatible["Layers"] == [blob_path(layer) for layer in manifest["layers"]]
        configuration = json.loads(blob(manifest["config"]))
        for layer in manifest["layers"]:
            blob(layer)
        assert (configuration["os"], configuration["architecture"]) == ("linux", "amd64")
        settings = configuration["config"]
        assert settings["User"] == "65532:65532" and settings["Entrypoint"] == [EXECUTABLE]
        assert settings["Labels"]["org.opencontainers.image.version"] == version
        assert settings["Labels"]["org.opencontainers.image.revision"] == revision


def smoke(archive, image, binary_digest):
    docker("load", "--input", str(archive))
    unique = uuid.uuid4().hex[:10]
    container = f"marketweft-oci-test-{unique}"
    credentials = f"marketweft-oci-credentials-{unique}"
    audit = f"marketweft-oci-audit-{unique}"
    security = [
        "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
    ]
    credential_mount = f"type=volume,source={credentials},target={DATA}/credentials"
    audit_mount = f"type=volume,source={audit},target={DATA}/audit"
    credential_db = f"{DATA}/credentials/credentials.sqlite"
    audit_db = f"{DATA}/audit/audit.sqlite"
    volumes = []
    launched = False
    try:
        for volume in (credentials, audit):
            docker("volume", "create", volume)
            volumes.append(volume)
        issued = json.loads(docker("run", "--rm", *security, "--mount", credential_mount, image,
                                   "credential", "issue", credential_db, "formula", "120"))
        docker("run", "--detach", "--name", container, *security,
               "--mount", f"{credential_mount},readonly", "--mount", audit_mount,
               "--env", f"MARKETWEFT_RESEARCH_CREDENTIALS_DB={credential_db}",
               "--env", f"MARKETWEFT_RESEARCH_AUDIT_DB={audit_db}", image)
        launched = True
        for _ in range(50):
            if b"http://127.0.0.1:4174" in docker("logs", container):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("The packaged research process did not start.")
        assert docker("exec", container, "id", "-u").strip() == b"65532"
        docker("exec", container, "test", "!", "-w", credential_db)
        identity = docker("exec", container, "sha256sum", EXECUTABLE).decode().split()[0]
        assert identity == binary_digest

        body = json.dumps({
            "formula": "close + 0.000001", "history_csv": FIXTURE.read_text(encoding="utf-8"), "limit": 1,
        }).encode()
        request = (
            "POST /v1/formula HTTP/1.1\r\nHost: 127.0.0.1:4174\r\n"
            f"Authorization: Bearer {issued['token']}\r\nContent-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n"
        ).encode() + body
        response = docker("exec", "-i", container, "bash", "-euc",
                          "exec 3<>/dev/tcp/127.0.0.1/4174; cat >&3; cat <&3", input=request)
        headers, _, payload = response.partition(b"\r\n\r\n")
        assert headers.startswith(b"HTTP/1.1 200 ")
        assert json.loads(payload)["rows"][0]["value_ticks"] == "10000001"
        report = docker("exec", container, EXECUTABLE, "audit", "backup", audit_db, f"{DATA}/audit/snapshot.sqlite")
        assert report.strip() == b"Verified 1 audit receipts, 0 unfinished."
    finally:
        if launched:
            docker("rm", "--force", container)
        for volume in volumes:
            docker("volume", "rm", volume)


def main(source):
    version = json.loads((ROOT / "package.json").read_text())["version"]
    expected = f"MarketWeft-research-service-{version}-linux-x64.tar.gz"
    if source.name != expected:
        raise ValueError(f"Use the matching native package {expected}")
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    archive = ROOT / "reports" / f"MarketWeft-research-service-{version}-linux-x64-oci.tar"
    image = f"marketweft-research:{version}"
    archive.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="research-oci-") as directory:
        context = Path(directory)
        with tarfile.open(source) as package:
            package.extractall(context, filter="data")
        binary = context / Path(EXECUTABLE).name
        binary_digest = hashlib.sha256(binary.read_bytes()).hexdigest()
        build(context, archive, image, version, revision)
        inspect(archive, version, revision)
        smoke(archive, image, binary_digest)
    print(f"Verified and exercised {archive.name} as UID 65532.")


if __name__ == "__main__":
    try:
        main(Path(sys.argv[1]).resolve())
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors="replace").strip() or str(error)) from error
