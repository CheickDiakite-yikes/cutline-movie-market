# Cutline architecture

## Current system

```text
config/markets/*.json
        +
audited Kaggle/TMDB CSV snapshot
        |
        v
scripts/historical_model.py
  - validates the movie configuration
  - normalizes movies, cast, and crew
  - excludes target and post-snapshot outcomes
  - calculates cohorts, priors, coverage, and contributions
        |
        v
src/data/markets/<slug>.json + market-index.json
        |
        +----------------------------------+
                                           |
audited Rotten Tomatoes CSV snapshot       |
        |                                  |
        v                                  |
scripts/critic_outcomes.py                 |
  - audits label and review coverage       |
  - calculates strict threshold benchmarks|
  - measures the exact TMDB join           |
  - fails closed on calibration            |
        |                                  |
        v                                  v
src/data/critic-benchmark.json ------> React/Vite Scout
                                           |
Kalshi public market API                   |
        |                                  |
        v                                  |
worker /api/kalshi/markets -------------->+
  - fixed KXRT read-only request
  - source timestamp and cache policy
  - explicit unavailable response on failure
                                           |
                                           v
                              Saved Ideas in localStorage
                                           |
                                           v
                                versioned JSON export/import
```

The historical and critic pipelines are deterministic offline batches. The Sites worker is the only live server boundary: it serves static assets, provides SPA fallback, and proxies a fixed unauthenticated Kalshi market-data request. It does not accept arbitrary upstream URLs, store credentials, or place trades.

## Multi-movie lifecycle

Active KXRT events appear automatically from Kalshi. An event can exist in one of two explicit states:

| State | Available | Withheld |
| --- | --- | --- |
| Live market only | Event, thresholds, last price, bid/ask, volume, close time, freshness, Save/Pass | Movie art, historical fit, talent prior, data coverage, probability, edge |
| Live + modeled | All live context plus a reviewed `config/markets/*.json` artifact and explainable historical scores | Probability and edge remain unavailable until critic calibration passes |

Adding a configured movie does not require a React edit. The builder emits a JSON artifact, and Vite discovers all files under `src/data/markets/` at build time.

## Source-of-truth boundaries

| Concern | Source of truth |
| --- | --- |
| Movie definitions and model parameters | `config/markets/*.json` |
| Data versions, rights, and archive checksums | `config/data-sources.json` |
| Historical calculations | `scripts/historical_model.py` |
| Critic benchmark and calibration gate | `scripts/critic_outcomes.py` |
| Checked-in movie artifacts | `src/data/markets/*.json` |
| Modeled-market registry | `src/data/market-index.json` |
| Critic benchmark artifact | `src/data/critic-benchmark.json` |
| Kalshi response normalization | `src/lib/kalshi.js` |
| Saved Ideas file contract | `src/lib/ideas.js` |
| Product UI and interactions | `src/App.jsx` and `src/styles.css` |
| Sites runtime and Kalshi proxy | `worker/index.js` |
| Sites packaging | `scripts/prepare-sites-build.mjs` |
| Prototype constraints | `AGENTS.md` and `CLAUDE.md` |

## Truth and failure contracts

- Kalshi values carry an observation timestamp and a `live`, `stale cache`, or `unavailable` mode.
- The open application refreshes the paginated KXRT slate every 60 seconds and again when its browser tab becomes visible.
- A failed Kalshi refresh may expose the last cached response only when it is visibly labeled stale.
- Market price is never inserted into the historical or critic score.
- A live event without a generated movie artifact never borrows another movie's cohort, artwork, or score.
- The critic benchmark remains descriptive until a larger identifier crosswalk and forward-time validation succeed.
- Missing data reduces availability; it never receives an invented neutral score.
- No runtime path places orders or accepts brokerage credentials.

## Portability

### Sites

`npm run build` writes Vite assets into `dist/client`, then copies the worker and hosting binding into the Sites layout. `tests/sites-worker.test.mjs` protects static asset handling, SPA fallback, the scoped Kalshi endpoint, fail-closed upstream behavior, and required artifacts.

### Other hosts

Any host can serve `dist/client` with an SPA fallback. To preserve live markets, it must also implement the fixed `/api/kalshi/markets` boundary or an equivalent trusted server-side adapter. Without that adapter, the application remains useful for checked-in historical research but labels the market layer stale or unavailable.

### Claude Code and local development

The repository uses standard React, Vite, Node, and Python files. Vite proxies `/api/kalshi/markets` to Kalshi's public endpoint in local development. Claude Code or another agent can work directly from the repository without a Sites-specific local runtime.

## Next service boundaries

1. **Critic identifier crosswalk** — map a larger rights-cleared critic label set to stable movie IDs.
2. **Forward calibration** — recreate each film's features as of its release date and validate threshold probabilities chronologically.
3. **Early-signal collectors** — collect trailer, search, and social observations with provider, query, geography, window, and timestamp.
4. **Versioned scoring service** — return feature versions, model versions, contributions, samples, freshness, and unavailable fields.
5. **Authenticated idea store** — add shared persistence only after identity and access requirements are defined; preserve portable JSON files.
6. **Scheduler and alerts** — recompute after validated source changes and notify only under explicit user rules.

Every future live response should carry:

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

Keep provider-specific logic out of React components, retain source snapshots for contract tests, separate historical outcomes from pre-release features, and preserve the Sites build until an approved hosting migration exists.
