const KALSHI_MARKETS_URLS = [
  "https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXRT&status=open&limit=200",
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXRT&status=open&limit=200",
];
const KALSHI_SNAPSHOT_URL =
  "https://cheickdiakite-yikes.github.io/cutline-movie-market/kalshi-live.json";
const KALSHI_CACHE_FRESH_MS = 60_000;
const KALSHI_CACHE_STALE_SECONDS = 15 * 60;

const CREATE_USER_IDEAS_SQL = `CREATE TABLE IF NOT EXISTS user_ideas (
  user_id TEXT NOT NULL,
  event_ticker TEXT NOT NULL,
  idea_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('research', 'later', 'passed')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_ticker)
)`;
const CREATE_USER_IDEAS_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS user_ideas_user_updated_idx ON user_ideas (user_id, updated_at)";
const DISPOSITIONS = new Set(["research", "later", "passed"]);
const initializedBindings = new WeakMap();

const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });

function readAuthenticatedUser(request) {
  const id = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!id || !email) return null;
  let name = null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (
    encodedName &&
    request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      name = null;
    }
  }
  return { id, email, name };
}

async function ensureIdeasSchema(db) {
  let pending = initializedBindings.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(CREATE_USER_IDEAS_SQL),
      db.prepare(CREATE_USER_IDEAS_INDEX_SQL),
    ]).catch((error) => {
      initializedBindings.delete(db);
      throw error;
    });
    initializedBindings.set(db, pending);
  }
  await pending;
}

