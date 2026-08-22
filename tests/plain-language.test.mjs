import assert from "node:assert/strict";
import test from "node:test";
import {
  explainScore,
  plainFactorDetail,
  plainFactorLabel,
  plainScoreLabel,
} from "../src/lib/plain-language.js";

test("turns background scores into plain-language meaning", () => {
  assert.equal(explainScore(63).label, "ABOUT AVERAGE");
  assert.equal(explainScore(66).label, "A LITTLE PROMISING");
  assert.equal(explainScore(88, "coverage").label, "WE KNOW A LOT");
  assert.equal(explainScore(null, "live").label, "NOT CONNECTED");
});

test("replaces specialist score and factor names", () => {
  assert.equal(plainScoreLabel("historical"), "Similar movies");
  assert.equal(plainScoreLabel("coverage"), "How much we know");
  assert.equal(plainFactorLabel("Director prior"), "The director's past movies");
  assert.equal(plainFactorLabel("Genre cohort"), "Movies with a similar style");
});

test("explains sample sizes without statistical jargon", () => {
  assert.equal(
    plainFactorDetail({ label: "Producer prior", sampleSize: 78 }),
    "We checked 78 earlier movies from the credited producers.",
  );
  assert.equal(
    plainFactorDetail({ label: "Talent baseline imputation", sampleSize: 0 }),
    "We do not have a reliable past example for this clue yet.",
  );
});
