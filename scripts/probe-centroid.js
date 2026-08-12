#!/usr/bin/env node
/**
 * Probe: centroid-only allocation.
 *
 * Demonstrates the whole point of the centroid table: the 166 MB kel_desa
 * polygon payload is NEVER parsed just to allocate. The allocators run on
 * lightweight { id, x, y, ...parent codes } records loaded from a compact
 * NDJSON table (built on demand if missing).
 *
 * Validates the same invariants as the other probes:
 *   - hierarchical: every village cell inside its kecamatan/kabupaten/provinsi block
 *   - mosaic rect  : every village cell inside its parent shape's block
 *
 * Usage:
 *   node scripts/probe-centroid.js [cap] [--merge]
 *
 *   --merge: additionally load the full GeoJSON and attach the grid fields
 *            back onto the real features via mergeAssignmentsToFeatures
 *            (exercises the merge-back path; heavier memory).
 */
import fs from "fs";
import glpkImport from "glpk.js";
import {
  allocateHierarchical,
  allocateMosaicHierarchical,
  loadCentroidRecords,
  extractCentroidRecords,
  saveCentroidRecords,
  mergeAssignmentsToFeatures,
} from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";
const TABLE = `${GEO}/kel_desa.centroids.jsonl`;
const LEVELS = ["provinsi_code", "kab_kota_code", "kecamatan_code"];

async function ensureTable() {
  if (fs.existsSync(TABLE)) return;
  const t0 = performance.now();
  const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
  const recs = extractCentroidRecords(geo.features, {
    levelKeys: LEVELS,
    extra: ["name"],
  });
  await saveCentroidRecords(TABLE, recs, { format: "jsonl" });
  console.log(
    `  [build] centroid table: ${recs.length} records in ${Math.round(performance.now() - t0)}ms`,
  );
}

function rectContainsCell(r, row, col) {
  return row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1;
}

function collectBlocks(nodes, out = new Map()) {
  for (const n of nodes) {
    if (n._block) out.set(n.id, n._block);
    if (n.children.length) collectBlocks(n.children, out);
  }
  return out;
}

function validateHierarchy(result) {
  const blocks = collectBlocks(result.hierarchy);
  let bad = 0;
  for (const a of result.assignments) {
    if (a._subdivided) continue; // sub-cell containment by construction
    const cell = { r: a.gridY, c: a.gridX };
    for (const pid of a._path) {
      if (!rectContainsCell(blocks.get(pid), cell.r, cell.c)) {
        bad++;
        break;
      }
    }
  }
  console.log(
    `  [hierarchy] ${result.assignments.length} leaves, ${bad} containment violations ${bad === 0 ? "✓" : "✗"}`,
  );
  return bad === 0;
}

function validateMosaic(result) {
  let bad = 0;
  for (const a of result.assignments) {
    // Rect-mosaic assignments carry shape-LOCAL gridX/gridY. The local grid
    // is inscribed in the parent block (containment by construction), so a
    // valid cell just has to be within the shape-local grid bounds.
    if (a.gridY < 0 || a.gridY >= a.shapeRows) bad++;
    else if (a.gridX < 0 || a.gridX >= a.shapeCols) bad++;
  }
  console.log(
    `  [mosaic]    ${result.assignments.length} leaves, ${bad} containment violations ${bad === 0 ? "✓" : "✗"}`,
  );
  return bad === 0;
}

async function main() {
  const capArg = process.argv.find((a) => /^\d+$/.test(a));
  const cap = capArg ? Number(capArg) : 0;
  const doMerge = process.argv.includes("--merge");
  const glpk = await glpkImport();

  await ensureTable();

  const t0 = performance.now();
  const data = await loadCentroidRecords(TABLE, { limit: cap || undefined });
  console.log(
    `[load] centroid table: ${data.length} records in ${Math.round(performance.now() - t0)}ms  (${Math.round(fs.statSync(TABLE).size / 1024)} KB on disk)`,
  );

  const base = {
    levels: LEVELS,
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    idAccessor: (d) => d.code ?? d.id,
    weightOf: (d) => d.weight ?? 1,
    mip: () => new GLPKSolver(glpk),
  };

  const t1 = performance.now();
  const hier = await allocateHierarchical(data, base);
  console.log(
    `[hierarchy] grid-in-grid on centroids only: ${Math.round(performance.now() - t1)}ms`,
  );
  const hierOk = validateHierarchy(hier);

  const t2 = performance.now();
  const mosaic = await allocateMosaicHierarchical(data, {
    ...base,
    shapeType: "rect",
  });
  console.log(
    `[mosaic]    rect on centroids only: ${Math.round(performance.now() - t2)}ms  (${mosaic.shapes.length} shapes)`,
  );
  const mosaicOk = validateMosaic(mosaic);

  if (doMerge) {
    const t3 = performance.now();
    const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
    const full = geo.features.slice(0, cap || undefined);
    const enriched = mergeAssignmentsToFeatures(full, hier.assignments, {
      idAccessor: (d) => d.properties.code,
      assignmentIdOf: (a) => a.id, // table records use `id` as the key field
    });
    const withGrid = enriched.filter((f) => f.gridX !== undefined).length;
    console.log(
      `[merge]     attached grid to ${withGrid}/${full.length} full features in ${Math.round(performance.now() - t3)}ms (geometry preserved)`,
    );
  }

  console.log(
    `\ncentroid-only: ${hierOk && mosaicOk ? "ALL CHECKS PASS ✓" : "FAILURES ✗"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
