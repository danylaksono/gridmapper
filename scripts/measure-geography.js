#!/usr/bin/env node
/**
 * Measure geography retention of the hierarchical grid-in-grid allocator.
 *
 * Compares `order: 'spatial'` (Hilbert-ordered, default) vs `order: 'input'`
 * using the mean Spearman rank correlation between each leaf's geographic
 * centroid (x / y) and its allocated grid cell (gridX / gridY).
 *
 * Spearman ≈ Pearson on ranks, so it measures how well relative positions are
 * preserved regardless of absolute scale.
 *
 * Usage:
 *   node scripts/measure-geography.js [cap]        (cap = max features, default 7275)
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateHierarchical } from "../src/index.js";
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

// Pearson correlation of two arrays.
function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const u = a[i] - ma;
    const v = b[i] - mb;
    num += u * v;
    da += u * u;
    db += v * v;
  }
  return num / Math.sqrt(da * db) || 0;
}

// Average ranks with ties (for Spearman).
function ranks(values) {
  const idx = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v || a.i - b.i);
  const out = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = avg;
    i = j + 1;
  }
  return out;
}

function spearman(a, b) {
  return pearson(ranks(a), ranks(b));
}

async function measure(features, cap, treemapOpts) {
  const data = cap ? features.slice(0, cap) : features;
  const points = data.map((f) => {
    const [x, y] = centroid(f);
    return {
      name: f.properties.name,
      code: f.properties.code,
      provinsi_code: f.properties.provinsi_code,
      kab_kota_code: f.properties.kab_kota_code,
      x,
      y,
    };
  });

  const t0 = performance.now();
  const result = await allocateHierarchical(points, {
    levels: ["provinsi_code", "kab_kota_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
    order: "spatial",
    ...treemapOpts,
  });
  const dt = Math.round(performance.now() - t0);

  const asg = result.assignments.filter((a) => !a._subdivided);
  const gx = asg.map((a) => a.x);
  const gy = asg.map((a) => a.y);
  const cx = asg.map((a) => a.gridX);
  // Invert the row so "north = top": larger latitude should map to a smaller
  // grid row index, so we correlate lat with (maxRow - gridY) → ideal +1.
  const maxRow = result.meta.rows - 1;
  const cy = asg.map((a) => maxRow - a.gridY);

  const sx = spearman(gx, cx);
  const sy = spearman(gy, cy);
  return { ...treemapOpts, dt, n: asg.length, sx, sy, mean: (sx + sy) / 2 };
}

async function main() {
  glpk = await glpkImport();
  const cap =
    process.argv[2] && !isNaN(Number(process.argv[2]))
      ? Number(process.argv[2])
      : null;
  const geo = JSON.parse(fs.readFileSync(`${GEO}/kecamatan.geojson`, "utf8"));
  console.log(`features: ${cap ?? geo.features.length} (kecamatan layer)\n`);

  const combos = [];
  // baseline: input order
  combos.push(await measure(geo.features, cap, { order: "input" }));
  // data-adaptive default (no overrides)
  combos.push(await measure(geo.features, cap, { order: "spatial" }));
  // spatial order variations
  for (const orderMode of ["hilbert", "z", "xy", "xyDesc", "yx", "yxDesc"]) {
    for (const dirPolicy of ["spread", "spreadNorm", "orderKey", "aspect"]) {
      combos.push(await measure(geo.features, cap, { orderMode, dirPolicy }));
    }
  }

  combos.sort((a, b) => b.mean - a.mean);
  console.log(
    "rank  order      orderMode  dirPolicy   X      Y      mean    ms",
  );
  combos.forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(2)}    ${String(c.order ?? "spatial").padEnd(9)} ${String(c.orderMode ?? "input").padEnd(10)} ${String(c.dirPolicy ?? "aspect").padEnd(9)}  ${c.sx.toFixed(3)}  ${c.sy.toFixed(3)}  ${c.mean.toFixed(3)}  ${c.dt}`,
    );
  });
}

let glpk = null;
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
