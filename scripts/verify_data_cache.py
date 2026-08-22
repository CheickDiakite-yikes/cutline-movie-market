#!/usr/bin/env python3
"""Verify checked-in model artifacts against the audited raw source files."""

from __future__ import annotations

import json
from pathlib import Path

from critic_outcomes import build_benchmark
from historical_model import build_model, load_market_config


TMDB_DIR = Path("data/raw/tmdb-comprehensive-v1")
CRITIC_FILE = Path("data/raw/rotten-tomatoes-2025-v1/rotten_tomatoes_movies_2025.csv")
CONFIG_DIR = Path("config/markets")
MARKET_OUTPUT_DIR = Path("src/data/markets")


def checked_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Missing checked-in artifact: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def verify_equal(label: str, generated: dict, checked: dict) -> None:
    if generated != checked:
        raise AssertionError(
            f"{label} is stale. Rebuild the data artifacts and review the resulting diff before committing."
        )


def main() -> None:
    if not TMDB_DIR.exists() or not CRITIC_FILE.exists():
        raise FileNotFoundError(
            "Raw sources are missing. Run bash scripts/download_all_data.sh to download and verify them."
        )

    expected_index = []
    for config_path in sorted(CONFIG_DIR.glob("*.json")):
        market = load_market_config(config_path)
        generated = build_model(TMDB_DIR, market=market)
        output_path = MARKET_OUTPUT_DIR / f"{market.slug}.json"
        verify_equal(str(output_path), generated, checked_json(output_path))
        expected_index.append(
            {
                "slug": market.slug,
                "title": market.title,
                "eventTicker": market.kalshi_event_ticker,
                "cache": f"./markets/{market.slug}.json",
                "snapshotDate": generated["source"]["snapshotDate"],
                "modelStatus": "historical prior connected",
            }
        )

    expected_market_index = {"schemaVersion": 1, "markets": expected_index}
    verify_equal("src/data/market-index.json", expected_market_index, checked_json(Path("src/data/market-index.json")))

    critic = build_benchmark(CRITIC_FILE, tmdb_movies_path=TMDB_DIR / "movies.csv")
    verify_equal("src/data/critic-benchmark.json", critic, checked_json(Path("src/data/critic-benchmark.json")))
    print(
        f"Verified {len(expected_index)} market cache(s), the market index, and the critic benchmark against raw source checksums."
    )


if __name__ == "__main__":
    main()
