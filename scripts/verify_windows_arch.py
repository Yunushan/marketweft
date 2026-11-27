"""Check the PE machine field of Windows build outputs."""

import argparse
from pathlib import Path
from struct import unpack_from

MACHINES = {"x64": 0x8664, "arm64": 0xAA64}


def pe_machine(binary: Path) -> int:
    with binary.open("rb") as file:
        dos = file.read(64)
        if len(dos) != 64 or not dos.startswith(b"MZ"):
            raise ValueError(f"{binary} does not have a complete DOS header")
        offset, = unpack_from("<I", dos, 60)
        if offset < len(dos):
            raise ValueError(f"{binary} has an invalid PE header offset")
        file.seek(offset)
        header = file.read(6)
    if len(header) != 6 or not header.startswith(b"PE\0\0"):
        raise ValueError(f"{binary} does not have a complete PE machine field")
    machine, = unpack_from("<H", header, 4)
    return machine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("architecture", choices=MACHINES)
    parser.add_argument("binaries", type=Path, nargs="+")
    args = parser.parse_args()
    expected = MACHINES[args.architecture]
    for binary in args.binaries:
        try:
            machine = pe_machine(binary)
        except (OSError, ValueError) as error:
            parser.error(str(error))
        if machine != expected:
            parser.error(f"{binary} machine 0x{machine:04x} differs from expected 0x{expected:04x}")
        print(f"{binary} PE architecture {args.architecture} (0x{machine:04x})")


if __name__ == "__main__":
    main()
