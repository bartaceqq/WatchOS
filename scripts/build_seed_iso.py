from __future__ import annotations

import argparse
from pathlib import Path

import pycdlib


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a NoCloud seed ISO for the WatchOS VirtualBox appliance."
    )
    parser.add_argument("--user-data", required=True, type=Path)
    parser.add_argument("--meta-data", required=True, type=Path)
    parser.add_argument("--network-config", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    iso = pycdlib.PyCdlib()
    iso.new(
        interchange_level=3,
        joliet=3,
        rock_ridge="1.09",
        vol_ident="CIDATA",
    )
    iso.add_file(
        str(args.user_data),
        iso_path="/USER_DAT.;1",
        rr_name="user-data",
        joliet_path="/user-data",
    )
    iso.add_file(
        str(args.meta_data),
        iso_path="/META_DAT.;1",
        rr_name="meta-data",
        joliet_path="/meta-data",
    )
    if args.network_config:
        iso.add_file(
            str(args.network_config),
            iso_path="/NETWORK_.;1",
            rr_name="network-config",
            joliet_path="/network-config",
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    iso.write(str(args.output))
    iso.close()


if __name__ == "__main__":
    main()
