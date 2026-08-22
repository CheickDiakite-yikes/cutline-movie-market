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
- signed-in `SYNC` and anonymous `DEVICE` labels without leaking one user's ideas into another account;
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

The live market transport is deterministic, not AI. The Sites worker tries Kalshi's two officially supported public API hosts and then the scheduled GitHub Pages snapshot produced by `.github/workflows/refresh-kalshi-snapshot.yml`. If you change this boundary, preserve the fixed KXRT scope, source observation time, stale-state behavior, pagination validation, and fail-closed tests. Do not replace unavailable market data with fixtures in production.

## Runtime AI contributions

AI-assisted coding is not the same as runtime AI. The shipped application is currently deterministic: market intake, grouping, target resolution, scores, synthesis copy, and research dispositions do not call an LLM or trained prediction service.

Any pull request that adds runtime AI must:

- identify the exact user-facing task and explain why deterministic logic is insufficient;
- keep sourced evidence synthesis separate from numeric probability calibration;
- declare provider, model, prompt version, structured response schema, and timeout behavior;
- attach source references and observation timestamps to every generated research claim;
- label AI-authored output visibly and preserve the deterministic fallback when the provider fails;
- keep API credentials server-side and out of source, browser bundles, logs, exports, and screenshots;
- add fixtures for valid, malformed, unsupported, contradictory, unavailable, and stale responses; and
- evaluate factual grounding and regression behavior before enabling the feature by default.

Runtime AI must never invent market or critic observations, silently overwrite deterministic scores, convert uncalibrated model text into a trade edge, weaken the exact-match fail-closed rule, or place a trade.

### Share research ideas

Signed-in Sites users receive private Saved, Later, and Pass state through the platform identity headers and D1. Never trust a client-supplied user ID, expose the D1 binding to the browser, or turn personal state into shared team state without an explicit authorization model. Anonymous local and public visitors use the labeled device-only fallback.

Use the Saved Ideas export/import controls for intentional teammate sharing. The file is versioned, contains research snapshots only, omits Pass decisions, and never contains credentials or trade instructions.

When changing `db/schema.ts`, run `npm run db:generate`, inspect the SQL under `drizzle/`, and commit both the schema and generated migration. Keep one SQL statement per prepared D1 query and use batches when runtime initialization needs multiple statements.

## Pull-request notes

Explain:

- what user outcome changed;
- which data sources and freshness dates are involved;
- what remains illustrative or unconnected;
- which verification commands and browser states were checked; and
- whether Sites packaging or hosting behavior changed.
- whether the change introduces runtime AI; if so, list its provider/model, prompt version, evidence contract, evaluation results, and deterministic fallback.
