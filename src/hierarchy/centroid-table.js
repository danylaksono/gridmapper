/**
 * Centroid-Only Processing
 *
 * The hierarchical / mosaic allocators only ever need, per leaf feature:
 *   - a unique id (code),
 *   - a centroid (x, y) for spatial ordering & island detection,
 *   - a weight (default 1 → area ∝ descendant count),
 *   - the parent-code fields (e.g. provinsi_code / kab_kota_code / kecamatan_code).
 *
 * They never touch the polygon geometry. For Indonesia the kel_desa payload is
 * a 166 MB GeoJSON with 83,518 MultiPolygons — parsing all of that just to
 * allocate is pure waste. This module lets you build a compact centroid table
 * ONCE, then load it for every allocation run; the heavy polygon payload is
 * never read by the allocator path.
 *
 * Two storage formats are supported:
 *   - `.json`  : one JSON array (read with a single JSON.parse),
 *   - `.jsonl` : NDJSON, one record per line (read via a streaming readline so
 *                the file is never materialized as one giant string/array).
 *
 * Node-only I/O (fs / readline) is dynamically imported so the browser bundle
 * stays clean; the extract / merge helpers are pure and work everywhere.
 */

/**
 * Fast mean-of-vertices centroid for a GeoJSON geometry.
 * Matches the arithmetic mean used by the probe scripts, so allocating on a
 * table built from these records reproduces the probes' cell-for-cell.
 *
 * @param {Object} geometry - GeoJSON geometry (Point/Polygon/MultiPolygon).
 * @returns {Array<number>} [x, y].
 */
export function centroidOfFeature(geometry) {
  const coords =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat(2)
      : geometry.coordinates.flat(1);
  let x = 0,
    y = 0;
  for (const [px, py] of coords) {
    x += px;
    y += py;
  }
  const n = coords.length || 1;
  return [x / n, y / n];
}

/** Bounding box [minX, minY, maxX, maxY] of a GeoJSON geometry (or null). */
function bboxOf(geometry) {
  const coords =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat(2)
      : geometry.coordinates.flat(1);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [px, py] of coords) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return [minX, minY, maxX, maxY];
}

/** Read a scalar prop from a feature, tolerating GeoJSON `.properties` nesting. */
function prop(f, k) {
  return f[k] != null ? f[k] : f.properties?.[k];
}

/**
 * Extract lightweight centroid records from features.
 *
 * Accepts either full GeoJSON features (geometry present) or already-light
 * records ({ x, y, code, ...parent codes }). Only the fields the allocator
 * needs are copied out — geometry is dropped.
 *
 * @param {Array} features
 * @param {Object} [options]
 * @param {Function} [options.idAccessor] - (feature) => id (default d.code).
 * @param {Function} [options.coordsOf] - (feature) => [x, y]. When omitted:
 *   uses feature.x/y if present, else centroidOfFeature(feature.geometry).
 * @param {Function} [options.weightOf] - (feature) => weight (default 1).
 * @param {Array<string>} [options.levelKeys] - Parent-code prop names to copy
 *   through (e.g. ['provinsi_code','kab_kota_code','kecamatan_code']).
 * @param {Array<string>} [options.extra] - Extra scalar props to copy through
 *   (e.g. ['name']). Read from top-level or `.properties`.
 * @param {boolean} [options.includeBBox] - Also compute bbox [minX,minY,maxX,maxY]
 *   per record (default false).
 * @returns {Array<Object>} Records: { id, x, y, weight, ...levelKeys, ...extra }.
 */
export function extractCentroidRecords(features, options = {}) {
  const {
    idAccessor = (d) => prop(d, "code"),
    coordsOf = null,
    weightOf = () => 1,
    levelKeys = [],
    extra = [],
    includeBBox = false,
  } = options;

  return features.map((f) => {
    let x,
      y,
      bbox = null;
    if (coordsOf) {
      const c = coordsOf(f);
      x = c[0];
      y = c[1];
    } else if (typeof f.x === "number" && typeof f.y === "number") {
      x = f.x;
      y = f.y;
      if (includeBBox && f.geometry) bbox = bboxOf(f.geometry);
    } else if (f.geometry && f.geometry.coordinates) {
      const c = centroidOfFeature(f.geometry);
      x = c[0];
      y = c[1];
      if (includeBBox) bbox = bboxOf(f.geometry);
    } else {
      throw new Error(
        "extractCentroidRecords: feature has neither x/y nor geometry — " +
          "provide coordsOf or light records",
      );
    }

    const rec = { id: String(idAccessor(f)), x, y, weight: weightOf(f) };
    for (const k of levelKeys) {
      const v = prop(f, k);
      if (v != null) rec[k] = v;
    }
    for (const k of extra) {
      const v = prop(f, k);
      if (v != null) rec[k] = v;
    }
    if (includeBBox && bbox) rec.bbox = bbox;
    return rec;
  });
}

