import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdeasExport,
  mergeIdeas,
  normalizeIdea,
  parseIdeasExport,
} from "../src/lib/ideas.js";

const idea = (id = "KXRT-RES-80") => ({
  id,
  eventTicker: "KXRT-RES",
  movie: "Resident Evil",
  threshold: 80,
  savedAt: "2026-08-21T12:00:00Z",
});

test("migrates the original Resident Evil local idea shape", () => {
  const migrated = normalizeIdea({ id: "resident-evil-rt", movie: "Resident Evil", threshold: 80 });
  assert.equal(migrated.eventTicker, "KXRT-RES");
});

test("round-trips a versioned team ideas export", () => {
  const payload = createIdeasExport([idea()], "2026-08-21T12:00:00Z");
  assert.deepEqual(parseIdeasExport(JSON.stringify(payload)), payload.items);
  assert.equal(payload.items[0].disposition, "research");
});

test("preserves a later disposition so skipped ideas can be revisited", () => {
  const payload = createIdeasExport([{ ...idea(), disposition: "later" }], "2026-08-21T12:00:00Z");
  assert.equal(parseIdeasExport(JSON.stringify(payload))[0].disposition, "later");
});

test("defaults legacy saved ideas to research", () => {
  assert.equal(normalizeIdea(idea()).disposition, "research");
});

test("merges imports without duplicating an existing idea", () => {
  assert.equal(mergeIdeas([idea()], [idea(), idea("KXRT-RES-75")]).length, 2);
});
