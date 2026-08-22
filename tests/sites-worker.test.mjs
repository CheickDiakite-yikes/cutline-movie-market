import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

const authenticatedHeaders = (id, email = `${id}@example.test`) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": email,
});

function createMemoryIdeaStore() {
  const rows = new Map();
  const key = (userId, eventTicker) => `${userId}:${eventTicker}`;
  return {
    async list(userId) {
      return [...rows.entries()]
        .filter(([rowKey]) => rowKey.startsWith(`${userId}:`))
        .map(([, item]) => item);
    },
    async put(userId, idea) {
      rows.set(key(userId, idea.eventTicker), idea);
      return idea;
    },
    async remove(userId, eventTicker) {
      rows.delete(key(userId, eventTicker));
    },
  };
}

function createMemoryResponseCache() {
  const responses = new Map();
  return {
    async match(request) {
      return responses.get(request.url)?.clone() || null;
    },
    async put(request, response) {
      responses.set(request.url, response.clone());
    },
  };
}

const residentEvilIdea = (disposition = "research") => ({
  id: "KXRT-RES-80",
  eventTicker: "KXRT-RES",
  movie: "Resident Evil",
  threshold: 80,
  disposition,
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("proxies only the public Kalshi movie-market slate with freshness metadata", async () => {
  let upstreamUrl;
  const response = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), {
    KALSHI_FETCH: async (url) => {
      upstreamUrl = url;
      return Response.json({
        cursor: "next",
        markets: [{ ticker: "KXRT-RES-80", event_ticker: "KXRT-RES", floor_strike: 80 }],
      });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });

  assert.equal(response.status, 200);
  assert.match(upstreamUrl, /series_ticker=KXRT/);
  assert.equal(response.headers.get("cache-control"), "public, max-age=15, stale-while-revalidate=45");
  const payload = await response.json();
  assert.equal(payload.source.provider, "Kalshi public market API");
  assert.equal(payload.source.upstreamHost, "external-api.kalshi.com");
  assert.equal(payload.markets[0].ticker, "KXRT-RES-80");
});

test("uses Kalshi's supported compatibility host when the primary host is rate limited", async () => {
  const upstreamUrls = [];
  const response = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), {
    KALSHI_FETCH: async (url) => {
      upstreamUrls.push(url);
      if (new URL(url).host === "external-api.kalshi.com") {
        return new Response("rate limited", { status: 429 });
      }
      return Response.json({
        cursor: "",
        markets: [{ ticker: "KXRT-VER-80", event_ticker: "KXRT-VER", floor_strike: 80 }],
      });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });

  assert.equal(response.status, 200);
  assert.equal(upstreamUrls.length, 2);
  const payload = await response.json();
  assert.equal(payload.source.upstreamHost, "api.elections.kalshi.com");
  assert.equal(payload.markets[0].event_ticker, "KXRT-VER");
});

test("uses the scheduled public snapshot when both Kalshi hosts rate-limit Sites", async () => {
  const upstreamUrls = [];
  const response = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), {
    KALSHI_FETCH: async (url) => {
      upstreamUrls.push(url);
      if (new URL(url).host !== "cheickdiakite-yikes.github.io") {
        return new Response("rate limited", { status: 429 });
      }
      return Response.json({
        source: {
          observedAt: new Date().toISOString(),
          upstreamHost: "external-api.kalshi.com",
        },
        markets: [
          { ticker: "KXRT-VER-80", event_ticker: "KXRT-VER", floor_strike: 80 },
          { ticker: "KXRT-DIG-75", event_ticker: "KXRT-DIG", floor_strike: 75 },
        ],
      });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });

  assert.equal(response.status, 200);
  assert.equal(upstreamUrls.length, 3);
  const payload = await response.json();
  assert.equal(payload.source.mode, "live");
  assert.equal(payload.source.transport, "scheduled GitHub Pages mirror");
  assert.deepEqual(payload.markets.map((market) => market.event_ticker), ["KXRT-VER", "KXRT-DIG"]);
});

