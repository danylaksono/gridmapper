#!/usr/bin/env node
/**
 * Tiny static file server for the demo folder (no dependencies).
 * MapLibre fetches GeoJSON over HTTP, so file:// won't work.
 *
 * Usage:
 *   node scripts/serve-demo.js [port=8123]
 *   → http://localhost:8123/maplibre-hybrid.html?shape=rect
 */
import http from "http";
import fs from "fs";
import path from "path";

const port = Number(process.argv[2] || 8123);
const root = path.resolve("demo");
const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  geojson: "application/geo+json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(
      root,
      urlPath === "/" ? "maplibre-hybrid.html" : urlPath,
    );
    if (!file.startsWith(root)) file = root; // prevent traversal
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found: " + urlPath);
        return;
      }
      const ext = path.extname(file).slice(1).toLowerCase();
      res.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(
      `serving demo/ on http://localhost:${port}/maplibre-hybrid.html?shape=rect`,
    );
  });
