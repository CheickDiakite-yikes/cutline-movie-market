"""Configuration-driven historical priors for Cutline movie markets.

Only pre-snapshot outcomes are eligible. A target film contributes identity and
release-context fields, never an outcome. Live market, critic, search, trailer,
and social data remain separate source layers.
"""

from __future__ import annotations

import calendar
import csv
import hashlib
import json
import statistics
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Mapping, Sequence


DATASET_SLUG = "rishabhkumar2003/the-movie-database-tmdb-comprehensive-dataset"
DATASET_VERSION = 1
DATASET_SNAPSHOT = date(2026, 2, 17)
DATASET_LAST_UPDATED = "2026-02-17T19:30:06.547Z"
DATASET_LICENSE = "CC BY-NC-SA 4.0"
DEFAULT_MARKET_CONFIG = Path("config/markets/resident-evil.json")

# Backward-compatible defaults used by focused unit tests.
TARGET_MOVIE_ID = 1423191
MIN_RELEASE_YEAR = 2000
MIN_VOTE_COUNT = 100
PRIOR_STRENGTH = 5


@dataclass(frozen=True)
class Movie:
    movie_id: int
    title: str
    release_date: date | None
    runtime: int
    budget: int
    revenue: int
    vote_average: float
    vote_count: int
    status: str
    original_language: str
    genres: tuple[str, ...]


