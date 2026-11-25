"""Compare the complete vendored GLib backport to its authenticated crate archive."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import tarfile

ARCHIVE_SHA256 = "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5"
PATCHED_SHA256 = "a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc"
PACKAGE = "glib-0.18.5"


def verify(archive: Path) -> None:
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("The archive checksum differs from the crates.io release")
    vendor = Path(__file__).resolve().parent / PACKAGE
    expected_files = set()
    with tarfile.open(archive, "r:gz") as crate:
        for entry in crate:
            if entry.isdir():
                continue
            if not entry.isfile():
                raise ValueError(f"Unexpected archive entry: {entry.name}")
            path = PurePosixPath(entry.name).relative_to(PACKAGE)
            expected_files.add(path.as_posix())
            original = crate.extractfile(entry).read()
            if path.as_posix() == "src/variant_iter.rs":
                for before, after in [
                    (b"let p: *mut libc::c_char =", b"let mut p: *mut libc::c_char ="),
                    (b"                &p,\n", b"                &mut p,\n"),
                ]:
                    if original.count(before) != 1:
                        raise ValueError("Unexpected GLib patch context")
                    original = original.replace(before, after)
                if hashlib.sha256(original).hexdigest() != PATCHED_SHA256:
                    raise ValueError("The backport differs from the reviewed Debian bytes")
            if (vendor / path).read_bytes() != original:
                raise ValueError(f"Vendored content differs: {path}")

    files = set()
    for file in vendor.rglob("*"):
        if file.is_symlink():
            raise ValueError(f"Unexpected symbolic link: {file}")
        if file.is_file():
            files.add(file.relative_to(vendor).as_posix())
    if files != expected_files:
        raise ValueError(f"Unexpected file set: {sorted(files ^ expected_files)}")
    print(f"Verified {len(files)} GLib files against the crate and Debian patch.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("crate", type=Path, help="Original crates.io glib-0.18.5.crate")
    verify(parser.parse_args().crate)
