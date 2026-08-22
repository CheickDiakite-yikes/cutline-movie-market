import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function localAccountBoundary() {
  return {
    name: "cutline-local-account-boundary",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname === "/api/session") {
          response.statusCode = request.method === "GET" ? 200 : 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(
            request.method === "GET"
              ? { authenticated: false, user: null, persistence: "device" }
              : { status: "method not allowed" },
          ));
          return;
        }
        if (pathname.startsWith("/api/ideas")) {
          response.statusCode = 401;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({
            status: "authentication required",
            reason: "Local development uses the device-only guest fallback.",
          }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api/kalshi": {
        target: "https://external-api.kalshi.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kalshi/, "/trade-api/v2"),
      },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [localAccountBoundary(), react()],
});
