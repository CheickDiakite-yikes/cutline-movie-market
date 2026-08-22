# Cutline design QA

## Evidence

- Source visual truth: `/var/folders/vv/nxhl855j0mxb1r8c6qdtfhnw0000gn/T/codex-clipboard-0c4ff1e2-7b2f-4085-a6d1-78e94284f84a.png`
- Browser-rendered implementation: `docs/assets/cutline-mobile-scout.png`
- Side-by-side normalized comparison: `docs/assets/cutline-mobile-comparison.png`
- User-reported market-only state: `/var/folders/vv/nxhl855j0mxb1r8c6qdtfhnw0000gn/T/TemporaryItems/NSIRD_screencaptureui_yRLv0O/Screenshot 2026-08-21 at 11.55.29 PM.png`
- Corrected market-only implementation: `docs/assets/cutline-mobile-market-only.png`
- Market-only before/after comparison: `docs/assets/cutline-mobile-market-only-comparison.png`
- Automatic model mobile state: `docs/assets/cutline-mobile-auto-model.png`
- Selected state: mobile Scout, Resident Evil, Above 80, unsaved, live Kalshi market context, historical model connected.
- Source pixels: 853 × 1844. Source was normalized to 390 × 844 without a device frame.
- Implementation CSS viewport: 390 × 844 at device scale factor 1. The in-app browser has a fixed desktop panel, so a same-origin 390 × 844 iframe was used only as the capture viewport. Browser DOM measurements verified `window.innerWidth = 390`, `window.innerHeight = 844`, card `361 × 788`, document `390 × 844`, actions at y=746–816, and swipe cue at y=816–844. The browser screenshot was cropped to the verified 390 × 844 content viewport.
- Desktop regression surface: 1280 × 720 in the same in-app browser. The document measured 1280 pixels wide with no horizontal overflow; desktop Scout remained visible and mobile Scout remained hidden.

## Full-view comparison

The final side-by-side comparison uses equal-size, content-only mobile frames. The implementation preserves the selected mock's dominant movie art, oversized title, flat editorial market ticket, live price versus historical score split, paired recommendation and synthesis, three tappable evidence rows, persistent Pass, Later, and Save actions, swipe cue, and next-card peek. The requested Saved tab is intentionally added beside the Cutline wordmark.

The implementation uses the repository's real Resident Evil artwork rather than recreating the generated poster. Its crop is therefore not pixel-identical to the ImageGen composition, but the revised 78% focal position keeps the red title, release line, character, and fire visible in the same hero region. The next event is a truthful market-only state without configured artwork, so its peek uses the real live title on an ink surface rather than borrowing or inventing a poster.

## Focused-region comparison

- Header: Cutline, Saved 00, and 01 / 20 fit on one line with no overflow. Saved is a working navigation control, as requested.
- Market ticket: Above 80, 74¢, bid/ask, historical 63, and Trace Score preserve the mock's hierarchy and accurately distinguish live market context from a historical prior.
- Recommendation: Pass for now and the critic-calibration boundary remain visible before action.
- Evidence rows: Fit 63, Talent 66, and Coverage 88 are individually tappable and open the existing provenance drawer.
- Actions: Pass, Later, and Save share the persistent bottom thumb zone. The complete swipe cue is visible at y=816–844.
- Market-only state: the misleading `queued` label is gone. `Research pack not built`, `Not built`, `Why unavailable`, and `N/A` make the source boundary legible without inventing scores or art.
- Automatic model state: every live event now shows numeric Fit, Talent, and Coverage values. The ink artwork treatment identifies the automatic prior and specificity; the ticket labels the score `Auto historical model`; synthesis states that target enrichment and critic probability remain withheld.
- Icons: Phosphor caret and arrow icons are used consistently; no text glyphs, inline SVG art, or CSS-drawn icons replace the source controls.

## Required fidelity surfaces