/**
 * Save centroid records to disk (Node only). Dynamically imports node:fs so
 * the browser bundle is unaffected.
 *
 * @param {string} path - Output path. Format inferred from extension unless
 *   overridden: `.jsonl`/`.ndjson` → NDJSON, otherwise JSON array.
 * @param {Array} records
 * @param {Object} [options]
 * @param {string} [options.format] - 'jsonl' | 'json' (default: from extension).
 */
export async function saveCentroidRecords(path, records, options = {}) {
  const fs = await import("node:fs");
  const format =
    options.format ?? (/\.jsonl$|\.ndjson$/i.test(path) ? "jsonl" : "json");
  if (format === "jsonl") {
    const lines = records.map((r) => JSON.stringify(r) + "\n").join("");
    await fs.promises.writeFile(path, lines, "utf8");
  } else {
    await fs.promises.writeFile(path, JSON.stringify(records), "utf8");
  }
}

/**
 * Load centroid records from disk (Node only). `.jsonl` is streamed line by
 * line via readline — bounded memory even for huge tables.
 *
 * @param {string} path
 * @param {Object} [options]
 * @param {string} [options.format] - 'jsonl' | 'json' (default: from extension).
 * @param {number} [options.limit] - Optional cap (useful for probes).
 * @returns {Promise<Array>} Records exactly as saved.
 */
export async function loadCentroidRecords(path, options = {}) {
  const fs = await import("node:fs");
  const readline = await import("node:readline");
  const format =
    options.format ?? (/\.jsonl$|\.ndjson$/i.test(path) ? "jsonl" : "json");

  if (format === "jsonl") {
    const records = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line));
      if (options.limit && records.length >= options.limit) break;
    }
    return records;
  }
  const text = await fs.promises.readFile(path, "utf8");
  const arr = JSON.parse(text);
  return options.limit ? arr.slice(0, options.limit) : arr;
}

/** Grid fields that get copied back onto a full feature during merge. */
const GRID_FIELDS = [
  "gridX",
  "gridY",
  "gridRows",
  "gridCols",
  "shapeRows",
  "shapeCols",
  "_subdivided",
  "_subDim",
  "_path",
  "_block",
  "_shapeId",
  "_shape",
];

/**
 * Attach allocation results back onto the FULL features (with geometry) by id.
 *
 * The allocators return assignments that carry the lightweight record (spread
 * into each assignment). This builds id → assignment and copies the grid
 * fields onto the matching full features, so rendering / downstream code can
 * keep using the original geometry.
 *
 * @param {Array} features - Full features (or any objects carrying the id).
 * @param {Array} assignments - Result of allocateHierarchical / allocateMosaicHierarchical.
 * @param {Object} [options]
 * @param {Function} [options.idAccessor] - (feature) => id (default d.code).
 * @param {Function} [options.assignmentIdOf] - (assignment) => id. Defaults to
 *   the same idAccessor applied to the assignment (assignments spread the item,
 *   so the id field is present).
 * @param {boolean} [options.inPlace] - Mutate and return `features` (default
 *   false → returns a shallow copy).
 * @returns {Array} Enriched features; unmatched features are returned unchanged.
 */
export function mergeAssignmentsToFeatures(
  features,
  assignments,
  options = {},
) {
  const {
    idAccessor = (d) => prop(d, "code"),
    assignmentIdOf = null,
    inPlace = false,
  } = options;

  const byId = new Map();
  for (const a of assignments) {
    const id = assignmentIdOf
      ? String(assignmentIdOf(a))
      : String(idAccessor(a));
    byId.set(id, a);
  }

  const out = inPlace ? features : features.map((f) => ({ ...f }));
  for (const f of out) {
    const a = byId.get(String(idAccessor(f)));
    if (!a) continue;
    for (const k of GRID_FIELDS) {
      if (a[k] !== undefined) f[k] = a[k];
    }
  }
  return out;
}
