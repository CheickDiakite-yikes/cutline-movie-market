# Design QA

## Evidence surface

- Browser: Codex in-app Browser
- URL: local Vite prototype at `http://127.0.0.1:5173/`
- Desktop QA viewport: 1440 × 900, device pixel ratio 1
- States inspected: Scout / Above 80, Scout / Above 85, Historical fit rationale, unavailable Live heat rationale, Saved Ideas with one saved Resident Evil item
- Console: no warning or error entries in the final pass
- Layout metrics: viewport, document, and body all measured exactly 1440 × 900 on the final Scout view; no page overflow

## Visual result

The historical-data changes preserve the selected editorial single-frame composition: movie art and market context dominate the first band; score traces, synthesis, and decision actions remain in one second band; Save and Pass stay visually decisive. The data changes do not introduce dashboard-card clutter or disturb the poster crop.

The main frame now truthfully distinguishes three visual states:

- manual Kalshi reference data in the market panel;
- reproducible Kaggle/TMDB historical priors in the score rail; and
- unavailable RT calibration and live inputs rendered as em dashes rather than estimated values.

At 1440 × 900 the final primary values are readable without scrolling: Historical fit 63, Live heat unavailable, Talent prior 66, and Data coverage 88. The decision area says `NO CALIBRATED ENTRY`, with decision-support-only copy directly below it.

## Score rationale QA

The Historical fit drawer exposes:

- 77-film comparable cohort;
- 151 unique source films contributing across the score's overlapping factors;
- February 17, 2026 source freshness;
- TMDB community rating as the historical outcome;
- each factor's weight, normalized value, point contribution, and sample size;
- named example films;
- six recent comparable films;
- 48-film complete financial sample with median budget and revenue;
- Kaggle and TMDB provenance links; and
- a direct warning that the score is not a Rotten Tomatoes or Kalshi threshold probability.

The Live heat drawer shows `0 connected`, `NOT CONNECTED` freshness, and `NOT CALCULATED` outcome. Kalshi, Rotten Tomatoes critics, trailer velocity, search, and social remain separate, unscored inputs.

## Interaction QA

- Above 75 / 80 / 85 threshold controls update the market question and preserve the uncalibrated model state.
- All four score buttons open the correct rationale.
- The Historical fit drawer is keyboard-dismissable with Escape and closes through its visible Close control.
- Save research idea persists the selected threshold to Saved Ideas.
- Saved Ideas shows no probability or entry rule, uses `RESEARCH` status, and preserves Return to Scout / Remove behavior.
- Pass for now preserves its status toast.
- External market and provenance links target the expected URLs.

## Final result

Passed. No actionable P0, P1, or P2 visual or interaction defects remain in the tested desktop surface.
