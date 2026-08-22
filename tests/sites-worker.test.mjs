import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

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
  assert.equal(payload.markets[0].ticker, "KXRT-RES-80");
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

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
