"""Reproducible historical priors for the Cutline Resident Evil prototype.

Only pre-snapshot outcomes are eligible. The target film contributes identity and
release-context fields, never an outcome. Live market, review, search, trailer,
and social data are intentionally outside this module.
"""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Sequence


DATASET_SLUG = "rishabhkumar2003/the-movie-database-tmdb-comprehensive-dataset"
DATASET_VERSION = 1
DATASET_SNAPSHOT = date(2026, 2, 17)
DATASET_LAST_UPDATED = "2026-02-17T19:30:06.547Z"
DATASET_LICENSE = "CC BY-NC-SA 4.0"
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


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def safe_int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def safe_float(value: str | None) -> float:
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


def is_eligible_outcome(movie: Movie) -> bool:
    return bool(
        movie.movie_id != TARGET_MOVIE_ID
        and movie.status == "Released"
        and movie.release_date
        and MIN_RELEASE_YEAR <= movie.release_date.year
        and movie.release_date <= DATASET_SNAPSHOT
        and movie.vote_average > 0
        and movie.vote_count >= MIN_VOTE_COUNT
    )


def mean_score(movies: Sequence[Movie]) -> float:
    if not movies:
        return 0.0
    return round(statistics.fmean(movie.vote_average for movie in movies) * 10, 1)


def empirical_bayes_score(movies: Sequence[Movie], baseline: float, prior_strength: int = PRIOR_STRENGTH) -> float:
    """Shrink small filmographies toward the comparable-cohort mean.

    baseline is expressed on TMDB's 0-10 scale; the return value is 0-100.
    """
    if not movies:
        return round(baseline * 10, 1)
    posterior = (sum(movie.vote_average for movie in movies) + baseline * prior_strength) / (len(movies) + prior_strength)
    return round(posterior * 10, 1)


def weighted_score(factors: Sequence[dict]) -> float:
    weight_total = sum(float(factor["weight"]) for factor in factors)
    if round(weight_total, 6) != 100:
        raise ValueError(f"Factor weights must sum to 100, got {weight_total}")
    return round(sum(float(factor["value"]) * float(factor["weight"]) / 100 for factor in factors), 1)


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
        "titles": [movie.title for movie in sorted(movies, key=lambda item: (item.release_date or date.min, item.vote_count), reverse=True)[:5]],
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


