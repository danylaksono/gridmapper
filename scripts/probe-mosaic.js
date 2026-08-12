#!/usr/bin/env node
/**
 * Probe / validation for the M2 mosaic hierarchical allocator.
 *
 * Runs the village layer with each mosaic shapeType ('rect' | 'circle' | 'hex')
 * and validates:
 *   - every village cell lies strictly inside its parent shape polygon,
 *   - every shape has enough inside-cells for its villages,
 *   - timing.
 * Optionally renders an SVG of the mosaic.
 *
 * Usage:
 *   node scripts/probe-mosaic.js [cap] [--render]
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateMosaicHierarchical } from "../src/index.js";
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

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Convert a shape-local cell (r, c) to a point inside the shape bbox.
function cellCenterToGeo(shape, r, c, rows, cols) {
  const tx = cols > 1 ? c / (cols - 1) : 0.5;
  const ty = rows > 1 ? r / (rows - 1) : 0.5;
  return [
    shape.bbox.minX + tx * (shape.bbox.maxX - shape.bbox.minX),
    shape.bbox.minY + ty * (shape.bbox.maxY - shape.bbox.minY),
  ];
}

async function run(features, cap, shapeType, render) {
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

  const t0 = performance.now();
  const result = await allocateMosaicHierarchical(points, {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
    shapeType,
    seed: 1,
  });
  const dt = Math.round(performance.now() - t0);

  // validation: every assigned cell lies inside its parent shape
  let bad = 0;
  const shapeById = new Map(result.shapes.map((s) => [s.id, s]));
  for (const a of result.assignments) {
    const s = shapeById.get(a._shapeId);
    if (s.type === 'rect') {
      // rect: the local grid IS the block; containment is by construction.
      if (a.gridX < 0 || a.gridX >= a.shapeCols || a.gridY < 0 || a.gridY >= a.shapeRows) bad++;
      continue;
    }
    const [gx, gy] = cellCenterToGeo(s, a.gridY, a.gridX, a.shapeRows, a.shapeCols);
    if (!pointInPolygon(gx, gy, s.polygon)) bad++;
  }
  // shape capacity check
  let underfilled = 0;
  for (const s of result.shapes) {
    if (s.leafCount > s.shapeRows * s.shapeCols) underfilled++;
  }

  console.log(
    `[${shapeType.padEnd(6)}] ${result.assignments.length} leaves, ${result.shapes.length} shapes, ${dt}ms | cells inside shape: ${result.assignments.length - bad}/${result.assignments.length}` +
      (bad ? `  BAD=${bad}` : "  ✓") +
      ` | underfilled shapes: ${underfilled}`,
  );

  if (render) renderSvg(result, `demo/mosaic-${shapeType}.svg`, shapeType);
  return result;
}

function renderSvg(result, out, shapeType) {
  // bounding box of all shapes
  let bx = Infinity,
    BX = -Infinity,
    by = Infinity,
    BY = -Infinity;
  for (const s of result.shapes) {
    bx = Math.min(bx, s.bbox.minX);
    BX = Math.max(BX, s.bbox.maxX);
    by = Math.min(by, s.bbox.minY);
    BY = Math.max(BY, s.bbox.maxY);
  }
  const pad = (BX - bx) * 0.03;
  const W = 1000;
  const H = 700;
  const sx = (W - 40) / (BX - bx + 2 * pad);
  const sy = (H - 40) / (BY - by + 2 * pad);
  const S = Math.min(sx, sy);
  const offX = 20 + (W - 40 - (BX - bx) * S) / 2;
  const offY = 20 + (H - 40 - (BY - by) * S) / 2;
  const px = (x) => offX + (x - bx) * S;
  const py = (y) => offY + (BY - y) * S;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f7f9fc"/>`;
  const palette = ["#e8f1ff", "#fdf0d5", "#e7f6e7", "#fdeaea", "#eef0f7", "#f9f4e9", "#e8f6f6", "#f6ebfb"];
  result.shapes.forEach((s, i) => {
    const d = s.polygon
      .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
      .join(" ");
    svg += `<polygon points="${d}" fill="${palette[i % palette.length]}" stroke="#33415c" stroke-width="1.5" stroke-linejoin="round"/>`;
  });
  for (const a of result.assignments) {
    const s = result.shapes.find((sh) => sh.id === a._shapeId);
    const [gx, gy] = cellCenterToGeo(s, a.gridY, a.gridX, a.shapeRows, a.shapeCols);
    svg += `<circle cx="${px(gx).toFixed(1)}" cy="${py(gy).toFixed(1)}" r="1.7" fill="#1a3a6b" opacity="0.85"/>`;
  }
  svg += `</svg>`;
  fs.writeFileSync(out, svg);
  console.log(`  wrote ${out}`);
}

async function main() {
  glpk = await glpkImport();
  const args = process.argv.slice(2);
  const capArg = args.find((a) => !isNaN(Number(a)));
  const cap = capArg ? Number(capArg) : null;
  const render = args.includes("--render");
  const only = args.find((a) => a !== "--render" && isNaN(Number(a)));
  const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
  const use = cap ? geo.features.slice(0, cap) : geo.features;
  console.log(`features: ${use.length} (kel_desa layer)\n`);

  const types = only ? [only] : ["rect", "circle", "hex"];
  for (const shapeType of types) {
    await run(use, null, shapeType, render);
  }
}

let glpk = null;
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
