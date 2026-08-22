import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseThresholds,
  fetchKalshiSlate,
  groupKalshiEvents,
  normalizeKalshiPayload,
} from "../src/lib/kalshi.js";

const rawMarket = (event, threshold, title = "Film Rotten Tomatoes score?") => ({
  ticker: `${event}-${threshold}`,
  event_ticker: event,
  title,
  subtitle: `Above ${threshold}`,
  floor_strike: threshold,
  status: "active",
  close_time: "2026-09-21T14:00:00Z",
  updated_time: "2026-08-21T12:00:00Z",
  last_price_dollars: "0.7400",
  yes_bid_dollars: "0.7200",
  yes_ask_dollars: "0.7600",
  volume_fp: "120.50",
  volume_24h_fp: "20.00",
});

test("normalizes public Kalshi dollar fields without treating them as model output", () => {
  const slate = normalizeKalshiPayload({ markets: [rawMarket("KXRT-AAA", 80)] }, "2026-08-21T12:01:00Z");
  assert.equal(slate.markets[0].lastPrice, 74);
  assert.equal(slate.markets[0].yesBid, 72);
  assert.equal(slate.markets[0].yesAsk, 76);
  assert.equal(slate.source.mode, "live");
});

test("groups a continuous slate by event and selects configured thresholds", () => {
  const markets = [75, 80, 85, 90].map((threshold) => rawMarket("KXRT-AAA", threshold));
  const event = groupKalshiEvents(normalizeKalshiPayload({ markets }).markets)[0];
  assert.equal(event.title, "Film");
  assert.deepEqual(chooseThresholds(event, [75, 80, 85]), [75, 80, 85]);
});

test("paginates and deduplicates the continuous Kalshi slate", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return Response.json({ cursor: "next page", markets: [rawMarket("KXRT-AAA", 75)] });
    }
    return Response.json({ cursor: "", markets: [rawMarket("KXRT-AAA", 75), rawMarket("KXRT-BBB", 80)] });
  };
  const slate = await fetchKalshiSlate(fetcher);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /cursor=next%20page/);
  assert.equal(slate.markets.length, 2);
});
