import assert from "node:assert/strict";
import test from "node:test";
import { buildKalshiSnapshot } from "../scripts/refresh_kalshi_snapshot.mjs";

const market = (eventTicker, threshold) => ({
  ticker: `${eventTicker}-${threshold}`,
  event_ticker: eventTicker,
  floor_strike: threshold,
});

test("builds a deduplicated multi-page KXRT snapshot with explicit provenance", async () => {
  const calls = [];
  const snapshot = await buildKalshiSnapshot(async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return Response.json({ cursor: "page two", markets: [market("KXRT-VER", 80)] });
    }
    return Response.json({
      cursor: "",
      markets: [market("KXRT-VER", 80), market("KXRT-DIG", 75)],
    });
  }, "2026-08-22T06:30:00.000Z");

  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get("cursor"), "page two");
  assert.equal(snapshot.marketCount, 2);
  assert.equal(snapshot.eventCount, 2);
  assert.equal(snapshot.source.provider, "Kalshi public market API");
  assert.equal(snapshot.source.observedAt, "2026-08-22T06:30:00.000Z");
});

test("refuses to publish an empty or malformed market snapshot", async () => {
  await assert.rejects(
    buildKalshiSnapshot(async () => Response.json({ cursor: "", markets: [] })),
    /no usable open KXRT markets/,
  );
});