function createD1IdeaStore(db) {
  return {
    async list(userId) {
      await ensureIdeasSchema(db);
      const result = await db
        .prepare(
          "SELECT payload_json FROM user_ideas WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .bind(userId)
        .all();
      return (result.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.payload_json)];
        } catch {
          return [];
        }
      });
    },
    async put(userId, idea) {
      await ensureIdeasSchema(db);
      const now = new Date().toISOString();
      const payload = { ...idea, savedAt: now };
      await db
        .prepare(
          `INSERT INTO user_ideas
            (user_id, event_ticker, idea_id, disposition, payload_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, event_ticker) DO UPDATE SET
             idea_id = excluded.idea_id,
             disposition = excluded.disposition,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          userId,
          payload.eventTicker,
          payload.id,
          payload.disposition,
          JSON.stringify(payload),
          now,
          now,
        )
        .run();
      return payload;
    },
    async remove(userId, eventTicker) {
      await ensureIdeasSchema(db);
      await db
        .prepare("DELETE FROM user_ideas WHERE user_id = ? AND event_ticker = ?")
        .bind(userId, eventTicker)
        .run();
    },
  };
}

const ideaStore = (env) => env.IDEAS_STORE || (env.DB ? createD1IdeaStore(env.DB) : null);

function validateIdea(value, expectedTicker) {
  if (!value || typeof value !== "object") return null;
  const eventTicker = String(value.eventTicker || "").trim().toUpperCase();
  const movie = String(value.movie || "").trim();
  const threshold = Number(value.threshold);
  const disposition = String(value.disposition || "").trim();
  if (
    eventTicker !== expectedTicker ||
    !/^KXRT-[A-Z0-9-]{1,40}$/.test(eventTicker) ||
    !movie ||
    movie.length > 180 ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 100 ||
    !DISPOSITIONS.has(disposition)
  ) {
    return null;
  }
  const normalized = {
    ...value,
    id: String(value.id || `${eventTicker}-${threshold}`).slice(0, 100),
    eventTicker,
    movie,
    threshold,
    disposition,
  };
  return JSON.stringify(normalized).length <= 64_000 ? normalized : null;
}

async function handleAccountApi(request, env, url) {
  const user = readAuthenticatedUser(request);
  if (url.pathname === "/api/session") {
    if (request.method !== "GET") return json({ status: "method not allowed" }, 405, { allow: "GET" });
    return json(
      user
        ? { authenticated: true, user: { email: user.email, name: user.name }, persistence: "account" }
        : { authenticated: false, user: null, persistence: "device" },
      200,
      { "cache-control": "private, no-store" },
    );
  }

  if (!url.pathname.startsWith("/api/ideas")) return null;
  if (!user) {
    return json(
      { status: "authentication required", reason: "Sign in with ChatGPT to sync ideas across devices." },
      401,
      { "cache-control": "private, no-store" },
    );
  }
  const store = ideaStore(env);
  if (!store) {
    return json(
      { status: "unavailable", reason: "The account idea store is not connected." },
      503,
      { "cache-control": "private, no-store" },
    );
  }

  if (url.pathname === "/api/ideas") {
    if (request.method !== "GET") return json({ status: "method not allowed" }, 405, { allow: "GET" });
    return json({ items: await store.list(user.id) }, 200, { "cache-control": "private, no-store" });
  }

  const encodedTicker = url.pathname.slice("/api/ideas/".length);
  let eventTicker;
  try {
    eventTicker = decodeURIComponent(encodedTicker).trim().toUpperCase();
  } catch {
    return json({ status: "invalid event ticker" }, 400);
  }
  if (!/^KXRT-[A-Z0-9-]{1,40}$/.test(eventTicker)) {
    return json({ status: "invalid event ticker" }, 400);
  }

  if (request.method === "PUT") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ status: "invalid content type" }, 415);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ status: "invalid json" }, 400);
    }
    const idea = validateIdea(body?.idea, eventTicker);
    if (!idea) return json({ status: "invalid idea" }, 400);
    return json({ item: await store.put(user.id, idea) }, 200, {
      "cache-control": "private, no-store",
    });
  }

  if (request.method === "DELETE") {
    await store.remove(user.id, eventTicker);
    return json({ removed: true }, 200, { "cache-control": "private, no-store" });
  }

  return json({ status: "method not allowed" }, 405, { allow: "PUT, DELETE" });
}

function kalshiResponse(
  payload,
  observedAt,
  mode = "live",
  upstreamHost = null,
  transport = "direct API",
) {
  return json(
    {
      source: {
        provider: "Kalshi public market API",
        observedAt,
        mode,
        upstreamHost,
        transport,
        documentation: "https://docs.kalshi.com/getting_started/quick_start_market_data",
      },
      cursor: payload.cursor || null,
      markets: payload.markets,
    },
    200,
    { "cache-control": "public, max-age=15, stale-while-revalidate=45" },
  );
}

function kalshiCacheKey(origin, cursor) {
  const key = new URL("/__cutline/cache/kalshi-markets", origin);
  if (cursor) key.searchParams.set("cursor", cursor);
  return new Request(key.toString());
}

async function readKalshiCache(cache, key) {
  if (!cache) return null;
  try {
    const response = await cache.match(key);
    if (!response?.ok) return null;
    const cached = await response.json();
    if (!Array.isArray(cached?.payload?.markets) || !cached?.observedAt) return null;
    return cached;
  } catch {
    return null;
  }
}

async function writeKalshiCache(cache, key, cached) {
  if (!cache) return;
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(cached), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${KALSHI_CACHE_STALE_SECONDS}`,
        },
      }),
    );
  } catch {
    // A cache failure must not turn a healthy upstream response into an outage.
  }
}

async function fetchKalshiPayload(upstreamFetch, cursor) {
  const failures = [];
  for (const baseUrl of KALSHI_MARKETS_URLS) {
    const upstreamUrl = new URL(baseUrl);
    if (cursor) upstreamUrl.searchParams.set("cursor", cursor);
    try {
      const response = await upstreamFetch(upstreamUrl.toString(), {
        headers: { accept: "application/json", "user-agent": "Cutline/0.2 market research" },
      });
      if (!response.ok) {
        failures.push(`${upstreamUrl.host}:${response.status}`);
        continue;
      }
      const payload = await response.json();
      if (!Array.isArray(payload.markets)) {
        failures.push(`${upstreamUrl.host}:invalid response`);
        continue;
      }
      return { payload, upstreamHost: upstreamUrl.host, failures };
    } catch {
      failures.push(`${upstreamUrl.host}:unreachable`);
    }
  }
  return { payload: null, upstreamHost: null, failures };
}

