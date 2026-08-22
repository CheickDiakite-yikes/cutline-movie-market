# Claude Code guidance

Read `AGENTS.md`, `README.md`, and `docs/architecture.md` before changing the product.

## Product contracts

- Preserve the desktop-first editorial single-frame Scout composition and the selected market-ticket-first mobile swipe deck.
- On mobile, keep Saved beside the Cutline wordmark; left passes, right saves, and both gestures must retain accessible button and keyboard equivalents.
- Movie art and market context come first; explainable scores and synthesis follow; Save and Pass remain decisive.
- Saved Ideas must continue to work.
- Historical scores must come from `src/data/markets/*.json`, generated from `config/markets/*.json` by `scripts/historical_model.py`.
- The runtime Kalshi slate is market context from the public API. It must never silently become a model probability or remain labeled live after a failed refresh.
- `src/data/critic-benchmark.json` is an audited outcome benchmark, not a calibrated prediction model.
- Never invent or interpolate Kalshi, Rotten Tomatoes, critic, trailer, search, or social observations.
- TMDB community ratings are not Rotten Tomatoes critic scores and cannot be presented as threshold probabilities.
- Keep the decision-support-only language visible. This application does not place trades.

## Sites compatibility

Do not remove or casually rewrite:

- `.openai/hosting.json`
- `worker/index.js`
- `scripts/prepare-sites-build.mjs`
- `tests/sites-worker.test.mjs`

The same repository must remain runnable locally and package successfully for Sites.

## Commands

```bash
npm ci
npm run dev
npm test
```

Historical source rebuild, when raw CSVs are present:

```bash
npm run data:historical
npm run data:critic
npm run data:verify
```

Before handing off any change, run `npm test`. For visible UI changes, also inspect the local Scout, rationale drawer, and Saved Ideas views in a real browser.

## Data and repository hygiene

- Raw Kaggle archives and CSVs stay under gitignored `data/downloads/` and `data/raw/`.
- The small normalized market and critic benchmark JSON caches are committed.
- Preserve unrelated changes and do not broadly clean the worktree.
- Do not publish, deploy, alter the canonical Sites project, or add third-party credentials without explicit authorization.
