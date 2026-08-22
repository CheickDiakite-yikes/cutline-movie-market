# Contributing to Cutline

## Before changing code

1. Read `README.md`, `AGENTS.md` or `CLAUDE.md`, and the relevant file under `docs/`.
2. Create a focused branch from `main`.
3. Keep source changes scoped; do not commit raw Kaggle downloads, build output, credentials, or unrelated files.

## Verification

Every pull request should pass:

```bash
npm ci
npm test
```

`npm test` runs the historical calculation/leakage tests, builds the Sites package, and tests the Sites worker contract.

For visible UI changes, also inspect:

- the 1440 × 900 Scout view;
- the 390 × 844 mobile Scout deck, including the next-card cue and persistent action area;
- configured, snapshot-enriched, and baseline automatic score-rationale states, especially imputed or unavailable signals;
- Above 75 / 80 / 85 switching;
- Save, Later, Review, Remove, Pass, and Saved Ideas navigation;
- left-to-pass, right-to-save, and keyboard-equivalent deck movement; and
- browser console warnings and errors.

## Data changes

- Do not hand-edit computed scores in `src/data/automatic-prior.json`, `src/data/target-enrichment.json`, `src/data/markets/*.json`, or `src/data/critic-benchmark.json`.
- Rebuild configured models through `scripts/build_historical_model.py`, the automatic fallback through `scripts/build_automatic_prior.py`, and the target catalog through `scripts/build_target_enrichment.py`.
- If Kaggle serves a different archive checksum, stop and repeat the provenance, license, schema, missingness, and leakage audit before accepting it.
- Add or update focused tests whenever scoring eligibility, shrinkage, cohort selection, or weights change.

### Add a movie market

1. Copy `config/markets/resident-evil.json` to a new kebab-case market config.
2. Replace the TMDB movie ID, release context, artwork, Kalshi event ticker, thresholds, cohort rules, and franchise prefixes with sourced values for that release.
3. Run `npm run data:historical`. The builder generates `src/data/markets/<slug>.json` and refreshes `src/data/market-index.json`.
4. Inspect the sample sizes, target talent joins, comparable films, and factor contributions. A successful build is not evidence that the cohort is substantively appropriate.
5. Run `npm run data:verify` while the raw sources are present, followed by `npm test` and browser QA.

Live Kalshi events receive either a conservative exact/date-consistent snapshot enrichment or the baseline automatic prior before a configured artifact exists. Preserve the tier, source date, match status, specificity, imputation, and price-independence language until these steps are complete.

### Share research ideas

Use the Saved Ideas export/import controls for lightweight teammate sharing. The file is versioned, contains research snapshots only, and never contains credentials or trade instructions.

## Pull-request notes

Explain:

- what user outcome changed;
- which data sources and freshness dates are involved;
- what remains illustrative or unconnected;
- which verification commands and browser states were checked; and
- whether Sites packaging or hosting behavior changed.
