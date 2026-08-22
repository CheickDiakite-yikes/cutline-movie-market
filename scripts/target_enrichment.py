"""Build Cutline's audited upcoming-film target-enrichment catalog.

The catalog is deliberately conservative. It contains only dated, post-snapshot
movie records and resolves a live market only when the normalized title is
unique and the Kalshi settlement date is close to the recorded release date.
Target-film ratings, popularity, budget, and revenue are never model outcomes.
"""

from __future__ import annotations

import csv
import json
import re
import statistics
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

from historical_model import (
    DATASET_LAST_UPDATED,
    DATASET_LICENSE,
    DATASET_SLUG,
    DATASET_SNAPSHOT,
    DATASET_VERSION,
    Movie,
    empirical_bayes_score,
    is_eligible_outcome,
    money_median,
    parse_movie,
    percentage,
    safe_int,
    sha256,
)


ENRICHMENT_MODEL_VERSION = "1.0.0"
MIN_RELEASE_YEAR = 2000
MIN_VOTE_COUNT = 100
PRIOR_STRENGTH = 5
MAX_TARGET_YEAR = DATASET_SNAPSHOT.year + 3
ELIGIBLE_TARGET_STATUSES = {"In Production", "Planned", "Post Production", "Released"}


def normalize_title(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).strip()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def unique_names(rows: list[dict[str, str]], limit: int | None = None) -> list[str]:
    names = list(
        dict.fromkeys(
            (row.get("name") or "").strip()
            for row in rows
            if (row.get("name") or "").strip()
        )
    )
    return names[:limit] if limit else names


def compact_movie(movie: Movie) -> dict:
    return {
        "title": movie.title,
        "releaseDate": movie.release_date.isoformat() if movie.release_date else None,
        "rating": movie.vote_average,
        "votes": movie.vote_count,
    }


def unique_movies(movie_ids: list[int], movie_by_id: dict[int, Movie], eligible_ids: set[int]) -> list[Movie]:
    return [movie_by_id[movie_id] for movie_id in sorted(set(movie_ids)) if movie_id in eligible_ids]


def history_group(
    people_rows: list[dict[str, str]],
    history_rows: list[dict[str, str]],
    movie_by_id: dict[int, Movie],
    eligible_ids: set[int],
    baseline: float,
    role_filter,
) -> dict:
    person_ids = {safe_int(row.get("person_id")) for row in people_rows if safe_int(row.get("person_id")) > 0}
    film_ids = [
        safe_int(row.get("movie_id"))
        for row in history_rows
        if safe_int(row.get("person_id")) in person_ids and role_filter(row)
    ]
    movies = unique_movies(film_ids, movie_by_id, eligible_ids)
    people_with_history = {
        safe_int(row.get("person_id"))
        for row in history_rows
        if safe_int(row.get("person_id")) in person_ids
        and safe_int(row.get("movie_id")) in eligible_ids
        and role_filter(row)
    }
    return {
        "people": unique_names(people_rows),
        "peopleCount": len(person_ids),
        "peopleWithHistory": len(people_with_history),
        "sampleSize": len(movies),
        "value": empirical_bayes_score(movies, baseline, PRIOR_STRENGTH),
        "titles": [
            movie.title
            for movie in sorted(
                movies,
                key=lambda item: (item.release_date or date.min, item.vote_count),
                reverse=True,
            )[:5]
        ],
    }


def financial_context(movies: list[Movie]) -> dict:
    complete = [movie for movie in movies if movie.budget > 0 and movie.revenue > 0]
    above_budget = sum(movie.revenue > movie.budget for movie in complete)
    return {
        "completeSampleSize": len(complete),
        "medianBudgetUsd": money_median(complete, "budget"),
        "medianRevenueUsd": money_median(complete, "revenue"),
        "revenueAboveBudgetCount": above_budget,
        "revenueAboveBudgetPercent": percentage(above_budget, len(complete)),
        "caveat": "Revenue exceeding production budget is not the same as profitability; marketing and distribution costs are unavailable.",
    }


