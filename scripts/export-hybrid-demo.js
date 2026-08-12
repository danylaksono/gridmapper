#!/usr/bin/env node
/**
 * Export Indonesia hybrid-cartogram sample outputs as GeoJSON for MapLibre.
 *
 * Runs the hybrid allocator on a representative sample of kel_desa (stride
 * across ALL provinces, not a slice), then projects the cartogram grid onto
 * Indonesia's real geographic extent so the result overlays the actual map
 * (provinces land roughly in place, sea gaps between islands visible).
 *
 * Usage:
 *   node scripts/export-hybrid-demo.js [shapeType=rect] [cap=20000] [--hilbert]
 *
 * Writes into demo/:
 *   indonesia-hybrid-<shape>-villages.geojson   — village cells (rects) or dots
 *   indonesia-hybrid-<shape>-shapes.geojson     — kecamatan shapes (rect/circle/hex)
 *   indonesia-hybrid-<shape>-kabupaten.geojson  — kabupaten block outlines
 *   indonesia-provinces.geojson                 — real province boundaries (reference)
 */
import fs from "fs";
import path from "path";
import glpkImport from "glpk.js";
import {
  allocateHybridHierarchical,
  loadCentroidRecords,
} from "../src/index.js";
import { GLPKSolver } from "../src/solvers/glpk-solver.js";

const GEO = "D:/personal/github/kopdes/geo/geojson";
const TABLE = `${GEO}/kel_desa.centroids.jsonl`;
const OUT = "demo";

function nameMap(name) {
  const g = JSON.parse(fs.readFileSync(`${GEO}/${name}.geojson`, "utf8"));
  const m = new Map();
  for (const f of g.features) m.set(f.properties.code, f.properties.name);
  return m;
}

