#!/usr/bin/env python3
"""Build Cutline's checked-in upcoming-film enrichment catalog."""

from __future__ import annotations

import argparse
from pathlib import Path

from target_enrichment import write_target_enrichment


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/raw/tmdb-comprehensive-v1"))
    parser.add_argument("--output", type=Path, default=Path("src/data/target-enrichment.json"))
    args = parser.parse_args()
    artifact = write_target_enrichment(args.source_dir, args.output)
    print(
        f"Wrote {args.output}; candidates={artifact['resolution']['candidateCount']}; "
        f"title keys={len(artifact['titleIndex'])}; model={artifact['modelVersion']}."
    )


if __name__ == "__main__":
    main()
