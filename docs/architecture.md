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
audited Kaggle/TMDB CSV snapshot           |
        |                                  |
        v                                  |
scripts/automatic_prior.py                 |
  - builds a 2,993-film English baseline  |
  - builds month and title-family priors  |
  - records shrinkage and leakage rules   |
        |                                  |
        v                                  |
src/data/automatic-prior.json              |
        |                                  |
        +----------------------------------+
                                           |
audited Kaggle/TMDB CSV snapshot           |
        |                                  |
        v                                  |
scripts/target_enrichment.py               |
  - indexes dated upcoming targets         |
  - joins genres, artwork, cast, and crew  |
  - calculates leakage-safe filmographies |
        |                                  |
        v                                  |
src/data/target-enrichment.json -----------+
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
                                  signed-in session?
                                   /             \
                                  v               v
                     Sites identity headers    guest device state
                                  |               |
                                  v               v
                        D1 private user ideas   localStorage
                                  \               /
                                   v             v
                                versioned JSON export/import
```

The historical, enrichment, and critic pipelines are deterministic offline batches. The Sites worker is the only live server boundary: it serves static assets, provides SPA fallback, proxies a fixed unauthenticated Kalshi market-data request, and exposes owner-scoped idea APIs. Sites supplies identity headers after ChatGPT sign-in; the browser never chooses the user ID. The worker does not accept arbitrary upstream URLs, store credentials, expose one user's records to another, or place trades.

## Multi-movie lifecycle

Active KXRT events appear automatically from Kalshi. An event can exist in one of three explicit model tiers:

| State | Available | Withheld |
| --- | --- | --- |
| Live + baseline automatic prior | Event, thresholds, price context, numeric historical prior, explicit talent imputation, coverage, specificity, factor trace, Save/Later/Pass | Target genres, cast, crew, poster, critic probability, and edge |
| Live + snapshot-enriched prior | Baseline context plus one exact/date-consistent target identity, genres, release, artwork when present, and ID-joined cast/director/producer histories | Live target freshness, manual review, critic probability, and edge |
| Live + configured model | All live context plus a reviewed `config/markets/*.json` artifact, verified target joins, artwork, and explainable historical scores | Probability and edge remain unavailable until critic calibration passes |

Every live event receives a numeric tier immediately. A configured artifact takes precedence. Otherwise the runtime requires one normalized title candidate within 550 days of settlement before using snapshot enrichment; ambiguity or distance falls back to baseline. Adding a configured movie does not require a React edit: Vite discovers the generated artifact under `src/data/markets/`.

The automatic tier is deterministic and hierarchical:

- 55% global eligible English-language TMDB community-rating baseline;
- 25% settlement-month historical context, visibly labeled as a release-timing proxy; and
- 20% optional lexical title-family context, strongly shrunk toward the baseline and never labeled a confirmed franchise.

Missing target talent is a visible global-baseline imputation with sample `n=0`. The coverage score falls when title-family, genre, talent, or artwork evidence is absent.

The snapshot-enriched tier uses:

- 30% verified target-genre cohort;
- 15% audited target release month;
- 15% strongly-shrunk lexical title-family context;
- 20% lead-cast history;
- 10% director history; and
- 10% producer history.

Target metadata comes only from the audited February 17, 2026 snapshot. The target movie's rating, votes, popularity, budget, and revenue are excluded. A target match is automatic and must not be described as manually reviewed or live.

## Source-of-truth boundaries

| Concern | Source of truth |
| --- | --- |
| Movie definitions and model parameters | `config/markets/*.json` |
| Data versions, rights, and archive checksums | `config/data-sources.json` |
| Historical calculations | `scripts/historical_model.py` |
| Automatic fallback calculation | `scripts/automatic_prior.py` and `src/lib/automatic-model.js` |
| Snapshot target identity and talent catalog | `scripts/target_enrichment.py` and `src/data/target-enrichment.json` |
| Critic benchmark and calibration gate | `scripts/critic_outcomes.py` |
| Checked-in movie artifacts | `src/data/markets/*.json` |
| Checked-in automatic prior | `src/data/automatic-prior.json` |
| Modeled-market registry | `src/data/market-index.json` |
| Critic benchmark artifact | `src/data/critic-benchmark.json` |
| Kalshi response normalization | `src/lib/kalshi.js` |
| Saved Ideas file contract | `src/lib/ideas.js` |
| Account synchronization client | `src/lib/account.js` |
| Product UI and interactions | `src/App.jsx` and `src/styles.css` |
| Sites runtime, identity boundary, idea API, and Kalshi proxy | `worker/index.js` |
| D1 schema and migrations | `db/schema.ts` and `drizzle/` |
| Sites packaging | `scripts/prepare-sites-build.mjs` |
| Prototype constraints | `AGENTS.md` and `CLAUDE.md` |

## Truth and failure contracts

- Kalshi values carry an observation timestamp and a `live`, `stale cache`, or `unavailable` mode.
- The open application refreshes the paginated KXRT slate every 60 seconds and again when its browser tab becomes visible.
- A failed Kalshi refresh may expose the last cached response only when it is visibly labeled stale.
- Market price is never inserted into the historical or critic score.
- A live event without a configured movie artifact receives either an exact/date-consistent snapshot enrichment or the audited baseline prior; it never borrows another target movie's cohort, artwork, talent history, or configured score.
- Ambiguous titles, missing release dates, and release-window mismatches fail closed to the baseline tier.
- Snapshot enrichment carries the dataset freshness date and never claims to be a live TMDB refresh.
- The critic benchmark remains descriptive until a larger identifier crosswalk and forward-time validation succeed.
- Missing target data reduces coverage. A documented global-baseline imputation may be shown only with sample `n=0`, its factor contribution, and an enrichment-pending label.
- No runtime path places orders or accepts brokerage credentials.
- Signed-in Saved, Later, and Pass records are keyed from `oai-authenticated-user-id`; missing identity fails closed for account API routes.
- Anonymous decisions remain explicitly device-only. Pass records are retained for deck continuity but excluded from the Saved view and JSON exports.

## Portability

### Sites

`npm run build` writes Vite assets into `dist/client`, then copies the worker, hosting binding, and generated D1 migrations into the Sites layout. `tests/sites-worker.test.mjs` protects static asset handling, SPA fallback, the scoped Kalshi endpoint, fail-closed upstream behavior, authenticated idea isolation, validation, and required artifacts.

### Other hosts

Any host can serve `dist/client` with an SPA fallback. To preserve live markets, it must implement the fixed `/api/kalshi/markets` boundary or an equivalent trusted server-side adapter. To preserve per-user sync, it must replace Sites identity headers and D1 with an authenticated, owner-scoped implementation of `/api/session` and `/api/ideas`. Without those adapters, the application remains useful for checked-in historical research, labels the market layer stale or unavailable, and uses the device-only guest persistence mode.

### Claude Code and local development

The repository uses standard React, Vite, Node, and Python files. Vite proxies `/api/kalshi/markets` to Kalshi's public endpoint in local development. Claude Code or another agent can work directly from the repository without a Sites-specific local runtime.

## Next service boundaries

1. **Live target metadata enrichment** — use a server-side provider token to resolve stable movie IDs, genres, current release date, artwork, cast, director, and producers for post-snapshot events; require one release-consistent match and retain observation time.
2. **Critic identifier crosswalk** — map a larger rights-cleared critic label set to stable movie IDs.
3. **Forward calibration** — recreate each film's features as of its release date and validate threshold probabilities chronologically.
4. **Early-signal collectors** — collect trailer, search, and social observations with provider, query, geography, window, and timestamp.
5. **Versioned scoring service** — return feature versions, model versions, contributions, samples, freshness, specificity, and unavailable fields.
6. **Opt-in shared idea workspaces** — personal account persistence is connected. Add cross-user collaboration only after roles, invitations, ownership, and deletion requirements are defined; preserve portable JSON files.
7. **Scheduler and alerts** — recompute after validated source changes and notify only under explicit user rules.

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