test("reuses a fresh server-side Kalshi response instead of polling upstream per visitor", async () => {
  let upstreamCalls = 0;
  const env = {
    KALSHI_CACHE: createMemoryResponseCache(),
    KALSHI_FETCH: async () => {
      upstreamCalls += 1;
      return Response.json({
        cursor: "",
        markets: [{ ticker: "KXRT-DIG-75", event_ticker: "KXRT-DIG", floor_strike: 75 }],
      });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };

  const first = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), env);
  const second = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), env);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(upstreamCalls, 1);
  assert.equal((await second.json()).markets[0].event_ticker, "KXRT-DIG");
});

test("forwards only an encoded Kalshi cursor when the client paginates", async () => {
  let upstreamUrl;
  const response = await worker.fetch(new Request("https://example.test/api/kalshi/markets?cursor=page two"), {
    KALSHI_FETCH: async (url) => {
      upstreamUrl = url;
      return Response.json({ cursor: "", markets: [] });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });

  assert.equal(response.status, 200);
  assert.equal(new URL(upstreamUrl).searchParams.get("cursor"), "page two");
  assert.equal(new URL(upstreamUrl).searchParams.get("series_ticker"), "KXRT");
});

test("fails closed when Kalshi is unavailable", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/kalshi/markets"), {
    KALSHI_FETCH: async () => new Response("upstream down", { status: 503 }),
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });

  assert.equal(response.status, 502);
  assert.equal((await response.json()).status, "unavailable");
});

test("reports an anonymous device session without accepting account reads", async () => {
  const env = {
    IDEAS_STORE: createMemoryIdeaStore(),
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };
  const session = await worker.fetch(new Request("https://example.test/api/session"), env);
  assert.deepEqual(await session.json(), {
    authenticated: false,
    user: null,
    persistence: "device",
  });

  const ideas = await worker.fetch(new Request("https://example.test/api/ideas"), env);
  assert.equal(ideas.status, 401);
});

test("stores Saved, Later, and Pass decisions per authenticated user", async () => {
  const env = {
    IDEAS_STORE: createMemoryIdeaStore(),
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };
  for (const [userId, disposition] of [["friend-one", "later"], ["friend-two", "passed"]]) {
    const response = await worker.fetch(
      new Request("https://example.test/api/ideas/KXRT-RES", {
        method: "PUT",
        headers: { ...authenticatedHeaders(userId), "content-type": "application/json" },
        body: JSON.stringify({ idea: residentEvilIdea(disposition) }),
      }),
      env,
    );
    assert.equal(response.status, 200);
  }

  const first = await worker.fetch(
    new Request("https://example.test/api/ideas", { headers: authenticatedHeaders("friend-one") }),
    env,
  );
  const second = await worker.fetch(
    new Request("https://example.test/api/ideas", { headers: authenticatedHeaders("friend-two") }),
    env,
  );
  assert.equal((await first.json()).items[0].disposition, "later");
  assert.equal((await second.json()).items[0].disposition, "passed");
});

test("validates account idea writes and lets only the owner remove them", async () => {
  const env = {
    IDEAS_STORE: createMemoryIdeaStore(),
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };
  const invalid = await worker.fetch(
    new Request("https://example.test/api/ideas/KXRT-RES", {
      method: "PUT",
      headers: { ...authenticatedHeaders("friend-one"), "content-type": "application/json" },
      body: JSON.stringify({ idea: { ...residentEvilIdea(), eventTicker: "KXRT-OTHER" } }),
    }),
    env,
  );
  assert.equal(invalid.status, 400);

  await worker.fetch(
    new Request("https://example.test/api/ideas/KXRT-RES", {
      method: "PUT",
      headers: { ...authenticatedHeaders("friend-one"), "content-type": "application/json" },
      body: JSON.stringify({ idea: residentEvilIdea() }),
    }),
    env,
  );
  await worker.fetch(
    new Request("https://example.test/api/ideas/KXRT-RES", {
      method: "DELETE",
      headers: authenticatedHeaders("friend-two"),
    }),
    env,
  );
  const ownerIdeas = await worker.fetch(
    new Request("https://example.test/api/ideas", { headers: authenticatedHeaders("friend-one") }),
    env,
  );
  assert.equal((await ownerIdeas.json()).items.length, 1);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(new URL("../dist/.openai/drizzle/0000_wild_kat_farrell.sql", import.meta.url));
});
