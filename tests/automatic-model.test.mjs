import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildAutomaticModel,
  normalizeTitle,
  resolveSnapshotEnrichment,
  titleFamilyKey,
} from "../src/lib/automatic-model.js";

const prior = JSON.parse(fs.readFileSync(new URL("../src/data/automatic-prior.json", import.meta.url), "utf8"));
const enrichment = JSON.parse(fs.readFileSync(new URL("../src/data/target-enrichment.json", import.meta.url), "utf8"));

const event = (title = "Unmatched Movie", closeTime = "2026-09-21T14:00:00Z") => ({
  eventTicker: "KXRT-NEW",
  title,
  closeTime,
  markets: [65, 70, 75, 80, 85].map((threshold) => ({ threshold })),
});

test("normalizes a stable lexical title-family key", () => {
  assert.equal(titleFamilyKey("The Avengers: Doomsday"), "avengers");
  assert.equal(titleFamilyKey("Dune: Part Three"), "dune");
});

test("resolves only one exact snapshot title inside the release window", () => {
  const avengers = event("Avengers: Doomsday", "2026-12-21T15:00:00Z");
  assert.equal(normalizeTitle(avengers.title), "avengers doomsday");
  assert.equal(resolveSnapshotEnrichment(avengers, enrichment).movieId, 1003596);
  assert.equal(resolveSnapshotEnrichment(event("Unknown New Movie"), enrichment), null);
  assert.equal(resolveSnapshotEnrichment(event("Avengers: Doomsday", "2032-12-21T15:00:00Z"), enrichment), null);
});

test("creates a numeric automatic model for a previously unconfigured market", () => {
  const model = buildAutomaticModel(event(), prior);
  assert.equal(model.automation.specificity, "low");
  assert.equal(model.market.kalshi.eventTicker, "KXRT-NEW");
  assert.ok(Number.isFinite(model.scores.historicalFit.value));
  assert.ok(Number.isFinite(model.scores.talentPrior.value));
  assert.equal(model.scores.talentPrior.sampleSize, 0);
  assert.equal(model.thresholdCalibration.status, "unavailable");
  for (const score of Object.values(model.scores)) {
    assert.equal(score.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
  }
});

test("adds strongly-shrunk title-family context without treating it as a confirmed franchise", () => {
  const model = buildAutomaticModel(event("Avengers: Doomsday", "2026-12-21T15:00:00Z"), prior);
  const family = model.scores.historicalFit.factors.find((factor) => factor.label === "Lexical title-family prior");
  assert.equal(model.automation.specificity, "medium-low");
  assert.equal(family.sampleSize, 4);
  assert.match(family.status, /NOT A CONFIRMED FRANCHISE/);
  assert.ok(model.scores.dataCoverage.value > buildAutomaticModel(event(), prior).scores.dataCoverage.value);
});

test("never uses market price fields as automatic-model inputs", () => {
  const base = buildAutomaticModel(event(), prior);
  const pricedEvent = event();
  pricedEvent.markets = pricedEvent.markets.map((market) => ({ ...market, lastPrice: 99, yesBid: 98, yesAsk: 100 }));
  assert.equal(buildAutomaticModel(pricedEvent, prior).scores.historicalFit.value, base.scores.historicalFit.value);
});

test("upgrades an exact target match into genre and talent-aware factors", () => {
  const enriched = buildAutomaticModel(
    event("Avengers: Doomsday", "2026-12-21T15:00:00Z"),
    prior,
    enrichment,
  );
  assert.equal(enriched.automation.enrichmentMode, "audited-snapshot-exact-match");
  assert.equal(enriched.automation.specificity, "medium-high");
  assert.equal(enriched.target.movieId, 1003596);
  assert.ok(enriched.market.artwork.startsWith("https://image.tmdb.org/"));
  assert.ok(enriched.target.leadCast.includes("Chris Hemsworth"));
  assert.ok(enriched.scores.talentPrior.sampleSize > 0);
  assert.equal(enriched.scores.talentPrior.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
  assert.equal(enriched.scores.historicalFit.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
});
