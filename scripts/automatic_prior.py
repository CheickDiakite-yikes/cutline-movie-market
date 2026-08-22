"""Build the automatic historical fallback used for every live Cutline market.

The artifact contains only pre-snapshot TMDB community-rating context. It is a
hierarchical prior, not a Rotten Tomatoes probability. Runtime market identity
and settlement month select from this checked-in artifact; Kalshi prices never
enter the score.
"""

from __future__ import annotations

import calendar
import csv
import json
import re
import statistics
import unicodedata
from collections import defaultdict
from pathlib import Path

from historical_model import (
    DATASET_LAST_UPDATED,
    DATASET_LICENSE,
    DATASET_SLUG,
    DATASET_SNAPSHOT,
    DATASET_VERSION,
    Movie,
    is_eligible_outcome,
    money_median,
    parse_movie,
    percentage,
    sha256,
)


AUTO_MODEL_VERSION = "1.0.0"
MIN_RELEASE_YEAR = 2000
MIN_VOTE_COUNT = 100
FAMILY_PRIOR_STRENGTH = 10
STOP_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "part",
    "the",
    "to",
    "versus",
    "vs",
    "with",
}


def normalized_words(value: str) -> list[str]:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).split()
    return [word for word in words if word not in STOP_WORDS and not word.isdigit()]


def title_family_key(value: str) -> str:
    words = normalized_words(value)
    return words[0] if words else ""


def compact_movie(movie: Movie) -> dict:
    return {
        "title": movie.title,
        "releaseDate": movie.release_date.isoformat() if movie.release_date else None,
        "rating": movie.vote_average,
        "votes": movie.vote_count,
    }


def rating_summary(movies: list[Movie]) -> dict:
    ratings = [movie.vote_average for movie in movies]
    return {
        "sampleSize": len(movies),
        "value": round(statistics.fmean(ratings) * 10, 1),
        "median": round(statistics.median(ratings) * 10, 1),
    }


def build_automatic_prior(source_dir: Path) -> dict:
    movies_path = source_dir / "movies.csv"
    if not movies_path.exists():
        raise FileNotFoundError(f"Missing dataset file: {movies_path}")

    with movies_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    parsed = [movie for row in rows if (movie := parse_movie(row))]
    eligible = [
        movie
        for movie in parsed
        if movie.original_language == "en"
        and is_eligible_outcome(
            movie,
            target_movie_id=-1,
            min_release_year=MIN_RELEASE_YEAR,
            min_vote_count=MIN_VOTE_COUNT,
        )
    ]
    if not eligible:
        raise ValueError("Automatic prior requires at least one eligible historical movie")

    baseline = rating_summary(eligible)
    baseline_rating = baseline["value"] / 10
    month_groups: dict[int, list[Movie]] = defaultdict(list)
    family_groups: dict[str, list[Movie]] = defaultdict(list)
    for movie in eligible:
        month_groups[movie.release_date.month].append(movie)
        key = title_family_key(movie.title)
        if key:
            family_groups[key].append(movie)

    months = {}
    for month in range(1, 13):
        group = month_groups[month]
        summary = rating_summary(group)
        months[str(month)] = {
            **summary,
            "name": calendar.month_name[month],
        }

    title_families = {}
    for key, group in sorted(family_groups.items()):
        if len(group) < 2:
            continue
        raw_mean = statistics.fmean(movie.vote_average for movie in group)
        posterior = (
            sum(movie.vote_average for movie in group)
            + baseline_rating * FAMILY_PRIOR_STRENGTH
        ) / (len(group) + FAMILY_PRIOR_STRENGTH)
        title_families[key] = {
            "sampleSize": len(group),
            "rawValue": round(raw_mean * 10, 1),
            "value": round(posterior * 10, 1),
            "titles": [
                movie.title
                for movie in sorted(
                    group,
                    key=lambda item: (item.release_date, item.vote_count),
                    reverse=True,
                )[:5]
            ],
        }

    complete_financials = [movie for movie in eligible if movie.budget > 0 and movie.revenue > 0]
    recent_reference = sorted(
        eligible,
        key=lambda item: (item.release_date, item.vote_count),
        reverse=True,
    )[:6]
    return {
        "schemaVersion": 1,
        "modelVersion": AUTO_MODEL_VERSION,
        "generatedFromSnapshot": DATASET_LAST_UPDATED,
        "source": {
            "name": "The Movie Database (TMDB) Comprehensive Dataset",
            "kaggleSlug": DATASET_SLUG,
            "kaggleUrl": f"https://www.kaggle.com/datasets/{DATASET_SLUG}",
            "tmdbUrl": "https://www.themoviedb.org/",
            "version": DATASET_VERSION,
            "snapshotDate": DATASET_SNAPSHOT.isoformat(),
            "lastUpdated": DATASET_LAST_UPDATED,
            "license": DATASET_LICENSE,
            "commercialUse": "Not permitted by the dataset license without separate permission; replace or license before production use.",
            "attribution": "This product uses TMDB data but is not endorsed or certified by TMDB.",
            "checksums": {"movies.csv": sha256(movies_path)},
        },
        "eligibility": {
            "language": "en",
            "minReleaseYear": MIN_RELEASE_YEAR,
            "maxReleaseDate": DATASET_SNAPSHOT.isoformat(),
            "minVoteCount": MIN_VOTE_COUNT,
            "status": "Released",
        },
        "baseline": baseline,
        "months": months,
        "titleFamilies": title_families,
        "familyMethod": {
            "key": "First non-stopword title token",
            "minimumSample": 2,
            "priorStrength": FAMILY_PRIOR_STRENGTH,
            "caveat": "A lexical title-family match is not proof of a franchise relationship and receives strong shrinkage toward the global baseline.",
        },
        "referenceCohort": {
            "sampleSize": len(eligible),
            "recentFilms": [compact_movie(movie) for movie in recent_reference],
            "financialContext": {
                "completeSampleSize": len(complete_financials),
                "medianBudgetUsd": money_median(complete_financials, "budget"),
                "medianRevenueUsd": money_median(complete_financials, "revenue"),
                "revenueAboveBudgetCount": sum(movie.revenue > movie.budget for movie in complete_financials),
                "revenueAboveBudgetPercent": percentage(
                    sum(movie.revenue > movie.budget for movie in complete_financials),
                    len(complete_financials),
                ),
                "caveat": "Revenue exceeding production budget is not the same as profitability; marketing and distribution costs are unavailable.",
            },
        },
        "methodology": {
            "outcomeMetric": "TMDB vote_average (community rating), scaled from 0-10 to 0-100",
            "notAProxyFor": "Rotten Tomatoes Tomatometer or Kalshi threshold probability",
            "runtimeInputs": [
                "Kalshi event title selects an optional, strongly-shrunk lexical title-family prior.",
                "Kalshi settlement month selects historical release-month context as an explicit proxy.",
            ],
            "weights": {"globalBaseline": 55, "releaseMonth": 25, "titleFamily": 20},
            "leakageControls": [
                "Only released films on or before the dataset snapshot are outcomes.",
                "Kalshi price, bid, ask, volume, and market sentiment are not score inputs.",
                "Trailer, search, social, critic, popularity, and review text are not score inputs.",
                "Missing target genres and talent are explicitly imputed to the global baseline and lower the coverage score.",
            ],
        },
    }


def write_automatic_prior(source_dir: Path, output_path: Path) -> dict:
    artifact = build_automatic_prior(source_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return artifact
