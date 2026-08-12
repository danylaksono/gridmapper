#!/usr/bin/env node
/**
 * Build a precomputed centroid table for a GeoJSON layer.
 *
 * Reads the full GeoJSON ONCE and writes a compact NDJSON file with only the
 * fields the allocator needs (id, centroid, weight, parent codes, name).
 * Afterwards `scripts/probe-centroid.js` (and any allocator run) loads the
 * table instead of the polygon payload — the heavy geometry is never parsed
 * just to allocate.
 *
 * Usage:
 *   node scripts/build-centroid-table.js [layer] [out]
 *
 *   layer (default 'kel_desa') — GeoJSON name in the kopdes geojson folder.
 *   out   (default <layer>.centroids.jsonl in the same folder).
 */
import fs from "fs";
import path from "path";
import { extractCentroidRecords, saveCentroidRecords } from "../src/index.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";

async function main() {
  const name = process.argv[2] ?? "kel_desa";
  const out = process.argv[3] ?? path.join(GEO, `${name}.centroids.jsonl`);

  const src = path.join(GEO, `${name}.geojson`);
  if (!fs.existsSync(src)) {
    console.error(`not found: ${src}`);
    process.exit(1);
  }

  const t0 = performance.now();
  const geo = JSON.parse(fs.readFileSync(src, "utf8"));
  console.log(
    `[load] ${geo.features.length} features from ${path.basename(src)} in ${Math.round(performance.now() - t0)}ms`,
  );

  const t1 = performance.now();
  const records = extractCentroidRecords(geo.features, {
    levelKeys: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    extra: ["name"],
  });
  console.log(
    `[extract] ${records.length} records in ${Math.round(performance.now() - t1)}ms`,
  );

  const t2 = performance.now();
  await saveCentroidRecords(out, records, { format: "jsonl" });
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(
    `[write] ${path.basename(out)} (${kb} KB) in ${Math.round(performance.now() - t2)}ms`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
