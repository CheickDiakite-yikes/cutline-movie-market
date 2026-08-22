const CACHE_KEY = "cutline-kalshi-slate-v1";
const DEFAULT_THRESHOLDS = [75, 80, 85];

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const percentFromDollars = (value) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 100);
};

export function normalizeKalshiPayload(payload, observedAt = new Date().toISOString()) {
  if (!payload || !Array.isArray(payload.markets)) {
    throw new Error("Kalshi response did not contain a markets array");
  }
  const markets = payload.markets
    .map((market) => ({
      ticker: market.ticker,
      eventTicker: market.event_ticker,
      title: market.title,
      subtitle: market.subtitle || market.yes_sub_title,
      threshold: numberOrNull(market.floor_strike),
      status: market.status,
      closeTime: market.close_time,
      updatedTime: market.updated_time,
      lastPrice: percentFromDollars(market.last_price_dollars),
      yesBid: percentFromDollars(market.yes_bid_dollars),
      yesAsk: percentFromDollars(market.yes_ask_dollars),
      volume: numberOrNull(market.volume_fp),
      volume24h: numberOrNull(market.volume_24h_fp),
    }))
    .filter((market) => market.eventTicker && market.ticker && market.threshold !== null);
  return {
    source: payload.source || {
      provider: "Kalshi public market API",
      observedAt,
      mode: "live",
    },
    cursor: payload.cursor || null,
    markets,
  };
}

export function groupKalshiEvents(markets) {
  const groups = new Map();
  for (const market of markets) {
    const group = groups.get(market.eventTicker) || {
      eventTicker: market.eventTicker,
      title: (market.title || market.eventTicker).replace(/ Rotten Tomatoes score\?$/i, ""),
      closeTime: market.closeTime,
      markets: [],
    };
    group.markets.push(market);
    groups.set(market.eventTicker, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      markets: group.markets.sort((left, right) => left.threshold - right.threshold),
    }))
    .sort((left, right) => new Date(left.closeTime) - new Date(right.closeTime));
}

export function chooseThresholds(event, preferred = DEFAULT_THRESHOLDS) {
  if (!event) return preferred;
  const available = event.markets.map((market) => market.threshold);
  const preferredAvailable = preferred.filter((threshold) => available.includes(threshold));
  if (preferredAvailable.length >= 2) return preferredAvailable.slice(0, 3);
  if (available.length <= 3) return available;
  const center = Math.max(0, Math.floor((available.length - 3) / 2));
  return available.slice(center, center + 3);
}

export function readCachedSlate(storage = window.localStorage) {
  try {
    const cached = JSON.parse(storage.getItem(CACHE_KEY));
    if (!cached?.markets?.length) return null;
    return { ...cached, source: { ...cached.source, mode: "stale cache" } };
  } catch {
    return null;
  }
}

export function writeCachedSlate(slate, storage = window.localStorage) {
  storage.setItem(CACHE_KEY, JSON.stringify(slate));
}

export async function fetchKalshiSlate(fetcher = fetch) {
  const rawMarkets = [];
  let cursor = null;
  let source = null;
  for (let page = 0; page < 5; page += 1) {
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetcher(
      `/api/kalshi/markets?series_ticker=KXRT&status=open&limit=200${cursorQuery}`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`Kalshi returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.markets)) throw new Error("Kalshi response did not contain markets");
    rawMarkets.push(...payload.markets);
    source ||= payload.source || null;
    cursor = payload.cursor || null;
    if (!cursor) break;
  }
  const deduplicated = [...new Map(rawMarkets.map((market) => [market.ticker, market])).values()];
  return normalizeKalshiPayload({ markets: deduplicated, source, cursor });
}
