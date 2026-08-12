#!/usr/bin/env node
/**
 * Probe: island separation (archipelago preservation) in the M2 mosaic.
 *
 * For each shapeType it runs the mosaic twice (separation OFF vs ON) and
 * measures how many cross-island shape pairs are touching / too close:
 *   - circle/hex: pairs whose center distance is below (r1+r2) [overlap] or
 *     below (r1+r2)*(1+islandGap) [insufficient sea gap].
 *   - rect: cross-island blocks that share an edge (no sea gutter).
 *
 * Usage: node scripts/probe-islands.js [cap] [--render]
 */
import fs from "fs";
import glpkImport from "glpk.js";
import { allocateMosaicHierarchical, detectIslands } from "../src/index.js";
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

function circleSeparation(shapes) {
  let pairs = 0,
    overlap = 0,
    close = 0,
    minGapRatio = Infinity;
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i],
        b = shapes[j];
      if (a.island === b.island) continue;
      pairs++;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const sumR = a.radius + b.radius;
      if (d < sumR) overlap++;
      const ratio = d / sumR;
      if (ratio < minGapRatio) minGapRatio = ratio;
      if (d < sumR * 1.25) close++; // below the default sea gap
    }
  }
  return {
    pairs,
    overlap,
    close,
    minGapRatio: minGapRatio === Infinity ? null : minGapRatio,
  };
}

function rectSeparation(shapes) {
  let pairs = 0,
    adjacent = 0;
  const adjacentBlocks = (x, y) => {
    const xc = x.c0 <= y.c1 && y.c0 <= x.c1;
    const yc = x.r0 <= y.r1 && y.r0 <= x.r1;
    const touchesX = x.r1 + 1 === y.r0 || y.r1 + 1 === x.r0;
    const touchesY = x.c1 + 1 === y.c0 || y.c1 + 1 === x.c0;
    return (xc && touchesX) || (yc && touchesY);
  };
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i],
        b = shapes[j];
      if (a.island === b.island) continue;
      pairs++;
      if (adjacentBlocks(a.block, b.block)) adjacent++;
    }
  }
  return { pairs, adjacent };
}

async function run(features, shapeType, extra, render, out) {
  const result = await allocateMosaicHierarchical(features, {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    compactness: 0.5,
    shapeType,
    seed: 1,
    seaGapKm: 30,
    ...extra,
  });
  const stat =
    shapeType === "rect"
      ? rectSeparation(result.shapes)
      : circleSeparation(result.shapes);
  if (render) renderSvg(result, out, shapeType);
  return { result, stat };
}

function renderSvg(result, out, shapeType) {
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
  const W = 1000,
    H = 640;
  const S = Math.min((W - 40) / (BX - bx), (H - 40) / (BY - by));
  const offX = 20 + (W - 40 - (BX - bx) * S) / 2;
  const offY = 20 + (H - 40 - (BY - by) * S) / 2;
  const px = (x) => offX + (x - bx) * S;
  const py = (y) => offY + (BY - y) * S;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#eaf4fb"/>`;
  const islandColor = new Map();
  const palette = [
    "#f6d6a8",
    "#bcd8f0",
    "#c9e6c9",
    "#f3c3c3",
    "#d9d2ee",
    "#f2e3b3",
    "#bfe6e6",
    "#e6c8e8",
    "#e6d9c6",
    "#cfe0c0",
  ];
  result.shapes.forEach((s) => {
    if (!islandColor.has(s.island))
      islandColor.set(s.island, palette[islandColor.size % palette.length]);
    const d = s.polygon
      .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
      .join(" ");
    svg += `<polygon points="${d}" fill="${islandColor.get(s.island)}" stroke="#33415c" stroke-width="1.5" stroke-linejoin="round"/>`;
  });
  fs.writeFileSync(out, svg + `</svg>`);
  console.log(`  wrote ${out} (islands: ${islandColor.size})`);
}

async function main() {
  glpk = await glpkImport();
  const args = process.argv.slice(2);
  const capArg = args.find((a) => !isNaN(Number(a)));
  const cap = capArg ? Number(capArg) : null;
  const render = args.includes("--render");

  const geo = JSON.parse(fs.readFileSync(`${GEO}/kel_desa.geojson`, "utf8"));
  const data = (cap ? geo.features.slice(0, cap) : geo.features).map((f) => {
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
  console.log(
    `features: ${data.length} (kel_desa layer), seaGapKm=30 (auto island detection)\n`,
  );

  // circle: separation OFF vs ON
  const cOff = await run(data, "circle", { islandGap: 0 }, false);
  const cOn = await run(
    data,
    "circle",
    { islandGap: 0.4 },
    render,
    "demo/islands-circle.svg",
  );
  console.log(`[circle] islands detected: ${cOn.result.meta.islands}`);
  console.log(
    `  gap OFF: cross-island pairs=${cOff.stat.pairs} overlap=${cOff.stat.overlap}  min dist/Σr=${cOff.stat.minGapRatio?.toFixed(3)}`,
  );
  console.log(
    `  gap ON : cross-island pairs=${cOn.stat.pairs} overlap=${cOn.stat.overlap}  min dist/Σr=${cOn.stat.minGapRatio?.toFixed(3)}`,
  );

  // rect: sea gutter OFF vs ON
  const rOff = await run(data, "rect", { seaGutter: 0 }, false);
  const rOn = await run(
    data,
    "rect",
    { seaGutter: 1 },
    render,
    "demo/islands-rect.svg",
  );
  console.log(`\n[rect] islands detected: ${rOn.result.meta.islands}`);
  console.log(
    `  gutter OFF: cross-island pairs=${rOff.stat.pairs} edge-adjacent=${rOff.stat.adjacent}`,
  );
  console.log(
    `  gutter ON : cross-island pairs=${rOn.stat.pairs} edge-adjacent=${rOn.stat.adjacent}`,
  );
}

let glpk = null;
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