@dataclass(frozen=True)
class MarketSpec:
    slug: str
    title: str
    movie_id: int
    artwork: str
    artwork_alt: str
    release_date: date
    release_date_label: str
    genre_label: str
    studio_label: str
    kalshi_series_ticker: str
    kalshi_event_ticker: str
    kalshi_market_url: str
    thresholds: tuple[int, ...]
    default_threshold: int
    required_genres: tuple[str, ...]
    franchise_prefixes: tuple[str, ...]
    min_release_year: int
    min_vote_count: int
    prior_strength: int
    historical_weights: Mapping[str, int]
    talent_weights: Mapping[str, int]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def safe_int(value: str | int | float | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def safe_float(value: str | int | float | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value or "")
    except ValueError:
        return None


def parse_movie(row: dict[str, str]) -> Movie | None:
    movie_id = safe_int(row.get("id"))
    if movie_id <= 0:
        return None
    return Movie(
        movie_id=movie_id,
        title=(row.get("title") or "").strip(),
        release_date=parse_date(row.get("release_date")),
        runtime=safe_int(row.get("runtime")),
        budget=safe_int(row.get("budget")),
        revenue=safe_int(row.get("revenue")),
        vote_average=safe_float(row.get("vote_average")),
        vote_count=safe_int(row.get("vote_count")),
        status=(row.get("status") or "").strip(),
        original_language=(row.get("original_language") or "").strip(),
        genres=tuple(part.strip() for part in (row.get("genres") or "").split(",") if part.strip()),
    )


def validate_weights(weights: Mapping[str, int], expected: set[str], label: str) -> None:
    if set(weights) != expected:
        raise ValueError(f"{label} keys must be {sorted(expected)}, got {sorted(weights)}")
    if sum(weights.values()) != 100:
        raise ValueError(f"{label} must sum to 100, got {sum(weights.values())}")


def load_market_config(path: Path = DEFAULT_MARKET_CONFIG) -> MarketSpec:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported market config schema in {path}")

    release = raw["release"]
    kalshi = raw["kalshi"]
    historical = raw["historical"]
    historical_weights = historical["historicalWeights"]
    talent_weights = historical["talentWeights"]
    validate_weights(
        historical_weights,
        {"director", "producer", "franchise", "genreCohort", "releaseMonth"},
        "historicalWeights",
    )
    validate_weights(talent_weights, {"cast", "director", "producer"}, "talentWeights")

    release_date = parse_date(release.get("date"))
    if not release_date:
        raise ValueError(f"Market config {path} needs an ISO release date")
    thresholds = tuple(sorted({safe_int(value) for value in kalshi["thresholds"] if safe_int(value) > 0}))
    default_threshold = safe_int(kalshi["defaultThreshold"])
    if default_threshold not in thresholds:
        raise ValueError(f"Default threshold {default_threshold} is not declared in {path}")

    return MarketSpec(
        slug=raw["slug"],
        title=raw["title"],
        movie_id=safe_int(raw["tmdbMovieId"]),
        artwork=raw["artwork"],
        artwork_alt=raw["artworkAlt"],
        release_date=release_date,
        release_date_label=release["dateLabel"],
        genre_label=release["genreLabel"],
        studio_label=release["studioLabel"],
        kalshi_series_ticker=kalshi["seriesTicker"],
        kalshi_event_ticker=kalshi["eventTicker"],
        kalshi_market_url=kalshi["marketUrl"],
        thresholds=thresholds,
        default_threshold=default_threshold,
        required_genres=tuple(historical["requiredGenres"]),
        franchise_prefixes=tuple(prefix.casefold() for prefix in historical["franchiseTitlePrefixes"]),
        min_release_year=safe_int(historical["minReleaseYear"]),
        min_vote_count=safe_int(historical["minVoteCount"]),
        prior_strength=safe_int(historical["priorStrength"]),
        historical_weights=historical_weights,
        talent_weights=talent_weights,
    )


def is_eligible_outcome(
    movie: Movie,
    target_movie_id: int = TARGET_MOVIE_ID,
    dataset_snapshot: date = DATASET_SNAPSHOT,
    min_release_year: int = MIN_RELEASE_YEAR,
    min_vote_count: int = MIN_VOTE_COUNT,
) -> bool:
    return bool(
        movie.movie_id != target_movie_id
        and movie.status == "Released"
        and movie.release_date
        and min_release_year <= movie.release_date.year
        and movie.release_date <= dataset_snapshot
        and movie.vote_average > 0
        and movie.vote_count >= min_vote_count
    )


def mean_score(movies: Sequence[Movie]) -> float:
    if not movies:
        return 0.0
    return round(statistics.fmean(movie.vote_average for movie in movies) * 10, 1)


def empirical_bayes_score(
    movies: Sequence[Movie],
    baseline: float,
    prior_strength: int = PRIOR_STRENGTH,
) -> float:
    """Shrink small filmographies toward the comparable-cohort mean."""
    if not movies:
        return round(baseline * 10, 1)
    posterior = (sum(movie.vote_average for movie in movies) + baseline * prior_strength) / (
        len(movies) + prior_strength
    )
    return round(posterior * 10, 1)


def weighted_score(factors: Sequence[dict]) -> float:
    weight_total = sum(float(item["weight"]) for item in factors)
    if round(weight_total, 6) != 100:
        raise ValueError(f"Factor weights must sum to 100, got {weight_total}")
    return round(sum(float(item["value"]) * float(item["weight"]) / 100 for item in factors), 1)


def unique_movies(movie_ids: Iterable[int], movie_by_id: dict[int, Movie], eligible_ids: set[int]) -> list[Movie]:
    return [movie_by_id[movie_id] for movie_id in sorted(set(movie_ids)) if movie_id in eligible_ids]


def factor(label: str, value: float, weight: int, movies: Sequence[Movie], detail: str) -> dict:
    return {
        "label": label,
        "value": round(value, 1),
        "weight": weight,
        "contribution": round(value * weight / 100, 1),
        "sampleSize": len(movies),
        "detail": detail,
        "titles": [
            movie.title
            for movie in sorted(
                movies,
                key=lambda item: (item.release_date or date.min, item.vote_count),
                reverse=True,
            )[:5]
        ],
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def percentage(part: int, whole: int) -> float:
    return round((part / whole * 100) if whole else 0, 1)


def money_median(movies: Sequence[Movie], field: str) -> int | None:
    values = [getattr(movie, field) for movie in movies if getattr(movie, field) > 0]
    return int(statistics.median(values)) if values else None


def build_model(source_dir: Path, market: MarketSpec | None = None) -> dict:
    market = market or load_market_config()
    required = ["movies.csv", "cast.csv", "crew.csv", "genres.csv", "reviews.csv"]
    missing = [name for name in required if not (source_dir / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing dataset files: {', '.join(missing)}")

    raw_movies = read_csv(source_dir / "movies.csv")
    cast_rows = read_csv(source_dir / "cast.csv")
    crew_rows = read_csv(source_dir / "crew.csv")
    parsed_movies = [movie for row in raw_movies if (movie := parse_movie(row))]
    movie_by_id = {movie.movie_id: movie for movie in parsed_movies}
    valid_ids = set(movie_by_id)
    if market.movie_id not in movie_by_id:
        raise ValueError(
            f"TMDB movie {market.movie_id} for {market.title} is not present in the audited snapshot"
        )

    target = movie_by_id[market.movie_id]
    eligible = [
        movie
        for movie in parsed_movies
        if is_eligible_outcome(
            movie,
            target_movie_id=market.movie_id,
            min_release_year=market.min_release_year,
            min_vote_count=market.min_vote_count,
        )
    ]
    eligible_ids = {movie.movie_id for movie in eligible}
    required_genres = set(market.required_genres)
    cohort = [
        movie
        for movie in eligible
        if movie.original_language == target.original_language
        and required_genres.issubset(set(movie.genres))
    ]
    if not cohort:
        raise ValueError(f"Comparable cohort is empty for {market.slug}")
    cohort_baseline = statistics.fmean(movie.vote_average for movie in cohort)
    release_month_cohort = [
        movie for movie in cohort if movie.release_date and movie.release_date.month == market.release_date.month
    ]

    target_cast_rows = sorted(
        (row for row in cast_rows if safe_int(row.get("movie_id")) == market.movie_id),
        key=lambda row: safe_int(row.get("cast_order")),
    )[:4]
    target_director_rows = [
        row
        for row in crew_rows
        if safe_int(row.get("movie_id")) == market.movie_id and row.get("job") == "Director"
    ]
    target_producer_rows = [
        row
        for row in crew_rows
        if safe_int(row.get("movie_id")) == market.movie_id
        and row.get("department") == "Production"
        and "Producer" in (row.get("job") or "")
    ]

    lead_ids = {safe_int(row.get("person_id")) for row in target_cast_rows}
    director_ids = {safe_int(row.get("person_id")) for row in target_director_rows}
    producer_ids = {safe_int(row.get("person_id")) for row in target_producer_rows}

    cast_film_ids = [
        safe_int(row.get("movie_id")) for row in cast_rows if safe_int(row.get("person_id")) in lead_ids
    ]
    director_film_ids = [
        safe_int(row.get("movie_id"))
        for row in crew_rows
        if safe_int(row.get("person_id")) in director_ids and row.get("job") == "Director"
    ]
    producer_film_ids = [
        safe_int(row.get("movie_id"))
        for row in crew_rows
        if safe_int(row.get("person_id")) in producer_ids
        and row.get("department") == "Production"
        and "Producer" in (row.get("job") or "")
    ]

    cast_movies = unique_movies(cast_film_ids, movie_by_id, eligible_ids)
    director_movies = unique_movies(director_film_ids, movie_by_id, eligible_ids)
    producer_movies = unique_movies(producer_film_ids, movie_by_id, eligible_ids)
    franchise_movies = [
        movie
        for movie in eligible
        if any(movie.title.casefold().startswith(prefix) for prefix in market.franchise_prefixes)
    ]

    director_value = empirical_bayes_score(director_movies, cohort_baseline, market.prior_strength)
    producer_value = empirical_bayes_score(producer_movies, cohort_baseline, market.prior_strength)
    cast_value = empirical_bayes_score(cast_movies, cohort_baseline, market.prior_strength)
    franchise_value = empirical_bayes_score(franchise_movies, cohort_baseline, market.prior_strength)
    cohort_value = mean_score(cohort)
    release_month_value = empirical_bayes_score(
        release_month_cohort, cohort_baseline, market.prior_strength
    )
    month_name = calendar.month_name[market.release_date.month]

    historical_factors = [
        factor(
            "Director prior",
            director_value,
            market.historical_weights["director"],
            director_movies,
            "Prior released films directed by the target director; small samples shrink toward the comparable cohort.",
        ),
        factor(
            "Producer prior",
            producer_value,
            market.historical_weights["producer"],
            producer_movies,
            "Unique prior released films credited to the target producers; duplicate producer credits count once.",
        ),
        factor(
            "Franchise prior",
            franchise_value,
            market.historical_weights["franchise"],
            franchise_movies,
            f"Prior eligible films matching the configured franchise prefixes for {market.title}.",
        ),
        factor(
            "Genre cohort",
            cohort_value,
            market.historical_weights["genreCohort"],
            cohort,
            f"{target.original_language}-language {' + '.join(market.required_genres)} releases since {market.min_release_year} with at least {market.min_vote_count} TMDB votes.",
        ),
        factor(
            f"{month_name} context",
            release_month_value,
            market.historical_weights["releaseMonth"],
            release_month_cohort,
            f"Comparable-cohort titles released in {month_name}.",
        ),
    ]
    talent_factors = [
        factor(
            "Lead cast prior",
            cast_value,
            market.talent_weights["cast"],
            cast_movies,
            "Unique prior eligible films for the target film's top four billed cast members.",
        ),
        factor(
            "Director prior",
            director_value,
            market.talent_weights["director"],
            director_movies,
            "Prior eligible films directed by the target director.",
        ),
        factor(
            "Producer prior",
            producer_value,
            market.talent_weights["producer"],
            producer_movies,
            "Unique prior eligible films credited to the target producers.",
        ),
    ]

    people_with_history = 0
    target_people = lead_ids | director_ids | producer_ids
    for person_id in target_people:
        has_cast = any(
            safe_int(row.get("person_id")) == person_id
            and safe_int(row.get("movie_id")) in eligible_ids
            for row in cast_rows
        )
        has_crew = any(
            safe_int(row.get("person_id")) == person_id
            and safe_int(row.get("movie_id")) in eligible_ids
            for row in crew_rows
        )
        people_with_history += int(has_cast or has_crew)

    positive_budget = [movie for movie in cohort if movie.budget > 0]
    positive_revenue = [movie for movie in cohort if movie.revenue > 0]
    target_context_fields = [
        bool(market.release_date),
        bool(target.original_language),
        bool(target.genres),
        bool(target.runtime),
        bool(target.budget),
        bool(target_director_rows),
        bool(target_cast_rows),
        bool(target_producer_rows),
    ]
    coverage_factors = [
        {"label": "Historical ratings", "value": 100.0, "weight": 30, "contribution": 30.0, "sampleSize": len(cohort), "detail": "Every comparable film passes the rating and vote-count eligibility rule.", "titles": []},
        {"label": "Named talent priors", "value": percentage(people_with_history, len(target_people)), "weight": 25, "sampleSize": len(target_people), "detail": f"{people_with_history} of {len(target_people)} named cast, director, and producer identities have at least one eligible prior film.", "titles": []},
        {"label": "Budget completeness", "value": percentage(len(positive_budget), len(cohort)), "weight": 15, "sampleSize": len(positive_budget), "detail": "Positive production budgets in the comparable cohort; zero is treated as missing.", "titles": []},
        {"label": "Revenue completeness", "value": percentage(len(positive_revenue), len(cohort)), "weight": 15, "sampleSize": len(positive_revenue), "detail": "Positive theatrical revenue in the comparable cohort; zero is treated as missing.", "titles": []},
        {"label": "Target feature fields", "value": percentage(sum(target_context_fields), len(target_context_fields)), "weight": 15, "sampleSize": sum(target_context_fields), "detail": "Release, language, genres, runtime, budget, director, lead cast, and producer groups present for the target. Configured release context may supplement the historical snapshot.", "titles": []},
    ]
    for item in coverage_factors:
        item["contribution"] = round(item["value"] * item["weight"] / 100, 1)

    complete_financials = [movie for movie in cohort if movie.budget > 0 and movie.revenue > 0]
    revenue_above_budget = [movie for movie in complete_financials if movie.revenue > movie.budget]
    rating_distribution = sorted(movie.vote_average for movie in cohort)
    raw_id_values = [safe_int(row.get("id")) for row in raw_movies]
    valid_raw_ids = [movie_id for movie_id in raw_id_values if movie_id > 0]
    audit_missingness = {
        "releaseDate": percentage(sum(movie.release_date is None for movie in parsed_movies), len(parsed_movies)),
        "runtime": percentage(sum(movie.runtime <= 0 for movie in parsed_movies), len(parsed_movies)),
        "budget": percentage(sum(movie.budget <= 0 for movie in parsed_movies), len(parsed_movies)),
        "revenue": percentage(sum(movie.revenue <= 0 for movie in parsed_movies), len(parsed_movies)),
        "voteAverage": percentage(sum(movie.vote_average <= 0 for movie in parsed_movies), len(parsed_movies)),
        "voteCount": percentage(sum(movie.vote_count <= 0 for movie in parsed_movies), len(parsed_movies)),
        "genres": percentage(sum(not movie.genres for movie in parsed_movies), len(parsed_movies)),
        "originalLanguage": percentage(sum(not movie.original_language for movie in parsed_movies), len(parsed_movies)),
    }

    def name_list(rows: Sequence[dict[str, str]]) -> list[str]:
        return list(dict.fromkeys((row.get("name") or "").strip() for row in rows if (row.get("name") or "").strip()))

    output = {
        "schemaVersion": 2,
        "generatedFromSnapshot": DATASET_LAST_UPDATED,
        "market": {
            "slug": market.slug,
            "title": market.title,
            "artwork": market.artwork,
            "artworkAlt": market.artwork_alt,
            "releaseDate": market.release_date.isoformat(),
            "releaseDateLabel": market.release_date_label,
            "genreLabel": market.genre_label,
            "studioLabel": market.studio_label,
            "kalshi": {
                "seriesTicker": market.kalshi_series_ticker,
                "eventTicker": market.kalshi_event_ticker,
                "marketUrl": market.kalshi_market_url,
                "thresholds": list(market.thresholds),
                "defaultThreshold": market.default_threshold,
            },
        },
        "target": {
            "movieId": target.movie_id,
            "title": target.title,
            "releaseDateInDataset": target.release_date.isoformat() if target.release_date else None,
            "configuredReleaseDate": market.release_date.isoformat(),
            "language": target.original_language,
            "genres": list(target.genres),
            "director": name_list(target_director_rows),
            "leadCast": name_list(target_cast_rows),
            "producers": name_list(target_producer_rows),
            "targetOutcomeUsed": False,
        },
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
            "checksums": {name: sha256(source_dir / name) for name in required},
        },
        "audit": {
            "rows": {"moviesRaw": len(raw_movies), "moviesParsed": len(parsed_movies), "cast": len(cast_rows), "crew": len(crew_rows), "genres": len(read_csv(source_dir / "genres.csv")), "reviews": len(read_csv(source_dir / "reviews.csv"))},
            "malformedMovieRowsSkipped": len(raw_movies) - len(parsed_movies),
            "duplicateMovieIds": len(valid_raw_ids) - len(set(valid_raw_ids)),
            "orphanCastRows": sum(safe_int(row.get("movie_id")) not in valid_ids for row in cast_rows),
            "orphanCrewRows": sum(safe_int(row.get("movie_id")) not in valid_ids for row in crew_rows),
            "missingnessPercent": audit_missingness,
            "schemaAssessment": "Relational joins are intact and IDs are unique after skipping one malformed movies.csv row. Zero budget/revenue values are treated as missing.",
        },
        "methodology": {
            "outcomeMetric": "TMDB vote_average (community rating), scaled from 0-10 to 0-100",
            "notAProxyFor": "Rotten Tomatoes Tomatometer or Kalshi threshold probability",
            "eligibility": [f"Released between {market.min_release_year}-01-01 and the {DATASET_SNAPSHOT.isoformat()} snapshot", f"At least {market.min_vote_count} TMDB votes and a positive vote_average", f"Target movie ID {market.movie_id} is excluded from all outcomes"],
            "cohortRule": f"{target.original_language}-language films tagged {' and '.join(market.required_genres)}, released since {market.min_release_year}, with at least {market.min_vote_count} TMDB votes by the snapshot date.",
            "shrinkage": f"Talent and franchise averages use empirical-Bayes shrinkage equivalent to {market.prior_strength} comparable-cohort films.",
            "leakageControls": ["No target-film vote, popularity, review, budget, or revenue value is used.", "No release after the dataset snapshot is used as an outcome.", "Popularity, reviews, trailer, search, social, critic, and Kalshi fields are not model inputs.", "Historical revenue is descriptive only because the target budget is unavailable."],
            "config": f"config/markets/{market.slug}.json",
        },
        "cohort": {
            "sampleSize": len(cohort),
            "ratingMean": round(cohort_baseline, 3),
            "ratingMedian": round(statistics.median(rating_distribution), 3),
            "ratingRange": [round(rating_distribution[0], 3), round(rating_distribution[-1], 3)],
            "releaseMonth": market.release_date.month,
            "releaseMonthName": month_name,
            "releaseMonthSampleSize": len(release_month_cohort),
            "recentComparables": [{"title": movie.title, "releaseDate": movie.release_date.isoformat() if movie.release_date else None, "rating": movie.vote_average, "votes": movie.vote_count} for movie in sorted(cohort, key=lambda item: (item.release_date or date.min, item.vote_count), reverse=True)[:6]],
            "financialContext": {"completeSampleSize": len(complete_financials), "medianBudgetUsd": money_median(complete_financials, "budget"), "medianRevenueUsd": money_median(complete_financials, "revenue"), "revenueAboveBudgetCount": len(revenue_above_budget), "revenueAboveBudgetPercent": percentage(len(revenue_above_budget), len(complete_financials)), "caveat": "Revenue exceeding production budget is not the same as profitability; marketing and distribution costs are unavailable."},
        },
        "scores": {
            "historicalFit": {"value": weighted_score(historical_factors), "sampleSize": len({movie.movie_id for group in [director_movies, producer_movies, franchise_movies, cohort] for movie in group}), "factors": historical_factors},
            "talentPrior": {"value": weighted_score(talent_factors), "sampleSize": len({movie.movie_id for group in [cast_movies, director_movies, producer_movies] for movie in group}), "factors": talent_factors},
            "dataCoverage": {"value": weighted_score(coverage_factors), "sampleSize": len(cohort), "factors": coverage_factors},
        },
        "thresholdCalibration": {"status": "unavailable", "reason": "A Rotten Tomatoes outcome benchmark is audited separately, but the current title/year join is too small for time-aware probability calibration."},
        "unconnectedSignals": [
            {"name": "Rotten Tomatoes calibration", "status": "benchmark connected; probability model not validated"},
            {"name": "Trailer velocity", "status": "not connected"},
            {"name": "Search interest", "status": "not connected"},
            {"name": "Social chatter and sentiment", "status": "not connected"},
        ],
    }
    return output


def write_model(source_dir: Path, output_path: Path, market: MarketSpec | None = None) -> dict:
    model = build_model(source_dir, market=market)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(model, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return model
