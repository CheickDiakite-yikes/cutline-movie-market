import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const KALSHI_MARKETS_URL =
  "https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXRT&status=open&limit=200";
const MAX_PAGES = 10;

export async function buildKalshiSnapshot(fetcher = fetch, observedAt = new Date().toISOString()) {
  const markets = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(KALSHI_MARKETS_URL);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetcher(url.toString(), {
      headers: { accept: "application/json", "user-agent": "Cutline snapshot refresher/0.1" },
    });
    if (!response.ok) throw new Error(`Kalshi returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.markets)) throw new Error("Kalshi response did not contain markets");
    markets.push(...payload.markets);
    cursor = payload.cursor || null;
    if (!cursor) break;
  }
  if (cursor) throw new Error(`Kalshi pagination exceeded ${MAX_PAGES} pages`);

  const deduplicated = [...new Map(markets.map((market) => [market.ticker, market])).values()]
    .filter((market) => market.ticker && market.event_ticker && Number.isFinite(Number(market.floor_strike)));
  if (!deduplicated.length) throw new Error("Kalshi returned no usable open KXRT markets");
  const eventCount = new Set(deduplicated.map((market) => market.event_ticker)).size;

  return {
    schemaVersion: 1,
    source: {
      provider: "Kalshi public market API",
      upstreamHost: "external-api.kalshi.com",
      observedAt,
      mode: "scheduled snapshot",
      transport: "GitHub Actions to GitHub Pages",
      documentation: "https://docs.kalshi.com/getting_started/quick_start_market_data",
    },
    seriesTicker: "KXRT",
    marketCount: deduplicated.length,
    eventCount,
    markets: deduplicated,
  };
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  if (!output) throw new Error("Usage: node scripts/refresh_kalshi_snapshot.mjs --output <path>");
  const snapshot = await buildKalshiSnapshot();
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(`Published ${snapshot.marketCount} markets across ${snapshot.eventCount} movie events.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
