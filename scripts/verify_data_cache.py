#!/usr/bin/env python3
"""Verify checked-in model artifacts against the audited raw source files."""

from __future__ import annotations

import json
from pathlib import Path

from automatic_prior import build_automatic_prior
from critic_outcomes import build_benchmark
from historical_model import build_model, load_market_config
from target_enrichment import build_target_enrichment


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

    automatic_prior = build_automatic_prior(TMDB_DIR)
    verify_equal(
        "src/data/automatic-prior.json",
        automatic_prior,
        checked_json(Path("src/data/automatic-prior.json")),
    )

    target_enrichment = build_target_enrichment(TMDB_DIR)
    verify_equal(
        "src/data/target-enrichment.json",
        target_enrichment,
        checked_json(Path("src/data/target-enrichment.json")),
    )

    critic = build_benchmark(CRITIC_FILE, tmdb_movies_path=TMDB_DIR / "movies.csv")
    verify_equal("src/data/critic-benchmark.json", critic, checked_json(Path("src/data/critic-benchmark.json")))
    print(
        f"Verified {len(expected_index)} configured market cache(s), the automatic prior, the target-enrichment catalog, the market index, and the critic benchmark against raw source checksums."
    )


if __name__ == "__main__":
    main()
