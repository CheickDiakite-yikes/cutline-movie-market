# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product direction

- Desktop-first, single-frame movie prediction-market decision view.
- Treat Resident Evil as the first verified fixture, not a hardcoded product boundary. The product must support a continuously refreshed multi-movie Kalshi slate and movie-specific generated model artifacts.
- Preserve the user's sketch structure: movie art and market context first; explainable signal scores and synthesized recommendation below; decisive Save Idea and Pass actions; a separate Saved Ideas view.
- Use an editorial, cinematic visual system rather than generic dashboard cards.
- Prototype model values must be identified as illustrative until a live scoring pipeline is connected. Never present estimated signals as verified market facts.
- This is a non-commercial prototype; the February 2026 Kaggle/TMDB snapshot licensed CC BY-NC-SA 4.0 may be used as long as attribution and the non-commercial limitation stay explicit.
- Keep the repository portable for teammates using Codex, Claude Code, or ordinary local tooling: preserve standard React/Vite/Python workflows, the Sites packaging contract, and truthful documentation of the current backend boundary.
- Keep source layers separate: configured Kaggle/TMDB historical priors, the audited Rotten Tomatoes benchmark, live Kalshi market context, and future critic/trailer/search/social signals must retain their own provenance and freshness. A market price is never a model feature by default.
- Saved ideas must remain portable between teammates. Preserve versioned JSON export/import even if authenticated shared storage is added later.
- Product is decision support only. It may link to Kalshi but must not imply guaranteed returns or place trades.
- Mobile Scout uses a single-viewport, market-ticket-first swipe deck based on the selected August 2026 mock: left passes, right saves, a middle Later action holds an idea for review through Saved, accessible buttons mirror all actions, and the Saved tab sits beside the Cutline wordmark. Preserve the existing desktop composition.
- An automatic model without verified target art or metadata must read as an intentional enrichment-pending state. Never label work as queued unless a real automation has queued it, and never replace unavailable evidence with invented movie-specific values.
- Every live KXRT event should receive Cutline's automatic hierarchical historical prior when no reviewed movie-specific artifact exists. Keep the automatic model visibly graded by specificity and coverage; explicit baseline imputation with sample `n=0` is allowed, but it must never be described as verified target talent, genre, franchise, or critic evidence.
