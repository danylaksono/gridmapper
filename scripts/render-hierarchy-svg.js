#!/usr/bin/env node
/**
 * Render a small region of the hierarchical result as an SVG so the nested
 * mosaic (villages inside kecamatan blocks inside kabupaten blocks) can be
 * inspected visually.
 *
 * Run: node scripts/render-hierarchy-svg.js [cap] [outfile]
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateHierarchical } from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

// collectBlocks (not exported from index) — re-implement locally
function collectBlocks(nodes, out = new Map()) {
  for (const n of nodes) {
    if (n._block) out.set(n.id, n._block);
    if (n.children.length) collectBlocks(n.children, out);
  }
  return out;
}

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

async function main() {
  const cap =
    process.argv[2] && !isNaN(Number(process.argv[2]))
      ? Number(process.argv[2])
      : 4000;
  const out = process.argv[3] || "demo/hierarchy-render.svg";
  const glpk = await glpkImport();

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

  const result = await allocateHierarchical(data, {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
  });

  const blocks = collectBlocks(result.hierarchy);
  const R = result.meta.rows;
  const C = result.meta.cols;
  const S = 8; // px per cell
  const W = C * S + 40;
  const H = R * S + 40;

  // deterministic palette for leaf-parents (kecamatan) blocks
  const palette = [
    "#e8f1ff",
    "#fdf0d5",
    "#e7f6e7",
    "#fdeaea",
    "#eef0f7",
    "#f9f4e9",
    "#e8f6f6",
    "#f6ebfb",
  ];
  let idx = 0;
  const colorOf = new Map();

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n`;
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>\n`;

  // draw kabupaten-level blocks lightly (to show the mosaic)
  for (const [id, b] of blocks) {
    const isLeafParent = [...blocks.values()].some(
      (other) =>
        other !== b &&
        other.r0 >= b.r0 &&
        other.r1 <= b.r1 &&
        other.c0 >= b.c0 &&
        other.c1 <= b.c1,
    );
    void isLeafParent;
  }

  // draw kecamatan (leaf-parent) blocks
  const leafParents = [];
  for (const [id, b] of blocks) {
    // a block whose children are leaves — approximate: blocks not containing other blocks
    const containsOther = [...blocks.values()].some(
      (other) =>
        other !== b &&
        other.r0 >= b.r0 &&
        other.r1 <= b.r1 &&
        other.c0 >= b.c0 &&
        other.c1 <= b.c1 &&
        (other.r0 > b.r0 ||
          other.r1 < b.r1 ||
          other.c0 > b.c0 ||
          other.c1 < b.c1),
    );
    if (!containsOther) leafParents.push([id, b]);
  }
  for (const [, b] of leafParents) {
    if (!colorOf.has(b.r0 + "_" + b.c0))
      colorOf.set(b.r0 + "_" + b.c0, palette[idx++ % palette.length]);
    svg += `<rect x="${20 + b.c0 * S}" y="${20 + b.r0 * S}" width="${(b.c1 - b.c0 + 1) * S}" height="${(b.r1 - b.r0 + 1) * S}" fill="${colorOf.get(b.r0 + "_" + b.c0)}" stroke="#b6c5e0" stroke-width="1.5"/>\n`;
  }
  // kabupaten boundaries (outer blocks) as dashed
  for (const [id, b] of blocks) {
    const isOuter = ![...blocks.values()].some(
      (other) =>
        other !== b &&
        other.r0 >= b.r0 &&
        other.r1 <= b.r1 &&
        other.c0 >= b.c0 &&
        other.c1 <= b.c1 &&
        (other.r0 > b.r0 ||
          other.r1 < b.r1 ||
          other.c0 > b.c0 ||
          other.c1 < b.c1),
    );
    if (isOuter) {
      svg += `<rect x="${20 + b.c0 * S}" y="${20 + b.r0 * S}" width="${(b.c1 - b.c0 + 1) * S}" height="${(b.r1 - b.r0 + 1) * S}" fill="none" stroke="#33415c" stroke-width="2" stroke-dasharray="6 4"/>\n`;
    }
  }

  // draw village cells as dots
  for (const a of result.assignments) {
    const cx = 20 + (a.gridX + 0.5) * S;
    const cy = 20 + (a.gridY + 0.5) * S;
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.6" fill="#1a3a6b" opacity="0.85"/>\n`;
  }

  svg += `</svg>\n`;
  fs.writeFileSync(out, svg);
  console.log(
    `wrote ${out}  (${result.assignments.length} villages, grid ${R}x${C}, ${leafParents.length} leaf-parent blocks)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
