import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifySwipe } from "../src/lib/swipe.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("maps horizontal gestures to card browsing only", () => {
  assert.equal(classifySwipe(96, 12), "previous");
  assert.equal(classifySwipe(-96, 12), "next");
});

test("does not classify taps, short drags, or vertical scrolling as a swipe", () => {
  assert.equal(classifySwipe(4, 2), "none");
  assert.equal(classifySwipe(60, 3), "none");
  assert.equal(classifySwipe(100, 100), "none");
  assert.equal(classifySwipe(Number.NaN, 0), "none");
});

test("the mobile card routes gestures through browsing and decisions through buttons", () => {
  assert.match(appSource, /if \(result === "next" \|\| result === "previous"\) completeBrowse\(result\)/);
  assert.match(appSource, /onClick=\{\(\) => completeDecision\("pass"\)\}/);
  assert.match(appSource, /onClick=\{\(\) => completeDecision\("save"\)\}/);
  assert.doesNotMatch(appSource, /if \(result === "(?:save|pass)"\)/);
});