def build_target_enrichment(source_dir: Path) -> dict:
    required = ["movies.csv", "cast.csv", "crew.csv"]
    missing = [name for name in required if not (source_dir / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing dataset files: {', '.join(missing)}")

    raw_movies = read_csv(source_dir / "movies.csv")
    cast_rows = read_csv(source_dir / "cast.csv")
    crew_rows = read_csv(source_dir / "crew.csv")
    parsed_movies = [movie for row in raw_movies if (movie := parse_movie(row))]
    movie_by_id = {movie.movie_id: movie for movie in parsed_movies}
    raw_by_id = {safe_int(row.get("id")): row for row in raw_movies if safe_int(row.get("id")) > 0}

    eligible = [
        movie
        for movie in parsed_movies
        if movie.original_language == "en"
        and is_eligible_outcome(
            movie,
            target_movie_id=-1,
            min_release_year=MIN_RELEASE_YEAR,
            min_vote_count=MIN_VOTE_COUNT,
        )
    ]
    eligible_ids = {movie.movie_id for movie in eligible}
    global_baseline = statistics.fmean(movie.vote_average for movie in eligible)

    cast_by_movie: dict[int, list[dict[str, str]]] = defaultdict(list)
    crew_by_movie: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in cast_rows:
        cast_by_movie[safe_int(row.get("movie_id"))].append(row)
    for row in crew_rows:
        crew_by_movie[safe_int(row.get("movie_id"))].append(row)

    candidates = [
        movie
        for movie in parsed_movies
        if movie.release_date
        and DATASET_SNAPSHOT <= movie.release_date
        and movie.release_date.year <= MAX_TARGET_YEAR
        and movie.status in ELIGIBLE_TARGET_STATUSES
    ]
    records = {}
    title_index: dict[str, list[int]] = defaultdict(list)

    for target in sorted(candidates, key=lambda movie: (movie.release_date or date.max, movie.title)):
        raw = raw_by_id[target.movie_id]
        core_genres = list(target.genres[:2])
        genre_movies = [
            movie
            for movie in eligible
            if movie.original_language == (target.original_language or "en")
            and set(core_genres).issubset(set(movie.genres))
        ]
        if not genre_movies and target.genres:
            genre_movies = [
                movie
                for movie in eligible
                if movie.original_language == (target.original_language or "en")
                and bool(set(target.genres) & set(movie.genres))
            ]
            core_genres = list(target.genres)
        baseline = statistics.fmean(movie.vote_average for movie in genre_movies) if genre_movies else global_baseline

        target_cast = sorted(
            cast_by_movie[target.movie_id],
            key=lambda row: safe_int(row.get("cast_order")),
        )[:4]
        target_directors = [row for row in crew_by_movie[target.movie_id] if row.get("job") == "Director"]
        target_producers = [
            row
            for row in crew_by_movie[target.movie_id]
            if row.get("department") == "Production" and "Producer" in (row.get("job") or "")
        ][:6]
        cast_history = history_group(
            target_cast,
            cast_rows,
            movie_by_id,
            eligible_ids,
            baseline,
            lambda row: True,
        )
        director_history = history_group(
            target_directors,
            crew_rows,
            movie_by_id,
            eligible_ids,
            baseline,
            lambda row: row.get("job") == "Director",
        )
        producer_history = history_group(
            target_producers,
            crew_rows,
            movie_by_id,
            eligible_ids,
            baseline,
            lambda row: row.get("department") == "Production" and "Producer" in (row.get("job") or ""),
        )

        poster_path = (raw.get("poster_path") or "").strip()
        backdrop_path = (raw.get("backdrop_path") or "").strip()
        artwork_path = backdrop_path or poster_path
        record = {
            "movieId": target.movie_id,
            "title": target.title,
            "originalTitle": (raw.get("original_title") or target.title).strip(),
            "releaseDate": target.release_date.isoformat(),
            "status": target.status,
            "language": target.original_language,
            "genres": list(target.genres),
            "runtime": target.runtime or None,
            "artwork": f"https://image.tmdb.org/t/p/original{artwork_path}" if artwork_path else None,
            "artworkKind": "backdrop" if backdrop_path else "poster" if poster_path else None,
            "artworkAlt": f"{target.title} artwork from the audited TMDB snapshot" if artwork_path else "",
            "match": {
                "normalizedTitle": normalize_title(target.title),
                "method": "unique normalized exact title plus release-window check",
                "reviewStatus": "automatic; not manually reviewed",
            },
            "genreContext": {
                "genres": core_genres,
                "sampleSize": len(genre_movies),
                "value": round(baseline * 10, 1),
                "recentComparables": [
                    compact_movie(movie)
                    for movie in sorted(
                        genre_movies,
                        key=lambda item: (item.release_date or date.min, item.vote_count),
                        reverse=True,
                    )[:6]
                ],
                "financialContext": financial_context(genre_movies),
            },
            "talent": {
                "cast": cast_history,
                "director": director_history,
                "producer": producer_history,
            },
        }
        records[str(target.movie_id)] = record
        for title in {target.title, record["originalTitle"]}:
            key = normalize_title(title)
            if key and target.movie_id not in title_index[key]:
                title_index[key].append(target.movie_id)

    return {
        "schemaVersion": 1,
        "modelVersion": ENRICHMENT_MODEL_VERSION,
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
            "checksums": {name: sha256(source_dir / name) for name in required},
        },
        "resolution": {
            "method": "Unique normalized exact title plus release-window check",
            "maxReleaseDistanceDays": 550,
            "candidateCount": len(records),
            "ambiguousTitlesFailClosed": True,
            "caveat": "A snapshot match improves target context but is not a live metadata refresh or a manually reviewed movie configuration.",
        },
        "methodology": {
            "minReleaseYear": MIN_RELEASE_YEAR,
            "minVoteCount": MIN_VOTE_COUNT,
            "priorStrength": PRIOR_STRENGTH,
            "outcomeMetric": "TMDB vote_average (community rating), scaled from 0-10 to 0-100",
            "leakageControls": [
                "Target-film rating, vote count, popularity, budget, and revenue are never score inputs.",
                "Only released films on or before the dataset snapshot can contribute historical outcomes.",
                "An ambiguous title or distant release date fails closed to the lower-specificity global automatic prior.",
                "Kalshi price, bid, ask, volume, critics, trailer, search, and social data are not enrichment-model inputs.",
            ],
        },
        "titleIndex": {key: ids for key, ids in sorted(title_index.items())},
        "records": records,
    }


def write_target_enrichment(source_dir: Path, output_path: Path) -> dict:
    artifact = build_target_enrichment(source_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return artifact
