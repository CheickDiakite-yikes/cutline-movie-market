#!/usr/bin/env python3
"""Build Cutline's checked-in Rotten Tomatoes benchmark cache."""

from __future__ import annotations

import argparse
from pathlib import Path

from critic_outcomes import write_benchmark


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("data/raw/rotten-tomatoes-2025-v1/rotten_tomatoes_movies_2025.csv"),
    )
    parser.add_argument(
        "--tmdb-movies",
        type=Path,
        default=Path("data/raw/tmdb-comprehensive-v1/movies.csv"),
    )
    parser.add_argument("--output", type=Path, default=Path("src/data/critic-benchmark.json"))
    args = parser.parse_args()
    payload = write_benchmark(args.source, args.output, tmdb_movies_path=args.tmdb_movies)
    print(
        f"Wrote {args.output} from {payload['audit']['rawRows']} rows; "
        f"eligible critic outcomes n={payload['audit']['eligibleOutcomeRows']}; "
        f"exact TMDB joins n={payload['audit']['joinToTmdb']['exactMatches']}."
    )


if __name__ == "__main__":
    main()
