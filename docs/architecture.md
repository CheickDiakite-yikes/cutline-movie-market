# Cutline architecture

## Current system

```text
Kaggle/TMDB CSV snapshot
        |
        v
scripts/historical_model.py
  - validates and normalizes rows
  - applies time-aware eligibility rules
  - calculates cohort and talent priors
  - records provenance, checksums, and missingness
        |
        v
src/data/resident-evil-historical.json
        |
        v
React/Vite frontend
  - Scout decision frame
  - explainable score drawers
  - Saved Ideas in localStorage
        |
        v
Vite static build + Sites worker
  - dist/client assets
  - dist/server SPA fallback
  - dist/.openai Sites binding
```

The historical pipeline is deterministic and offline. The hosting worker serves the application shell. Neither component currently fetches live market or audience data.

## Source-of-truth boundaries

| Concern | Source of truth |
| --- | --- |
| Historical calculations | `scripts/historical_model.py` |
| Checked-in UI payload | `src/data/resident-evil-historical.json` |
| Dataset audit and licensing | `docs/historical-data.md` |
| Product UI and interactions | `src/App.jsx` and `src/styles.css` |
| Sites runtime behavior | `worker/index.js` |
| Sites packaging | `scripts/prepare-sites-build.mjs` |
| Prototype constraints | `AGENTS.md` and `CLAUDE.md` |

## Portability

### Sites

`npm run build` writes Vite assets into `dist/client`, then copies the worker and hosting binding into the layout required by Sites. `tests/sites-worker.test.mjs` protects static asset handling, SPA fallback, API/write 404 behavior, and required build artifacts.

### Other static hosts

The frontend can run on any host that serves `dist/client` and routes unknown browser paths to `index.html`. Do not copy the Sites project binding to a different team or environment without authorization.

### Claude Code and local development

The codebase uses standard React, Vite, Node, and Python files. Claude Code or another agent can work directly from the repository without a Sites-specific local runtime. `CLAUDE.md` mirrors the product and data guardrails that must survive agent handoffs.

## Recommended live-backend layers

These are extension boundaries, not connected features:

1. **Market adapter** — fetch and timestamp Kalshi price, volume, status, close time, and contract metadata. Preserve the untouched provider payload for auditing.
2. **Critic outcome store** — maintain time-stamped Rotten Tomatoes observations and final outcomes. This is required before estimating threshold probabilities.
3. **Early-signal jobs** — collect trailer, search, and social observations with provider, query, geography, window, normalization, and freshness metadata.
4. **Scoring service** — version feature definitions and weights; return contributions, samples, freshness, provenance, and unavailable fields alongside every score.
5. **Idea store** — replace localStorage with authenticated team persistence only when identity and access requirements are defined.
6. **Scheduler and alerts** — recompute ideas after validated source updates and notify only under explicit user-configured rules.

Each live response should carry:

```text
source
observed_at
freshness_status
sample_size
feature_version
model_version
contributions
unavailable_fields
```

Do not let an adapter's failure silently reuse stale data as current. A stale or missing signal should remain visible and should reduce availability rather than receive an invented neutral value.

## Suggested repository evolution

Keep the current frontend and historical batch pipeline stable while adding live services behind explicit interfaces. When a real API is introduced:

- keep provider-specific logic out of React components;
- add contract tests for every response;
- preserve snapshot fixtures with provenance;
- separate historical outcome data from pre-release features;
- add time-based train/validation splits before any probability claim; and
- keep Sites packaging green or document an approved hosting migration.