- Fonts and typography: Anton supplies the condensed display weight; IBM Plex Sans Condensed supplies labels and navigation; Georgia remains limited to synthesis text. Sizes, line heights, tracking, and wrapping were checked at 390 pixels. No app-specific text clips or overlaps.
- Spacing and layout rhythm: the 56-pixel header plus 788-pixel card fit exactly in the 844-pixel viewport. Thin rules, flat surfaces, two-column splits, three evidence rows, 70-pixel actions, and 28-pixel gesture cue match the source hierarchy.
- Colors and visual tokens: implementation uses Cutline's paper, ink, brick red, pale blue, and a warm neutral Later surface. Saved and deferred states remain research states, not trade states.
- Image quality and asset fidelity: the checked-in 2000 × 3000 poster is sharp, correctly cropped, and not stretched. The generated mock's fictional next-card imagery is intentionally not reproduced for an unconfigured event.
- Copy and content: live market price, historical score, no-calibrated-edge language, and decision-support boundary remain truthful. The UI does not expose a Buy or Trade control.

## Interaction and browser QA

- Trace Score opened the Historical fit drawer; the drawer showed the comparable-film cohort and critic benchmark boundary, then closed successfully.
- Saved 00 opened the mobile Saved Ideas empty state and the Cutline wordmark returned to Scout.
- Save created the Resident Evil research snapshot, advanced to the next live event, and updated Saved to 01. The saved row was visible and removable.
- Later created a distinct deferred snapshot, advanced to the next event, labeled the row Later, and Review returned to the exact Resident Evil market. The same path passed on desktop.
- Pass advanced from Resident Evil to Insidious: Out of the Further.
- ArrowRight on the focused card exercised the accessible keyboard-equivalent save-and-advance path.
- Unit tests cover decisive right/save, left/pass, short drag, tap, and vertical-scroll classification.
- A reload check observed no console or page-error event.
- Desktop Scout remained visually unchanged at 1280 × 720 with the live 20-event slate and existing score/synthesis layout.
- Long-title overflow was found during the market-only comparison. The mobile ticket column was constrained to 360 pixels; Pass, Later, and Save now each measure 120 pixels and the document remains exactly 390 pixels wide.
- Browser iteration across all 20 current selector options found no missing Historical fit, Talent prior, or Data coverage values. Resident Evil retained its configured 63 / 66 / 88 scores; automatic examples included Insidious 65 / 66 / 65, Mutiny 65 / 66 / 45, Avengers 66 / 66 / 65, and Dune 66 / 66 / 55 after small lexical-family samples were given proportionally lower coverage credit. Live heat remains intentionally unscored because it has no validated composite.
- The automatic Historical drawer exposed all three factor weights, samples, contributions, the settlement-month proxy, the lexical-not-franchise caveat, source date, 2,993-film reference cohort, and automatic model version. The Talent drawer showed sample `n=0` and the imputation caveat.

## Comparison history

1. Initial browser pass — blocked.
   - [P2] Hero crop emphasized the fog field and placed the Resident Evil title at the lower edge, losing the mock's title-plus-character focal read.
   - [P2] Market question was arranged as a split horizontal row instead of the mock's stacked editorial label and question.
   - Fixes: moved the real poster focal position from 32% to 78%; stacked the market label above the tappable threshold; isolated the comparison origin so the source and implementation both used the unsaved state.
2. Final browser pass — passed.
   - Post-fix comparison shows the real title, date line, central character, and fire in the hero; the market question now follows the selected hierarchy; the complete action and swipe zones fit inside the measured viewport.
3. Later and market-only pass — passed.
   - Added the middle Later path and explicit unavailable labels. The first comparison revealed intrinsic-width overflow on a long movie title; constraining the ticket grid fixed the clipped Save action and synthesis column. The corrected comparison shows all three 120-pixel actions inside the card.
4. Automatic full-slate pass — passed.
   - Verified 20 modeled events at the live QA snapshot: 1 configured and 19 automatic. The 390 × 844 automatic card measured exactly 390 pixels wide and 844 pixels high; the 361-pixel card and three 120-pixel actions remained intact with the longer automatic labels.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- [P3] Configure real artwork for additional live events so the next-card peek can show a cinematic image rather than the honest market-only title treatment.
- [P3] Validate touch drag feel on a physical iPhone before treating gesture velocity and threshold as release-calibrated.

final result: passed
