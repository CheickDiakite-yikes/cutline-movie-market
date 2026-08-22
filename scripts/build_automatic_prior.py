#!/usr/bin/env python3
"""Build Cutline's checked-in automatic historical prior."""

from __future__ import annotations

import argparse
from pathlib import Path

from automatic_prior import write_automatic_prior


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/raw/tmdb-comprehensive-v1"))
    parser.add_argument("--output", type=Path, default=Path("src/data/automatic-prior.json"))
    args = parser.parse_args()
    artifact = write_automatic_prior(args.source_dir, args.output)
    print(
        f"Wrote {args.output}; baseline n={artifact['baseline']['sampleSize']}; "
        f"title families={len(artifact['titleFamilies'])}; model={artifact['modelVersion']}."
    )


if __name__ == "__main__":
    main()
