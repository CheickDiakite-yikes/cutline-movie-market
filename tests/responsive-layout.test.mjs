import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("a one-item mobile deck uses the full viewport width", () => {
  assert.match(appSource, /nextEvent \? " has-next" : ""/);
  assert.match(styles, /\.mobile-trade-card\s*\{[\s\S]*?width:\s*100%;/);
  assert.match(styles, /\.mobile-trade-card\.has-next\s*\{\s*width:\s*calc\(100% - 29px\);/);
});

test("short mobile browser viewports keep a real score area", () => {
  assert.doesNotMatch(styles, /min-height:\s*630px/);
  assert.match(styles, /@media \(max-width: 820px\) and \(max-height: 760px\)/);
  assert.match(styles, /\.mobile-score-list\s*\{\s*min-height:\s*96px;/);
  assert.match(styles, /height:\s*calc\(100dvh - 52px\)/);
  assert.match(styles, /minmax\(126px, 1fr\) 50px 0/);
});
