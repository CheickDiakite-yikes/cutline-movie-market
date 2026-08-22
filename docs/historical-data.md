# Cutline historical movie data

## Selected source

Cutline currently uses version 1 of Kaggle's [The Movie Database (TMDB) Comprehensive Dataset](https://www.kaggle.com/datasets/rishabhkumar2003/the-movie-database-tmdb-comprehensive-dataset), collected and last updated on February 17, 2026.

It is the only audited candidate that combines the required fields in one recent relational snapshot:

- `movies.csv`: title, release date, language, genres, runtime, budget, revenue, TMDB vote average/count
- `cast.csv`: person IDs, names, character, billing order
- `crew.csv`: person IDs, names, job, department, including directors and producers
- `genres.csv`: genre reference counts
- `reviews.csv`: present in the download, but intentionally unused in this historical prior

The Kaggle API reports license `CC BY-NC-SA 4.0`. This is acceptable for the current non-commercial prototype only. It is **not a production/commercial data license**. Before Cutline is commercialized, obtain separate permission or replace this dataset with a commercially licensed source. TMDB additionally requires attribution; the product must state: “This product uses TMDB data but is not endorsed or certified by TMDB.”

Exact dataset archive observed for this implementation:

```text
Kaggle slug: rishabhkumar2003/the-movie-database-tmdb-comprehensive-dataset
Version: 1
Last updated: 2026-02-17T19:30:06.547Z
Archive SHA-256: 395888227be599a3181084bda47defe38be5e6198f12c6e76656c0a39d6bf3a7
```

Per-file SHA-256 hashes are embedded in `src/data/resident-evil-historical.json` and are regenerated from the local source files.

## Candidate audit

| Kaggle candidate | Recency / license | Coverage | Decision |
| --- | --- | --- | --- |
| TMDB Comprehensive Dataset | Feb 2026; CC BY-NC-SA 4.0 | Movies, cast, crew, directors, producers, genres, budget, revenue, release context, ratings | Selected for the prototype; commercial-license blocker is explicit |
| TMDB 5000 Movie Dataset | Sep 2017; “Other” | Required fields exist, but only roughly 5,000 older films; the publisher flags unverified quality and ambiguous budget/revenue semantics | Rejected as too small and stale |
| The Movies Dataset | Nov 2017; CC0 | About 45,000 films, credits, budget/revenue, and TMDB/MovieLens ratings, but releases stop in July 2017 | Rejected because it misses the recent Resident Evil creative team’s relevant work |
| TMDB Movies 2021–2025 | Feb 2026; Apache 2.0 | Recent titles, genres, votes, and ratings | Rejected because its published schema lacks cast, crew, producers, budget, and revenue |
| Movies Metadata Dataset (TMDB-style) | Jan 2026; CC0 | Recent metadata, budget, revenue, genres, and ratings | Rejected because its published schema lacks cast and crew relationships |

Licensing labels and update timestamps above come from Kaggle’s official dataset metadata API. The selected dataset’s description identifies TMDB API extraction as its provenance. Kaggle republishes the snapshot; it does not make the observations live.

## Schema and missingness audit

The normalization pass observed:

| Table / check | Result |
| --- | ---: |
| Raw movie rows | 9,771 |
| Parsed movie rows | 9,770 |
| Cast rows | 150,044 |
| Crew rows | 63,632 |
| Review rows | 13,073, unused |
| Duplicate valid movie IDs | 0 |
| Orphan cast joins | 0 |
| Orphan crew joins | 0 |
| Malformed movie rows skipped | 1 |

Missingness across parsed movie rows (zero treated as missing for numeric fields):

| Field | Missing |
| --- | ---: |
| Release date | 0.6% |
| Runtime | 4.5% |
| Budget | 58.9% |
| Revenue | 58.8% |
| Vote average | 11.5% |
| Vote count | 11.5% |
| Genres | 2.8% |
| Original language | 0.0% |

Budget and revenue are therefore descriptive cohort context, not hidden predictive features. Zero values are treated as unavailable. Revenue exceeding production budget is not labeled “profit,” because marketing and distribution costs are absent.

## Resident Evil calculation

The cache uses target movie ID `1423191` to identify the target’s director, first four billed cast members, producers, language, and genres. Its outcome fields are never used.

Eligible historical outcomes must be:

1. released from January 1, 2000 through the February 17, 2026 dataset snapshot;
2. marked `Released`;
3. supported by at least 100 TMDB votes and a positive `vote_average`; and
4. not the target movie.

The comparable cohort is English-language films tagged both `Horror` and `Science Fiction` that pass those rules. The current cohort contains 77 films, including 10 September releases. The outcome is TMDB’s community `vote_average`, scaled from 0–10 to 0–100. It is **not** a Rotten Tomatoes critic score.

Historical fit weights:

- Director prior: 30%
- Producer prior: 20%
- Resident Evil franchise prior: 15%
- Comparable genre cohort: 25%
- September release context: 10%

Talent prior weights:

- First four billed cast histories: 50%
- Director prior: 30%
- Producer prior: 20%

Small filmographies and franchise samples are shrunk toward the comparable-cohort mean using an empirical-Bayes prior equivalent to five comparable films. Duplicate films across several producers or cast members count once within a factor. Each cached factor includes its value, weight, point contribution, sample size, and example titles.

The `Data coverage` score measures availability only. It is not a confidence level and should not be interpreted as a probability that the trade wins.

## Leakage controls and unavailable calibration

- No target-film vote, popularity, review, budget, or revenue value is used.
- No film released after the dataset snapshot is used as an outcome.
- The dataset’s `popularity` and user-review tables are unused.
- Historical revenue is descriptive because the target budget is missing.
- Kalshi prices, Rotten Tomatoes critic reviews, trailer velocity, search interest, and social chatter remain separate live inputs.
- Because the selected Kaggle source has TMDB community ratings rather than Rotten Tomatoes critic outcomes, Cutline does not compute `P(Tomatometer > 75/80/85)` or a model edge. A critic-outcome training set and time-aware validation are required first.

## Reproduce locally

The raw Kaggle download is intentionally gitignored. Download, unzip, normalize, audit, and rebuild the checked-in cache with:

```bash
bash scripts/download_kaggle_data.sh
```

The download script verifies the observed version-1 archive checksum and stops if Kaggle serves a different snapshot. A changed archive must be re-audited rather than silently replacing the model input.

If the CSV files already exist at `data/raw/tmdb-comprehensive-v1`, rebuild only the cache:

```bash
python3 scripts/build_historical_model.py
```

Run the focused scoring tests with:

```bash
python3 -m unittest tests/test_historical_model.py -v
```

The scripts use only Python’s standard library. The resulting cache is `src/data/resident-evil-historical.json`.
