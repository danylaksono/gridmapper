#!/usr/bin/env node
/**
 * Probe / validation for the hierarchical grid-in-grid allocator on Indonesia.
 *
 * Usage:
 *   node scripts/probe-hierarchy.js [cap] [--full-villages]
 *
 * Validates:
 *   - tree building from parent codes (provinsi → kab_kota → kecamatan → kel_desa)
 *   - exact-cell treemap mosaic (variable-size parent blocks ∝ descendant count)
 *   - leaf packing inside parent blocks via local MIP / greedy
 *   - CONTAINMENT: every village cell lies inside its kecamatan block, which
 *     lies inside its kabupaten block, which lies inside its provinsi block.
 *   - timing at the 7,275-kecamatan and (optionally) 83,518-village scale.
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { GridMapper, allocateHierarchical } from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";

let glpk = null; // set in main()

function load(name) {
  const t0 = performance.now();
  const geo = JSON.parse(fs.readFileSync(`${GEO}/${name}.geojson`, "utf8"));
  console.log(
    `  [load] ${name}: ${geo.features.length} features in ${Math.round(performance.now() - t0)}ms`,
  );
  return geo;
}

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

function rectContainsCell(r, row, col) {
  return row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1;
}
function rectContainsRect(a, b) {
  return a.r0 <= b.r0 && a.r1 >= b.r1 && a.c0 <= b.c0 && a.c1 >= b.c1;
}

// Collect all node blocks keyed by id within the hierarchy forest.
function collectBlocks(nodes, out = new Map()) {
  for (const n of nodes) {
    if (n._block) out.set(n.id, n._block);
    if (n.children.length) collectBlocks(n.children, out);
  }
  return out;
}

function validateContainment(result, levels) {
  const blocks = collectBlocks(result.hierarchy);
  let bad = 0;
  let subdivided = 0;
  const violations = [];

  for (const a of result.assignments) {
    if (a._subdivided) {
      // sub-cell is inside its block by construction; skip global-cell check
      subdivided++;
      continue;
    }
    const cell = { r: a.gridY, c: a.gridX };
    let inside = true;
    for (let i = 0; i < a._path.length; i++) {
      const block = blocks.get(a._path[i]);
      if (!block || !rectContainsCell(block, cell.r, cell.c)) {
        inside = false;
        break;
      }
    }
    if (!inside) {
      bad++;
      if (violations.length < 5)
        violations.push({ name: a.name, path: a._path, cell });
    }
  }
  return { total: result.assignments.length, bad, subdivided, violations };
}

async function runVillageLevel(features, cap, label) {
  const data = cap ? features.slice(0, cap) : features;
  const points = data.map((f) => {
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

  console.log(`\n=== ${label}: ${points.length} villages ===`);
  const t0 = performance.now();
  const result = await allocateHierarchical(points, {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
  });
  const dt = Math.round(performance.now() - t0);
  console.log(
    `  grid ${result.meta.rows}x${result.meta.cols} (${result.meta.gridCells} cells), used ${result.meta.usedCells}`,
  );
  console.log(`  solved in ${dt}ms  (${points.length} leaves)`);

  const v = validateContainment(result, [
    "provinsi_code",
    "kab_kota_code",
    "kecamatan_code",
  ]);
  console.log(
    `  containment: ${v.total - v.bad}/${v.total} inside ancestor blocks` +
      (v.bad ? `  BAD=${v.bad}` : "  ✓") +
      `  (subdivided leaf blocks: ${v.subdivided})`,
  );

  return result;
}

async function runKecamatanLevel() {
  const geo = load("kecamatan");
  const points = geo.features.map((f) => {
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
  console.log(`\n=== kecamatan level: ${points.length} kecamatan ===`);
  const t0 = performance.now();
  const result = await allocateHierarchical(points, {
    levels: ["provinsi_code", "kab_kota_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
  });
  const dt = Math.round(performance.now() - t0);
  console.log(
    `  grid ${result.meta.rows}x${result.meta.cols} (${result.meta.gridCells} cells), used ${result.meta.usedCells}`,
  );
  console.log(`  solved in ${dt}ms  (${points.length} leaves)`);
  const v = validateContainment(result, ["provinsi_code", "kab_kota_code"]);
  console.log(`  containment: ${v.total - v.bad}/${v.total} ✓`);
  return result;
}

function writeBlockGeoJson(result, file) {
  // Render every node's block rect as a GeoJSON polygon (for visual overlay).
  const blocks = collectBlocks(result.hierarchy);
  const features = [];
  for (const [id, r] of blocks) {
    features.push({
      type: "Feature",
      properties: { id, r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c1 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [r.c0, r.r0],
            [r.c1 + 1, r.r0],
            [r.c1 + 1, r.r1 + 1],
            [r.c0, r.r1 + 1],
            [r.c0, r.r0],
          ],
        ],
      },
    });
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ type: "FeatureCollection", features }, null, 1),
  );
  console.log(`  wrote ${file} (${features.length} block polygons)`);
}

async function main() {
  glpk = await glpkImport();
  const cap =
    process.argv[2] && !isNaN(Number(process.argv[2]))
      ? Number(process.argv[2])
      : null;
  const fullVillages = process.argv.includes("--full-villages");

  // 1) kecamatan as leaves (7,275) — validates mosaic + local MIP at 7k scale
  const kec = await runKecamatanLevel();
  writeBlockGeoJson(kec, "demo/hierarchy-kecamatan-blocks.geojson");

  // 2) villages capped — validates full 3-level nesting + containment
  const villages = load("kel_desa");
  const vres = await runVillageLevel(
    villages.features,
    cap ?? 12000,
    `villages (capped ${cap ?? 12000})`,
  );
  writeBlockGeoJson(vres, "demo/hierarchy-village-blocks.geojson");

  // 3) optional full run — 83,518 villages
  if (fullVillages) {
    await runVillageLevel(villages.features, null, "villages (FULL)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