def build_model(source_dir: Path) -> dict:
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
    eligible = [movie for movie in parsed_movies if is_eligible_outcome(movie)]
    eligible_ids = {movie.movie_id for movie in eligible}

    target = movie_by_id[TARGET_MOVIE_ID]
    cohort = [
        movie
        for movie in eligible
        if movie.original_language == target.original_language
        and {"Horror", "Science Fiction"}.issubset(set(movie.genres))
    ]
    if not cohort:
        raise ValueError("Comparable cohort is empty")
    cohort_baseline = statistics.fmean(movie.vote_average for movie in cohort)
    september_cohort = [movie for movie in cohort if movie.release_date and movie.release_date.month == 9]

    target_cast_rows = sorted(
        (row for row in cast_rows if safe_int(row.get("movie_id")) == TARGET_MOVIE_ID),
        key=lambda row: safe_int(row.get("cast_order")),
    )[:4]
    target_director_rows = [
        row for row in crew_rows
        if safe_int(row.get("movie_id")) == TARGET_MOVIE_ID and row.get("job") == "Director"
    ]
    target_producer_rows = [
        row for row in crew_rows
        if safe_int(row.get("movie_id")) == TARGET_MOVIE_ID
        and row.get("department") == "Production"
        and "Producer" in (row.get("job") or "")
    ]

    lead_ids = {safe_int(row.get("person_id")) for row in target_cast_rows}
    director_ids = {safe_int(row.get("person_id")) for row in target_director_rows}
    producer_ids = {safe_int(row.get("person_id")) for row in target_producer_rows}

    cast_film_ids = [
        safe_int(row.get("movie_id")) for row in cast_rows
        if safe_int(row.get("person_id")) in lead_ids
    ]
    director_film_ids = [
        safe_int(row.get("movie_id")) for row in crew_rows
        if safe_int(row.get("person_id")) in director_ids and row.get("job") == "Director"
    ]
    producer_film_ids = [
        safe_int(row.get("movie_id")) for row in crew_rows
        if safe_int(row.get("person_id")) in producer_ids
        and row.get("department") == "Production"
        and "Producer" in (row.get("job") or "")
    ]

    cast_movies = unique_movies(cast_film_ids, movie_by_id, eligible_ids)
    director_movies = unique_movies(director_film_ids, movie_by_id, eligible_ids)
    producer_movies = unique_movies(producer_film_ids, movie_by_id, eligible_ids)
    franchise_movies = [movie for movie in eligible if movie.title.casefold().startswith("resident evil")]

    director_value = empirical_bayes_score(director_movies, cohort_baseline)
    producer_value = empirical_bayes_score(producer_movies, cohort_baseline)
    cast_value = empirical_bayes_score(cast_movies, cohort_baseline)
    franchise_value = empirical_bayes_score(franchise_movies, cohort_baseline)
    cohort_value = mean_score(cohort)
    season_value = empirical_bayes_score(september_cohort, cohort_baseline)

    historical_factors = [
        factor("Director prior", director_value, 30, director_movies, "Prior released films directed by the target director; small samples shrink toward the comparable cohort."),
        factor("Producer prior", producer_value, 20, producer_movies, "Unique prior released films credited to the target producers; duplicate producer credits count once."),
        factor("Franchise prior", franchise_value, 15, franchise_movies, "Prior eligible Resident Evil titles in the dataset."),
        factor("Genre cohort", cohort_value, 25, cohort, "English-language Horror + Science Fiction releases since 2000 with at least 100 TMDB votes."),
        factor("September context", season_value, 10, september_cohort, "Comparable-cohort titles released in September."),
    ]
    talent_factors = [
        factor("Lead cast prior", cast_value, 50, cast_movies, "Unique prior eligible films for the target film's top four billed cast members."),
        factor("Director prior", director_value, 30, director_movies, "Prior eligible films directed by the target director."),
        factor("Producer prior", producer_value, 20, producer_movies, "Unique prior eligible films credited to the target producers."),
    ]

    people_with_history = 0
    target_people = lead_ids | director_ids | producer_ids
    for person_id in target_people:
        has_cast = any(safe_int(row.get("person_id")) == person_id and safe_int(row.get("movie_id")) in eligible_ids for row in cast_rows)
        has_crew = any(safe_int(row.get("person_id")) == person_id and safe_int(row.get("movie_id")) in eligible_ids for row in crew_rows)
        people_with_history += int(has_cast or has_crew)

    positive_budget = [movie for movie in cohort if movie.budget > 0]
    positive_revenue = [movie for movie in cohort if movie.revenue > 0]
    target_context_fields = [
        bool(target.release_date), bool(target.original_language), bool(target.genres), bool(target.runtime),
        bool(target.budget), bool(target_director_rows), bool(target_cast_rows), bool(target_producer_rows),
    ]
    coverage_factors = [
        {"label": "Historical ratings", "value": 100.0, "weight": 30, "contribution": 30.0, "sampleSize": len(cohort), "detail": "Every comparable film passes the rating and vote-count eligibility rule.", "titles": []},
        {"label": "Named talent priors", "value": percentage(people_with_history, len(target_people)), "weight": 25, "sampleSize": len(target_people), "detail": f"{people_with_history} of {len(target_people)} named cast, director, and producer identities have at least one eligible prior film.", "titles": []},
        {"label": "Budget completeness", "value": percentage(len(positive_budget), len(cohort)), "weight": 15, "sampleSize": len(positive_budget), "detail": "Positive production budgets in the comparable cohort; zero is treated as missing.", "titles": []},
        {"label": "Revenue completeness", "value": percentage(len(positive_revenue), len(cohort)), "weight": 15, "sampleSize": len(positive_revenue), "detail": "Positive theatrical revenue in the comparable cohort; zero is treated as missing.", "titles": []},
        {"label": "Target feature fields", "value": percentage(sum(target_context_fields), len(target_context_fields)), "weight": 15, "sampleSize": sum(target_context_fields), "detail": "Release, language, genres, runtime, budget, director, lead cast, and producer groups present for the target. Target runtime and budget are unavailable in this snapshot.", "titles": []},
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
        return [row.get("name") or "" for row in rows]

    output = {
        "schemaVersion": 1,
        "generatedFromSnapshot": DATASET_LAST_UPDATED,
        "target": {
            "movieId": target.movie_id,
            "title": target.title,
            "releaseDateInDataset": target.release_date.isoformat() if target.release_date else None,
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
            "rows": {
                "moviesRaw": len(raw_movies),
                "moviesParsed": len(parsed_movies),
                "cast": len(cast_rows),
                "crew": len(crew_rows),
                "genres": len(read_csv(source_dir / "genres.csv")),
                "reviews": len(read_csv(source_dir / "reviews.csv")),
            },
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
            "eligibility": [
                f"Released between {MIN_RELEASE_YEAR}-01-01 and the {DATASET_SNAPSHOT.isoformat()} snapshot",
                f"At least {MIN_VOTE_COUNT} TMDB votes and a positive vote_average",
                "Target movie ID 1423191 is excluded from all outcomes",
            ],
            "cohortRule": "English-language films tagged both Horror and Science Fiction, released since 2000, with at least 100 TMDB votes by the snapshot date.",
            "shrinkage": f"Talent and franchise averages use empirical-Bayes shrinkage equivalent to {PRIOR_STRENGTH} comparable-cohort films.",
            "leakageControls": [
                "No target-film vote, popularity, review, budget, or revenue value is used.",
                "No release after the dataset snapshot is used as an outcome.",
                "Popularity, reviews, trailer, search, social, critic, and Kalshi fields are not model inputs.",
                "Historical revenue is descriptive only because the target budget is unavailable.",
            ],
        },
        "cohort": {
            "sampleSize": len(cohort),
            "ratingMean": round(cohort_baseline, 3),
            "ratingMedian": round(statistics.median(rating_distribution), 3),
            "ratingRange": [round(rating_distribution[0], 3), round(rating_distribution[-1], 3)],
            "septemberSampleSize": len(september_cohort),
            "recentComparables": [
                {
                    "title": movie.title,
                    "releaseDate": movie.release_date.isoformat() if movie.release_date else None,
                    "rating": movie.vote_average,
                    "votes": movie.vote_count,
                }
                for movie in sorted(cohort, key=lambda item: (item.release_date or date.min, item.vote_count), reverse=True)[:6]
            ],
            "financialContext": {
                "completeSampleSize": len(complete_financials),
                "medianBudgetUsd": money_median(complete_financials, "budget"),
                "medianRevenueUsd": money_median(complete_financials, "revenue"),
                "revenueAboveBudgetCount": len(revenue_above_budget),
                "revenueAboveBudgetPercent": percentage(len(revenue_above_budget), len(complete_financials)),
                "caveat": "Revenue exceeding production budget is not the same as profitability; marketing and distribution costs are unavailable.",
            },
        },
        "scores": {
            "historicalFit": {
                "value": weighted_score(historical_factors),
                "sampleSize": len(set(movie.movie_id for group in [director_movies, producer_movies, franchise_movies, cohort] for movie in group)),
                "factors": historical_factors,
            },
            "talentPrior": {
                "value": weighted_score(talent_factors),
                "sampleSize": len(set(movie.movie_id for group in [cast_movies, director_movies, producer_movies] for movie in group)),
                "factors": talent_factors,
            },
            "dataCoverage": {
                "value": weighted_score(coverage_factors),
                "sampleSize": len(cohort),
                "factors": coverage_factors,
            },
        },
        "thresholdCalibration": {
            "status": "unavailable",
            "reason": "This Kaggle source has TMDB community ratings, not Rotten Tomatoes critic outcomes. It cannot honestly estimate P(Tomatometer > threshold).",
        },
        "unconnectedSignals": [
            {"name": "Kalshi market", "status": "separate manual snapshot"},
            {"name": "Rotten Tomatoes critics", "status": "not connected"},
            {"name": "Trailer velocity", "status": "not connected"},
            {"name": "Search interest", "status": "not connected"},
            {"name": "Social chatter and sentiment", "status": "not connected"},
        ],
    }
    return output


def write_model(source_dir: Path, output_path: Path) -> dict:
    model = build_model(source_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(model, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return model
