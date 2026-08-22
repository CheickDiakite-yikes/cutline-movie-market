# Cutline

Cutline is a movie prediction-market research prototype. It combines a cinematic single-frame decision interface with a reproducible historical movie-data layer, while keeping live market, critic, trailer, search, and social signals explicitly separate until real connectors exist.

The current test case is Kalshi's Resident Evil Rotten Tomatoes market. Cutline supports research and watchlist decisions only; it does not place trades or promise returns.

## What is included

- React 19 + Vite frontend with Scout and Saved Ideas views
- Clickable, explainable historical scores with weights, contributions, sample sizes, comparables, freshness, and provenance
- Reproducible Python ingestion and normalization from a checksummed Kaggle/TMDB snapshot
- Checked-in normalized cache so the UI and CI do not require Kaggle credentials
- Sites-compatible worker and packaging contract
- Focused leakage/scoring tests and Sites runtime tests
- GitHub Actions verification for team contributions

## Current truth boundary

| Surface | Current state |
| --- | --- |
| Historical movie layer | Connected to the February 17, 2026 Kaggle/TMDB snapshot |
| Kalshi market values | Manual reference snapshot; not automatically refreshed |
| Rotten Tomatoes critic calibration | Not connected; no threshold probability is calculated |
| Trailer, search, and social signals | Not connected and not estimated |
| Saved Ideas | Local browser storage for the prototype |
| Trading | Decision support only; no order placement |

## Quick start

Requirements:

- Node.js 22+
- npm 10+
- Python 3.10+ only when rebuilding or testing the historical layer

```bash
npm ci
npm run dev
```

The local app is served by Vite. The checked-in historical cache means normal frontend development does not require downloading the raw Kaggle dataset.

Run the complete local verification suite:

```bash
npm test
```

## Historical data

Rebuild from an already-downloaded snapshot:

```bash
npm run data:historical
```

Download the audited Kaggle archive, verify its version-1 checksum, normalize it, and rebuild the cache:

```bash
bash scripts/download_kaggle_data.sh
```

Raw downloads are gitignored. The selected dataset, alternatives considered, schema audit, missingness, scoring weights, and leakage controls are documented in [docs/historical-data.md](docs/historical-data.md).

## Architecture and backend boundary

Cutline currently has two backend-like surfaces:

1. `scripts/historical_model.py` is the deterministic batch data/scoring layer.
2. `worker/index.js` is the Sites hosting worker that serves static assets and SPA fallbacks.

There is not yet a live application API, database, scheduled signal job, or authenticated team account system. Do not describe those as connected. The recommended service boundaries for adding them are in [docs/architecture.md](docs/architecture.md).

## Sites deployment

The production build preserves the Sites packaging contract:

```bash
npm run build
npm run test:sites
```

The build must contain:

```text
dist/client/index.html
dist/server/index.js
dist/.openai/hosting.json
```

`.openai/hosting.json` points to the canonical Cutline Sites project. Teammates should create or select their own Sites project before publishing a fork. Do not overwrite the canonical project without explicit authorization.

## Working in Claude Code or another coding environment

The repository has no dependency on Codex for normal development. A teammate can clone it, run `npm ci`, and use any editor or coding agent. Claude Code contributors should read [CLAUDE.md](CLAUDE.md) first; Codex contributors should follow [AGENTS.md](AGENTS.md).

Keep these portability rules intact:

- build product UI in `src/`;
- keep the normalized cache reproducible from scripts, not hand-edited;
- keep Sites runtime files and tests green;
- do not turn missing live data into a score;
- preserve Saved Ideas and decision-support-only guardrails.

## Licensing and attribution

This repository is intended for the current private, non-commercial team prototype. No general open-source license has been granted for the application code.

The checked-in historical cache is derived from Kaggle's “The Movie Database (TMDB) Comprehensive Dataset,” licensed CC BY-NC-SA 4.0. This product uses TMDB data but is not endorsed or certified by TMDB. See [docs/historical-data.md](docs/historical-data.md) before redistributing data or changing the project's commercial status.
