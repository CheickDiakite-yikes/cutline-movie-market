import assert from "node:assert/strict";
import test from "node:test";
import { classifySwipe } from "../src/lib/swipe.js";

test("maps decisive horizontal gestures to the Cutline save and pass actions", () => {
  assert.equal(classifySwipe(96, 12), "save");
  assert.equal(classifySwipe(-96, 12), "pass");
});

test("does not classify taps, short drags, or vertical scrolling as a swipe", () => {
  assert.equal(classifySwipe(4, 2), "none");
  assert.equal(classifySwipe(60, 3), "none");
  assert.equal(classifySwipe(100, 100), "none");
  assert.equal(classifySwipe(Number.NaN, 0), "none");
});