/** [minLon, minLat, maxLon, maxLat] of a FeatureCollection (any geometry). */
function bboxOf(geo) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else for (const x of c) walk(x);
  };
  for (const f of geo.features) walk(f.geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

function cellPolygon(minLon, maxLon, minLat, maxLat, gridRows, gridCols, r, c) {
  const cellW = (maxLon - minLon) / gridCols;
  const cellH = (maxLat - minLat) / gridRows;
  const west = minLon + c * cellW;
  const east = west + cellW;
  const north = maxLat - r * cellH; // row 0 = north
  const south = north - cellH;
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
}

function gridToLonLat(
  minLon,
  maxLon,
  minLat,
  maxLat,
  gridRows,
  gridCols,
  x,
  y,
) {
  const cellW = (maxLon - minLon) / gridCols;
  const cellH = (maxLat - minLat) / gridRows;
  return [minLon + x * cellW, maxLat - y * cellH];
}

/** Global grid cell [r, c] of a hybrid rect assignment. */
function globalCell(a) {
  const b = a._shape.block;
  const bw = b.c1 - b.c0 + 1;
  const bh = b.r1 - b.r0 + 1;
  if (a._subdivided) {
    return [
      b.r0 + Math.floor((a.gridY * bh) / a.shapeRows),
      b.c0 + Math.floor((a.gridX * bw) / a.shapeCols),
    ];
  }
  return [b.r0 + a.gridY, b.c0 + a.gridX];
}

async function main() {
  const shapeArg = process.argv.find((a) =>
    ["rect", "circle", "hex"].includes(a),
  );
  const shapeType = shapeArg ?? "rect";
  const capArg = process.argv.find((a) => /^\d+$/.test(a));
  const cap = capArg ? Number(capArg) : 20000;
  const layoutMode = process.argv.includes("--hilbert")
    ? "hilbertPath"
    : "split";

  // name maps for popups
  const provName = nameMap("provinsi");
  const kabName = nameMap("kab_kota");
  const kecName = nameMap("kecamatan");

  // representative sample (stride across all provinces)
  const records = await loadCentroidRecords(TABLE);
  const stride = Math.max(1, Math.floor(records.length / cap));
  const data = records.filter((_, i) => i % stride === 0).slice(0, cap);
  console.log(
    `features: ${data.length} (stride ${stride} of ${records.length} kel_desa), shapeType: ${shapeType}, layoutMode: ${layoutMode}`,
  );

  const glpk = await glpkImport();
  const t0 = performance.now();
  const result = await allocateHybridHierarchical(data, {
    levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
    shapeType,
    layoutMode,
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    mip: () => new GLPKSolver(glpk),
    seaGapKm: 30,
    seaGutter: 1,
  });
  console.log(
    `[hybrid] ${shapeType} on ${data.length} villages: ${Math.round(performance.now() - t0)}ms  (${result.meta.gridRows}×${result.meta.gridCols} grid, ${result.groups.length} kabupaten, ${result.shapes.length} kecamatan, ${result.meta.islands} islands)`,
  );

  // Indonesia real extent (stable across caps) for the grid → geo projection
  const provGeo = JSON.parse(
    fs.readFileSync(`${GEO}/provinsi.geojson`, "utf8"),
  );
  const [minLon, minLat, maxLon, maxLat] = bboxOf(provGeo);
  const { gridRows, gridCols } = result.meta;
  const G = (r, c) =>
    cellPolygon(minLon, maxLon, minLat, maxLat, gridRows, gridCols, r, c);
  const XY = (x, y) =>
    gridToLonLat(minLon, maxLon, minLat, maxLat, gridRows, gridCols, x, y);

  const villages = [];
  const shapes = [];
  for (const a of result.assignments) {
    const d = a;
    const props = {
      code: d.id ?? d.code,
      name: d.name,
      prov_code: d.provinsi_code,
      prov_name: provName.get(d.provinsi_code) ?? d.provinsi_code,
      kab_code: d.kab_kota_code,
      kab_name: kabName.get(d.kab_kota_code) ?? d.kab_kota_code,
      kec_code: d.kecamatan_code,
      kec_name: kecName.get(d.kecamatan_code) ?? d.kecamatan_code,
    };
    if (shapeType === "rect") {
      const [r, c] = globalCell(a);
      villages.push({
        type: "Feature",
        properties: props,
        geometry: { type: "Polygon", coordinates: G(r, c) },
      });
    } else {
      const s = a._shape;
      const gx =
        s.bbox.minX +
        (s.bbox.maxX - s.bbox.minX) *
          (a.shapeCols > 1 ? a.gridX / (a.shapeCols - 1) : 0.5);
      const gy =
        s.bbox.minY +
        (s.bbox.maxY - s.bbox.minY) *
          (a.shapeRows > 1 ? a.gridY / (a.shapeRows - 1) : 0.5);
      villages.push({
        type: "Feature",
        properties: props,
        geometry: { type: "Point", coordinates: XY(gx, gy) },
      });
    }
  }

  for (const s of result.shapes) {
    const props = {
      code: s.id,
      name: kecName.get(s.id) ?? s.id,
      prov_name: provName.get(s.island) ?? "",
      leafCount: s.leafCount,
    };
    let coords;
    if (shapeType === "rect") {
      coords = G(s.block.r0, s.block.c0);
    } else {
      coords = [s.polygon.map(([x, y]) => XY(x, y))];
      // close ring
      coords[0].push(coords[0][0]);
    }
    shapes.push({
      type: "Feature",
      properties: props,
      geometry: { type: "Polygon", coordinates: coords },
    });
  }

  const kabupaten = result.groups.map((g) => ({
    type: "Feature",
    properties: {
      code: g.id,
      name: kabName.get(g.id) ?? g.id,
      prov_name: provName.get(g._path[0]) ?? "",
      leafCount: g.leafCount,
    },
    geometry: { type: "Polygon", coordinates: G(g._block.r0, g._block.c0) },
  }));

  const tag = `${shapeType}${layoutMode === "hilbertPath" ? "-hilbert" : ""}`;
  const write = (name, fc) =>
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(fc), "utf8");

  write(`indonesia-hybrid-${tag}-villages.geojson`, {
    type: "FeatureCollection",
    features: villages,
  });
  write(`indonesia-hybrid-${tag}-shapes.geojson`, {
    type: "FeatureCollection",
    features: shapes,
  });
  write(`indonesia-hybrid-${tag}-kabupaten.geojson`, {
    type: "FeatureCollection",
    features: kabupaten,
  });

  // real province boundaries (reference layer)
  const provFeatures = provGeo.features.map((f) => ({
    type: "Feature",
    properties: { code: f.properties.code, name: f.properties.name },
    geometry: f.geometry,
  }));
  write("indonesia-provinces.geojson", {
    type: "FeatureCollection",
    features: provFeatures,
  });

  for (const f of fs
    .readdirSync(OUT)
    .filter((x) => x.startsWith("indonesia-"))) {
    const p = path.join(OUT, f);
    console.log(`  [out] ${f} (${Math.round(fs.statSync(p).size / 1024)} KB)`);
  }
  console.log(`\ntag: ${tag} — open demo/maplibre-hybrid.html?shape=${tag}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
