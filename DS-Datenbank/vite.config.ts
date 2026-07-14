import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ONE_HOUR_MS = 60 * 60 * 1000;

type CacheEntry = {
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
};

function proxyCachePlugin(): Plugin {
  const cache = new Map<string, CacheEntry>();
  return {
    name: "ds-proxy-cache",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/proxy")) return next();
        try {
          const urlObj = new URL(req.url, "http://localhost");
          const target = urlObj.searchParams.get("url");
          if (!target) {
            res.statusCode = 400;
            res.end("Missing url");
            return;
          }
          const cached = cache.get(target);
          const now = Date.now();
          if (cached && now - cached.timestamp < ONE_HOUR_MS) {
            res.statusCode = cached.status;
            for (const [key, value] of Object.entries(cached.headers)) {
              res.setHeader(key, value);
            }
            res.end(cached.body);
            return;
          }
          const response = await fetch(target);
          const arrayBuffer = await response.arrayBuffer();
          const body = Buffer.from(arrayBuffer);
          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (lower === "set-cookie") return;
            if (lower === "content-encoding") return;
            if (lower === "content-length") return;
            headers[key] = value;
          });
          const entry: CacheEntry = {
            timestamp: now,
            status: response.status,
            headers,
            body,
          };
          cache.set(target, entry);
          res.statusCode = response.status;
          for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value);
          }
          res.end(body);
        } catch (err) {
          res.statusCode = 502;
          res.end("Proxy error");
        }
      });
    },
  };
}

export default defineConfig({
  base: "/DS-Datenbank/",
  plugins: [react({ fastRefresh: false }), proxyCachePlugin()],
});
