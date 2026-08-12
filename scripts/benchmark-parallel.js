#!/usr/bin/env node
/**
 * Benchmark: parallel leaf-packing (worker_threads) vs sequential.
 *
 * Runs the same hierarchical / mosaic allocation with concurrency=1 vs
 * concurrency=N and checks:
 *   - output equality (every assignment cell identical),
 *   - wall-clock speedup.
 *
 * Usage: node scripts/benchmark-parallel.js [cap]
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateHierarchical, allocateMosaicHierarchical } from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";

function centroid(feature) {
  const coords =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates.flat(2)
      : feature.geometry.coordinates.flat(1);
  let x = 0,
    y = 0;
  for (const [px, py] of coords) {
    x += px;
    y += py;
  }
  const n = coords.length;
  return [x / n, y / n];
}

function cellKey(a) {
  return `${a.gridY}_${a.gridX}_${a.shapeRows}x${a.shapeCols}${a._subdivided ? "_sub" : ""}`;
}
function sameOutput(a, b) {
  if (a.assignments.length !== b.assignments.length) return false;
  for (let i = 0; i < a.assignments.length; i++) {
    if (cellKey(a.assignments[i]) !== cellKey(b.assignments[i])) return false;
  }
  return true;
}

async function runPair(label, fn, concurrency) {
  const t0 = performance.now();
  const res = await fn(concurrency);
  const dt = Math.round(performance.now() - t0);
  console.log(`  ${label} concurrency=${concurrency}: ${dt}ms  (${res.assignments.length} leaves, ${res.meta.containers ?? res.meta.levels ? "" : ""}${res.shapes ? res.shapes.length + " shapes" : ""})`);
  return { res, dt };
}

async function main() {
  const glpk = await glpkImport();
  const capArg = process.argv[2];
  const cap = capArg && !isNaN(Number(capArg)) ? Number(capArg) : 12000;

  const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
  const data = geo.features.slice(0, cap).map((f) => {
    const [x, y] = centroid(f);
    return {
      name: f.properties.name,
      code: f.properties.code,
      provinsi_code: f.properties.provinsi_code,
      kab_kota_code: f.properties.kab_kota_code,
      kecamatan_code: f.properties.kecamatan_code,
      x,
      y,
    };
  });
  console.log(`features: ${data.length} (kel_desa)\n`);

  const base = {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
  };

  // --- hierarchical (grid-in-grid) ---
  console.log("== allocateHierarchical ==");
  const h1 = await runPair("hierarchical", (c) => allocateHierarchical(data, { ...base, concurrency: c }), 1);
  const hN = await runPair("hierarchical", (c) => allocateHierarchical(data, { ...base, concurrency: c }), 4);
  console.log(`  output identical: ${sameOutput(h1.res, hN.res) ? "YES ✓" : "NO ✗"}`);
  console.log(`  speedup: ${(h1.dt / Math.max(1, hN.dt)).toFixed(2)}x`);

  // --- mosaic (rect) ---
  console.log("\n== allocateMosaicHierarchical (rect) ==");
  const m1 = await runPair("mosaic-rect", (c) => allocateMosaicHierarchical(data, { ...base, shapeType: "rect", concurrency: c }), 1);
  const mN = await runPair("mosaic-rect", (c) => allocateMosaicHierarchical(data, { ...base, shapeType: "rect", concurrency: c }), 4);
  console.log(`  output identical: ${sameOutput(m1.res, mN.res) ? "YES ✓" : "NO ✗"}`);
  console.log(`  speedup: ${(m1.dt / Math.max(1, mN.dt)).toFixed(2)}x`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
