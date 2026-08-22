# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product direction

- Desktop-first, single-frame movie prediction-market decision view.
- Preserve the user's sketch structure: movie art and market context first; explainable signal scores and synthesized recommendation below; decisive Save Idea and Pass actions; a separate Saved Ideas view.
- Use an editorial, cinematic visual system rather than generic dashboard cards.
- Prototype model values must be identified as illustrative until a live scoring pipeline is connected. Never present estimated signals as verified market facts.
- Product is decision support only. It may link to Kalshi but must not imply guaranteed returns or place trades.
