# Design QA

## Evidence

- Source visual truth: `qa-source-sketch.png`
- Source pixels: 3024 x 4032 after orientation correction; the source is a photographed portrait wireframe, not a pixel-fidelity UI mock.
- Implementation: `qa-implementation-scout-1440.png`
- Implementation pixels and CSS viewport: 1440 x 900 at device pixel ratio 1.
- Browser-rendered comparison: `qa-comparison.png`
- State: Scout view, Resident Evil, Above 80 selected, saved state visible.
- Full-view evidence: the comparison places the source sketch and final browser capture in one image. The implementation preserves the source hierarchy: primary movie image first, market context beside it, selectable scores below, synthesized recommendation below/adjacent, and persistent decision actions within one frame.
- Focused-region evidence: a separate crop was not needed because the source is a low-detail wireframe. The browser screenshot is readable at native size, and score detail anatomy was verified by opening the Critical fit drawer.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the condensed utility labels, heavy display numerals, bold editorial headings, and serif analysis copy create a clear hierarchy. Text remains legible and contained at 1440 x 900.
- Spacing and layout rhythm: the page fits exactly within the 1440 x 900 viewport with no horizontal or vertical overflow. Borders and repeated grid tracks translate the sketch into a disciplined single-frame composition.
- Colors and visual tokens: paper, ink, cold blue, and blood-red accents follow the Resident Evil artwork and clearly separate verified market data, the prototype model, edge, and actions. Contrast is sufficient on the tested screen.
- Image quality and asset fidelity: the real Resident Evil promotional image is sharp and correctly cropped. No placeholder, code-drawn illustration, or improvised logo replaces the movie artwork.
- Copy and content: the exact user-selected Kalshi market is used. Current market values are separated from explicitly illustrative model values, and the decision-support limitation is visible.
- Interaction states: threshold switching, score rationale drawer, Save Idea, Pass, Saved Ideas navigation, saved-row rendering, and Return to Scout all work.
- Browser console: no error or warning entries in the final interaction pass.

## Comparison History

1. First browser capture: `qa-implementation-scout-1440-before-crop.png`.
   - [P2] The initial movie-art crop emphasized the empty upper field and partially duplicated the poster title behind the interface title, reducing subject recognition.
   - Fix: moved the artwork focal point lower so the official title, release line, central courier, vehicles, and fire establish the movie immediately.
2. Post-fix browser capture: `qa-implementation-scout-1440.png`.
   - The movie art now has a clear focal subject and the primary interface title remains readable on its dedicated band.
   - The recomposed comparison in `qa-comparison.png` shows no remaining P0/P1/P2 mismatch against the source hierarchy.

## Primary Interactions Tested

- Opened the Critical fit score rationale and verified its factor list and calculation explanation.
- Switched from Above 80 to Above 85 and verified the market values and NO EDGE stance changed, then returned to Above 80.
- Saved the Resident Evil idea and verified the Saved Ideas count and table row.
- Returned to Scout and verified Pass for now shows a status message.
- Confirmed the external market link targets the user-provided Kalshi URL.

## Follow-up Polish

- P3: once live data connectors exist, replace the prototype signal labels with per-source freshness timestamps and observed sample sizes.

final result: passed
