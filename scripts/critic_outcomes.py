"""Audited Rotten Tomatoes outcome benchmark for Cutline.

This source supplies historical Tomatometer labels and distribution checks. It
does not become a target probability until a sufficiently large, time-aware
join to pre-release features has been validated.
"""

from __future__ import annotations

import ast
import csv
import hashlib
import json
import re
import statistics
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Iterable


DATASET_SLUG = "crawlfeeds/rotten-tomatoes-movies-1000-films-dataset-2024"
DATASET_VERSION = 1
DATASET_LAST_UPDATED = "2025-07-18T15:45:47.747Z"
DATASET_LICENSE = "CC BY-NC-SA 4.0"
ARCHIVE_SHA256 = "05a770d8c5198ae0ed5268810b9895e7680a6a0914ced456be6b4b0acc5c28de"
MIN_CRITIC_REVIEWS = 5
THRESHOLDS = (75, 80, 85)


def safe_int(value: str | int | None) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def eligible_outcome(row: dict[str, str], min_reviews: int = MIN_CRITIC_REVIEWS) -> bool:
    score = safe_int(row.get("tomatometer_movie_rating"))
    reviews = safe_int(row.get("tomatometer_reviews_count"))
    return bool(
        row.get("type") == "Movie"
        and score is not None
        and 0 <= score <= 100
        and reviews is not None
        and reviews >= min_reviews
    )


def strict_threshold_rate(scores: Iterable[int], threshold: int) -> dict:
    values = list(scores)
    wins = sum(score > threshold for score in values)
    return {
        "threshold": threshold,
        "sampleSize": len(values),
        "aboveCount": wins,
        "aboveRate": round(wins / len(values), 4) if values else None,
        "rule": f"Tomatometer strictly above {threshold}",
    }


def normalized_title(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", ascii_value.casefold())


def release_year(row: dict[str, str]) -> int | None:
    candidates = [row.get("release_date") or ""]
    try:
        info = ast.literal_eval(row.get("movie_info") or "[]")
        candidates.extend(
            str(value)
            for item in info
            if isinstance(item, dict)
            for key, value in item.items()
            if "Release Date" in key
        )
    except (SyntaxError, ValueError):
        pass
    for value in candidates:
        match = re.search(r"(?:19|20)\d{2}", value)
        if match:
            return int(match.group())
    return None


def exact_title_year_join(rows: list[dict[str, str]], tmdb_movies_path: Path | None) -> dict:
    if not tmdb_movies_path or not tmdb_movies_path.exists():
        return {"status": "not checked", "exactMatches": None, "ambiguousMatches": None}
    tmdb_rows = read_rows(tmdb_movies_path)
    index: dict[tuple[str, int], int] = Counter()
    for movie in tmdb_rows:
        year = safe_int((movie.get("release_date") or "")[:4])
        if year:
            index[(normalized_title(movie.get("title") or ""), year)] += 1
    exact = 0
    ambiguous = 0
    with_year = 0
    for row in rows:
        year = release_year(row)
        if not year:
            continue
        with_year += 1
        count = index.get((normalized_title(row.get("name") or ""), year), 0)
        exact += int(count == 1)
        ambiguous += int(count > 1)
    return {
        "status": "audited",
        "eligibleRowsWithYear": with_year,
        "exactMatches": exact,
        "ambiguousMatches": ambiguous,
        "method": "normalized exact title plus release year",
    }


def build_benchmark(source_path: Path, tmdb_movies_path: Path | None = None) -> dict:
    rows = read_rows(source_path)
    eligible = [row for row in rows if eligible_outcome(row)]
    scores = [safe_int(row["tomatometer_movie_rating"]) for row in eligible]
    score_values = [score for score in scores if score is not None]
    genre_scores: dict[str, list[int]] = {}
    for row, score in zip(eligible, score_values):
        for genre in (part.strip() for part in (row.get("genre") or "").split(",")):
            if genre:
                genre_scores.setdefault(genre, []).append(score)
    genre_benchmarks = [
        {
            "genre": genre,
            "sampleSize": len(values),
            "medianScore": statistics.median(values),
            "above75Rate": strict_threshold_rate(values, 75)["aboveRate"],
        }
        for genre, values in sorted(genre_scores.items())
        if len(values) >= 10
    ]
    join_audit = exact_title_year_join(eligible, tmdb_movies_path)
    score_present = sum(safe_int(row.get("tomatometer_movie_rating")) is not None for row in rows)
    review_present = sum(safe_int(row.get("tomatometer_reviews_count")) is not None for row in rows)
    unique_ids = [row.get("uniq_id") for row in rows if row.get("uniq_id")]

    return {
        "schemaVersion": 1,
        "source": {
            "name": "Rotten Tomatoes Movies 1000 Films Dataset 2025",
            "kaggleSlug": DATASET_SLUG,
            "kaggleUrl": f"https://www.kaggle.com/datasets/{DATASET_SLUG}",
            "version": DATASET_VERSION,
            "snapshotDate": "2025-07-18",
            "lastUpdated": DATASET_LAST_UPDATED,
            "license": DATASET_LICENSE,
            "licenseNote": "Kaggle API metadata reports CC BY-NC-SA 4.0 while the publisher description says CC BY 4.0; Cutline follows the more restrictive API label.",
            "provenance": "Publisher-compiled Rotten Tomatoes page snapshot; not an official Rotten Tomatoes API feed.",
            "commercialUse": "Treat as non-commercial unless separate rights are established.",
            "archiveSha256": ARCHIVE_SHA256,
            "fileSha256": sha256(source_path),
        },
        "audit": {
            "rawRows": len(rows),
            "eligibleOutcomeRows": len(eligible),
            "minimumCriticReviews": MIN_CRITIC_REVIEWS,
            "scorePresentRows": score_present,
            "reviewCountPresentRows": review_present,
            "missingScorePercent": round((len(rows) - score_present) / len(rows) * 100, 1),
            "missingReviewCountPercent": round((len(rows) - review_present) / len(rows) * 100, 1),
            "duplicateUniqueIds": len(unique_ids) - len(set(unique_ids)),
            "scoreRange": [min(score_values), max(score_values)],
            "scoreMedian": statistics.median(score_values),
            "joinToTmdb": join_audit,
        },
        "thresholdBenchmarks": [strict_threshold_rate(score_values, threshold) for threshold in THRESHOLDS],
        "genreBenchmarks": sorted(genre_benchmarks, key=lambda item: (-item["sampleSize"], item["genre"])),
        "calibration": {
            "status": "unavailable",
            "reason": f"Only {join_audit.get('exactMatches')} eligible exact title/year matches resolve to the selected TMDB snapshot; that is insufficient for a time-aware probability model.",
            "requiredNext": "Build a larger rights-cleared crosswalk, recreate features using only information available before each release, and validate on forward time splits.",
        },
        "usage": {
            "connectedAs": "critic outcome benchmark",
            "notUsedAs": "target probability, model edge, or entry price",
        },
    }


def write_benchmark(source_path: Path, output_path: Path, tmdb_movies_path: Path | None = None) -> dict:
    payload = build_benchmark(source_path, tmdb_movies_path=tmdb_movies_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload
