# Design QA

## Evidence surface

- Browser: Codex in-app Browser
- URL: local Vite prototype at `http://127.0.0.1:5173/`
- Browser viewport available for this pass: 1280 × 720, device pixel ratio 1
- Document size on the final Scout view: 1280 × 798; no horizontal overflow
- Desktop product target retained in CSS and contribution guidance: 1440 × 900
- States inspected: live Resident Evil / Above 80, live Resident Evil / Above 75, Live heat source drawer, unmodeled Mutiny market-only state, Saved Ideas with modeled and unmodeled items, remove and migration behavior
- Console: no warning or error entries; only Vite connection messages and the React development-tools notice
- Captured product image: `docs/assets/cutline-scout-live.jpg`

The in-app Browser surface could not be resized during this run, so this document does not upgrade the 1280 × 720 observation into a claimed 1440 × 900 capture. At the smaller viewport the page has 78 pixels of vertical overflow and no horizontal overflow; the 1440 × 900 desktop target remains the release contract.

## Visual result

The multi-source changes preserve the editorial single-frame direction: movie art and market context dominate the first band; source scores, synthesis, and decision actions remain in the second band; Save and Pass stay decisive. The continuous-market selector is a compact editorial strip rather than a dashboard sidebar.

The main frame now distinguishes four truthful states:

- live Kalshi last trade, bid/ask, close time, and observation freshness;
- reproducible Kaggle/TMDB historical priors for configured movies;
- an audited 278-label Rotten Tomatoes benchmark with calibration explicitly pending; and
- unconfigured live events rendered as `MARKET ONLY`, with a designed poster placeholder and all historical scores withheld.

In the captured Resident Evil state, the Kalshi API returned 20 active KXRT events. The selected Above 80 contract showed a 74% last trade and 75¢ / 77¢ bid/ask at that moment. Those values are time-sensitive browser observations, not committed fixtures or model outputs.

## Source rationale QA

The Live heat drawer exposes:

- Kalshi as `CONNECTED`, with an observation timestamp and the fetched contract sample;
- Rotten Tomatoes history as `BENCHMARK ONLY`, with 278 eligible labels and 12 exact TMDB joins;
- trailer, search, and social as `NOT CONNECTED`;
- no composite live score;
- the critic dataset provenance link; and
- the direct guardrail that market price is context, not a model feature.

The historical rationale continues to expose the 77-film cohort, factor weights and contributions, samples, example films, financial completeness, February 17, 2026 freshness, and TMDB attribution.

## Interaction QA

- The KXRT selector listed configured and unconfigured active movies in one continuous slate.
- Above 75 / 80 / 85 controls changed the selected live contract and values without producing a critic probability or edge.
- Selecting Mutiny displayed its own live market context, a non-invented artwork placeholder, and four unavailable historical scores. It did not borrow Resident Evil data.
- All score buttons opened the corresponding source rationale; the visible Close control worked.
- Saving Mutiny produced a second Saved Ideas row with its saved market snapshot and no historical score.
- Removing that QA item restored the pre-existing Resident Evil idea.
- The original Resident Evil local-storage shape migrated to the current artwork, release label, and 63 historical-fit context.
- Export and Import controls were visible; their versioning, validation, merge, and deduplication behavior is covered by automated tests.

## Final result

Passed for the tested 1280 × 720 browser surface and interaction states. No actionable P0, P1, or P2 visual, truth-labeling, or interaction defect remains. A fresh 1440 × 900 capture should still be included in any later release process that provides a resizable browser surface.