async function fetchKalshiSnapshot(upstreamFetch) {
  const snapshotUrl = new URL(KALSHI_SNAPSHOT_URL);
  snapshotUrl.searchParams.set("bucket", String(Math.floor(Date.now() / 300_000)));
  try {
    const response = await upstreamFetch(snapshotUrl.toString(), {
      headers: { accept: "application/json", "user-agent": "Cutline/0.2 market research" },
    });
    if (!response.ok) return { snapshot: null, failure: `${snapshotUrl.host}:${response.status}` };
    const snapshot = await response.json();
    const observedAt = snapshot?.source?.observedAt;
    if (!Array.isArray(snapshot?.markets) || !snapshot.markets.length || !observedAt) {
      return { snapshot: null, failure: `${snapshotUrl.host}:invalid response` };
    }
    const ageMs = Date.now() - Date.parse(observedAt);
    return {
      snapshot: {
        payload: { cursor: null, markets: snapshot.markets },
        observedAt,
        mode: Number.isFinite(ageMs) && ageMs <= 15 * 60_000 ? "live" : "stale mirror",
        upstreamHost: snapshot.source?.upstreamHost || "external-api.kalshi.com",
        transport: "scheduled GitHub Pages mirror",
      },
      failure: null,
    };
  } catch {
    return { snapshot: null, failure: `${snapshotUrl.host}:unreachable` };
  }
}

export async function handleKalshiMarkets(env, cursor = null, origin = "https://cutline.local") {
  const upstreamFetch = env.KALSHI_FETCH || fetch;
  const cache = env.KALSHI_CACHE || globalThis.caches?.default || null;
  const cacheKey = kalshiCacheKey(origin, cursor);
  const cached = await readKalshiCache(cache, cacheKey);
  const cachedAt = cached ? Date.parse(cached.observedAt) : Number.NaN;
  if (cached && Number.isFinite(cachedAt) && Date.now() - cachedAt <= KALSHI_CACHE_FRESH_MS) {
    return kalshiResponse(
      cached.payload,
      cached.observedAt,
      cached.mode || "live",
      cached.upstreamHost,
      cached.transport,
    );
  }

  const result = await fetchKalshiPayload(upstreamFetch, cursor);
  if (result.payload) {
    const observedAt = new Date().toISOString();
    await writeKalshiCache(cache, cacheKey, {
      observedAt,
      mode: "live",
      upstreamHost: result.upstreamHost,
      transport: "direct API",
      payload: result.payload,
    });
    return kalshiResponse(result.payload, observedAt, "live", result.upstreamHost);
  }

  const mirror = await fetchKalshiSnapshot(upstreamFetch);
  if (mirror.snapshot) {
    await writeKalshiCache(cache, cacheKey, mirror.snapshot);
    return kalshiResponse(
      mirror.snapshot.payload,
      mirror.snapshot.observedAt,
      mirror.snapshot.mode,
      mirror.snapshot.upstreamHost,
      mirror.snapshot.transport,
    );
  }

  if (cached) {
    return kalshiResponse(
      cached.payload,
      cached.observedAt,
      "stale cache",
      cached.upstreamHost,
      cached.transport,
    );
  }

  return json(
    {
      status: "unavailable",
      reason: `Kalshi market data could not be reached (${[
        ...result.failures,
        mirror.failure,
      ].filter(Boolean).join(", ")})`,
    },
    502,
    { "cache-control": "no-store" },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const accountResponse = await handleAccountApi(request, env, url);
    if (accountResponse) return accountResponse;
    if (url.pathname === "/api/kalshi/markets") {
      if (request.method !== "GET") {
        return json({ status: "method not allowed" }, 405, { allow: "GET" });
      }
      return handleKalshiMarkets(env, url.searchParams.get("cursor"), url.origin);
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
