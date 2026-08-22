#!/usr/bin/env python3
"""Build the checked-in Cutline historical-score cache from a Kaggle snapshot."""

from __future__ import annotations

import argparse
from pathlib import Path

from historical_model import write_model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/raw/tmdb-comprehensive-v1"))
    parser.add_argument("--output", type=Path, default=Path("src/data/resident-evil-historical.json"))
    args = parser.parse_args()
    model = write_model(args.source_dir, args.output)
    print(
        f"Wrote {args.output} from {model['audit']['rows']['moviesParsed']} parsed movies; "
        f"cohort n={model['cohort']['sampleSize']}; historical={model['scores']['historicalFit']['value']}; "
        f"talent={model['scores']['talentPrior']['value']}."
    )


if __name__ == "__main__":
    main()
