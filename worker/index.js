const KALSHI_MARKETS_URL =
  "https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXRT&status=open&limit=200";

const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });

export async function handleKalshiMarkets(env, cursor = null) {
  const upstreamFetch = env.KALSHI_FETCH || fetch;
  try {
    const upstreamUrl = new URL(KALSHI_MARKETS_URL);
    if (cursor) upstreamUrl.searchParams.set("cursor", cursor);
    const response = await upstreamFetch(upstreamUrl.toString(), {
      headers: { accept: "application/json", "user-agent": "Cutline/0.2 market research" },
    });
    if (!response.ok) {
      return json(
        { status: "unavailable", reason: `Kalshi upstream returned ${response.status}` },
        502,
        { "cache-control": "no-store" },
      );
    }
    const payload = await response.json();
    if (!Array.isArray(payload.markets)) {
      return json(
        { status: "unavailable", reason: "Kalshi response did not contain markets" },
        502,
        { "cache-control": "no-store" },
      );
    }
    return json(
      {
        source: {
          provider: "Kalshi public market API",
          observedAt: new Date().toISOString(),
          mode: "live",
          documentation: "https://docs.kalshi.com/getting_started/quick_start_market_data",
        },
        cursor: payload.cursor || null,
        markets: payload.markets,
      },
      200,
      { "cache-control": "public, max-age=15, stale-while-revalidate=45" },
    );
  } catch {
    return json(
      { status: "unavailable", reason: "Kalshi market data could not be reached" },
      502,
      { "cache-control": "no-store" },
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/kalshi/markets") {
      if (request.method !== "GET") {
        return json({ status: "method not allowed" }, 405, { allow: "GET" });
      }
      return handleKalshiMarkets(env, url.searchParams.get("cursor"));
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
