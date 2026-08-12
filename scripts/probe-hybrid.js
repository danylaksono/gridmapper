#!/usr/bin/env node
/**
 * Probe / validation for the M2b HYBRID hierarchical allocator.
 *
 * Mosaic nested inside a coarser treemap block:
 *   provinsi blocks (treemap) → kabupaten blocks (treemap) → local kecamatan
 *   mosaic (rect | circle | hex) inside each kabupaten block → villages packed
 *   one-per-cell into each kecamatan shape.
 *
 * Validates:
 *   - every village cell inside its kecamatan shape (point-in-polygon for
 *     circle/hex, shape-local bounds for rect),
 *   - every kecamatan shape inside its kabupaten block,
 *   - every kabupaten block inside its provinsi block (via _block/_path).
 * Optionally renders an SVG (group blocks + kecamatan shapes + village cells).
 *
 * Usage:
 *   node scripts/probe-hybrid.js [cap] [shapeType] [--render out.svg]
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateHybridHierarchical } from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";
const LEVELS = ["provinsi_code", "kab_kota_code", "kecamatan_code"];

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

function localCellToPos(shape, r, c) {
  const tx = shape.shapeCols > 1 ? c / (shape.shapeCols - 1) : 0.5;
  const ty = shape.shapeRows > 1 ? r / (shape.shapeRows - 1) : 0.5;
  return [
    shape.bbox.minX + tx * (shape.bbox.maxX - shape.bbox.minX),
    shape.bbox.minY + ty * (shape.bbox.maxY - shape.bbox.minY),
  ];
}

function collectBlocks(nodes, out = new Map()) {
  for (const n of nodes) {
    if (n._block) out.set(n.id, n._block);
    if (n.children.length) collectBlocks(n.children, out);
  }
  return out;
}

function validate(result, shapeType) {
  const blocks = collectBlocks(result.hierarchy);
  const groupBlocks = new Map(
    result.groups.map((g) => [g.id, { block: g._block, path: g._path }]),
  );

  let badVillage = 0; // village outside its kecamatan shape
  let badShape = 0; // kecamatan shape outside its kabupaten block
  let badGroup = 0; // kabupaten block outside its provinsi block

  // 1) villages inside their kecamatan shape
  for (const a of result.assignments) {
    const shape = a._shape;
    if (shape.type === "rect") {
      const ok =
        a.gridX >= 0 &&
        a.gridX < a.shapeCols &&
        a.gridY >= 0 &&
        a.gridY < a.shapeRows;
      if (!ok) badVillage++;
    } else {
      const [x, y] = localCellToPos(shape, a.gridY, a.gridX);
      if (!pointInPolygon(x, y, shape.polygon)) badVillage++;
    }
  }

  // 2) each kecamatan shape inside its kabupaten block (half-open bound)
  for (const s of result.shapes) {
    const g = groupBlocks.get(s.id) || groupBlocks.get(s.block && s.block.id);
    if (!g) continue;
    const b = g.block;
    const inside =
      s.bbox.minX >= b.c0 - 1e-9 &&
      s.bbox.maxX <= b.c1 + 1 + 1e-9 &&
      s.bbox.minY >= b.r0 - 1e-9 &&
      s.bbox.maxY <= b.r1 + 1 + 1e-9;
    if (!inside) badShape++;
  }

  // 3) each kabupaten block inside its provinsi block
  for (const g of result.groups) {
    const p = g._path;
    for (let i = 0; i < p.length - 1; i++) {
      const parent = blocks.get(p[i]);
      if (!parent) continue;
      if (
        g._block.r0 < parent.r0 ||
        g._block.r1 > parent.r1 ||
        g._block.c0 < parent.c0 ||
        g._block.c1 > parent.c1
      ) {
        badGroup++;
        break;
      }
    }
  }

  const ok = badVillage === 0 && badShape === 0 && badGroup === 0;
  console.log(
    `  [village-in-shape]  ${result.assignments.length} leaves, ${badVillage} violations`,
  );
  console.log(
    `  [shape-in-block]    ${result.shapes.length} shapes, ${badShape} violations`,
  );
  console.log(
    `  [group-in-parent]   ${result.groups.length} groups, ${badGroup} violations`,
  );
  return ok;
}

function renderSvg(result, shapeType, outfile) {
  const C = 6; // px per cell
  const gridRows = result.meta.gridRows;
  const gridCols = result.meta.gridCols;
  const W = gridCols * C;
  const H = gridRows * C;
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${W + 8} ${H + 8}" width="${W + 8}" height="${H + 8}">`,
  );
  parts.push(
    `<rect x="-4" y="-4" width="${W + 8}" height="${H + 8}" fill="#f4f6f8"/>`,
  );

  // kabupaten (group) blocks
  const groupBlockById = new Map(result.groups.map((g) => [g.id, g._block]));
  for (const g of result.groups) {
    const b = g._block;
    parts.push(
      `<rect x="${b.c0 * C}" y="${b.r0 * C}" width="${(b.c1 - b.c0 + 1) * C}" height="${(b.r1 - b.r0 + 1) * C}" fill="#dde4ea" stroke="#8aa0b0" stroke-width="1"/>`,
    );
  }

  // kecamatan shapes
  const colors = [
    "#4c78a8",
    "#54a24b",
    "#e45756",
    "#f58518",
    "#72b7b2",
    "#b279a2",
  ];
  const shapeColor = (s) => colors[Number(s.id) % colors.length];
  for (const s of result.shapes) {
    const fill = shapeColor(s);
    if (s.type === "rect") {
      const b = s.block;
      parts.push(
        `<rect x="${b.c0 * C}" y="${b.r0 * C}" width="${(b.c1 - b.c0 + 1) * C}" height="${(b.r1 - b.r0 + 1) * C}" fill="${fill}" fill-opacity="0.55" stroke="#20303c" stroke-width="1.2"/>`,
      );
    } else if (s.type === "circle") {
      const r = s.radius * C;
      parts.push(
        `<circle cx="${s.x * C}" cy="${s.y * C}" r="${r}" fill="${fill}" fill-opacity="0.55" stroke="#20303c" stroke-width="1.2"/>`,
      );
    } else {
      const pts = s.polygon
        .map(([px, py]) => `${(px * C).toFixed(1)},${(py * C).toFixed(1)}`)
        .join(" ");
      parts.push(
        `<polygon points="${pts}" fill="${fill}" fill-opacity="0.55" stroke="#20303c" stroke-width="1.2"/>`,
      );
    }
  }

  // village cells
  for (const a of result.assignments) {
    let gx, gy;
    const s = a._shape;
    if (s.type === "rect") {
      gx = s.block.c0 + a.gridX;
      gy = s.block.r0 + a.gridY;
    } else {
      const [x, y] = localCellToPos(s, a.gridY, a.gridX);
      gx = x;
      gy = y;
    }
    parts.push(
      `<rect x="${gx * C}" y="${gy * C}" width="${C}" height="${C}" fill="#1b1b1b" fill-opacity="0.75"/>`,
    );
  }
  parts.push(`</svg>`);
  fs.writeFileSync(outfile, parts.join("\n"), "utf8");
  console.log(`  [render] wrote ${outfile}`);
}

async function main() {
  const capArg = process.argv.find((a) => /^\d+$/.test(a));
  const cap = capArg ? Number(capArg) : 0;
  const renderIdx = process.argv.indexOf("--render");
  const outfile = renderIdx >= 0 ? process.argv[renderIdx + 1] : null;
  const shapeType =
    process.argv.find((a) => ["rect", "circle", "hex"].includes(a)) ?? "rect";
  const glpk = await glpkImport();

  const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
  const data = geo.features.slice(0, cap || undefined).map((f) => {
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
  console.log(`features: ${data.length} (kel_desa), shapeType: ${shapeType}\n`);

  const t0 = performance.now();
  const result = await allocateHybridHierarchical(data, {
    levels: LEVELS,
    shapeType,
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: new GLPKSolver(glpk),
    seaGapKm: 30,
    seaGutter: 1,
  });
  console.log(
    `[hybrid] ${shapeType} on ${data.length} villages: ${Math.round(performance.now() - t0)}ms  (${result.meta.gridRows}×${result.meta.gridCols} grid, ${result.groups.length} groups, ${result.shapes.length} shapes, ${result.meta.islands} islands)`,
  );

  const ok = validate(result, shapeType);
  console.log(
    `\nhybrid ${shapeType}: ${ok ? "ALL CHECKS PASS ✓" : "FAILURES ✗"}`,
  );

  if (outfile) renderSvg(result, shapeType, outfile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
