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
- all score-rationale states, especially unavailable signals;
- Above 75 / 80 / 85 switching;
- Save, Remove, Pass, and Saved Ideas navigation; and
- browser console warnings and errors.

## Data changes

- Do not hand-edit computed scores in `src/data/resident-evil-historical.json`.
- Rebuild the cache through `scripts/build_historical_model.py`.
- If Kaggle serves a different archive checksum, stop and repeat the provenance, license, schema, missingness, and leakage audit before accepting it.
- Add or update focused tests whenever scoring eligibility, shrinkage, cohort selection, or weights change.

## Pull-request notes

Explain:

- what user outcome changed;
- which data sources and freshness dates are involved;
- what remains illustrative or unconnected;
- which verification commands and browser states were checked; and
- whether Sites packaging or hosting behavior changed.
