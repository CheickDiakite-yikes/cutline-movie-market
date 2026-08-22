#!/usr/bin/env python3
"""Build checked-in Cutline market caches from the audited TMDB snapshot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from historical_model import load_market_config, write_model


DEFAULT_CONFIG_DIR = Path("config/markets")
DEFAULT_OUTPUT_DIR = Path("src/data/markets")


def build_one(source_dir: Path, config_path: Path, output_path: Path | None = None) -> tuple[dict, Path]:
    market = load_market_config(config_path)
    destination = output_path or DEFAULT_OUTPUT_DIR / f"{market.slug}.json"
    model = write_model(source_dir, destination, market=market)
    print(
        f"Wrote {destination} from {model['audit']['rows']['moviesParsed']} parsed movies; "
        f"cohort n={model['cohort']['sampleSize']}; historical={model['scores']['historicalFit']['value']}; "
        f"talent={model['scores']['talentPrior']['value']}."
    )
    return model, destination


def write_index(config_paths: list[Path], output_path: Path = Path("src/data/market-index.json")) -> None:
    items = []
    for config_path in sorted(config_paths):
        market = load_market_config(config_path)
        cache_path = DEFAULT_OUTPUT_DIR / f"{market.slug}.json"
        if not cache_path.exists():
            continue
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        items.append(
            {
                "slug": market.slug,
                "title": market.title,
                "eventTicker": market.kalshi_event_ticker,
                "cache": f"./markets/{market.slug}.json",
                "snapshotDate": cache["source"]["snapshotDate"],
                "modelStatus": "historical prior connected",
            }
        )
    payload = {"schemaVersion": 1, "markets": items}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_path} with {len(items)} configured market(s).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/raw/tmdb-comprehensive-v1"))
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_DIR / "resident-evil.json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--all", action="store_true", help="Build every config under config/markets")
    args = parser.parse_args()
    config_paths = sorted(DEFAULT_CONFIG_DIR.glob("*.json")) if args.all else [args.config]
    if not config_paths:
        raise FileNotFoundError("No market configurations found")
    if args.output and len(config_paths) != 1:
        raise ValueError("--output can only be used with a single --config")
    for config_path in config_paths:
        build_one(args.source_dir, config_path, args.output)
    write_index(sorted(DEFAULT_CONFIG_DIR.glob("*.json")))


if __name__ == "__main__":
    main()
