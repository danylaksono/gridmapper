/**
 * Hybrid Hierarchical Allocator — mode 'hybrid' (M2b)
 *
 * Mosaic NESTED inside a coarser treemap block.
 *
 * M1 (grid-in-grid) lays out every level as treemap blocks — nesting is great
 * but the leaf-parent shapes are always rectangles. M2 (mosaic) draws the
 * leaf-parents as a single flat value-scaled mosaic over the whole map — pretty
 * shapes, but it destroys the provinsi/kabupaten nesting and geography.
 *
 * The hybrid keeps BOTH: the coarser levels are laid out as nested treemap
 * blocks (geography + nesting retained), and then each group's children are
 * laid out as a LOCAL value-scaled mosaic fitted inside that group's block.
 * The finest features are packed into each shape as usual.
 *
 *   levels = ['provinsi_code', 'kab_kota_code', 'kecamatan_code'], leaves = villages
 *     provinsi blocks        (treemap)
 *       └─ kabupaten blocks  (treemap)   ← "group" level (levels.length - 2)
 *            └─ kecamatan mosaic (rect | circle | hex) inside each kabupaten block
 *                 └─ villages packed one-per-cell into each kecamatan shape
 *
 * Containment is guaranteed by construction: every level's blocks/shapes lie
 * strictly inside their parent block (local treemap, or Dorling scaled-to-fit
 * inside the block rect), and every village cell lies inside its kecamatan shape.
 */

import { GridMapper } from "../core/grid-mapper.js";
import { buildHierarchy } from "./hierarchy-tree.js";
import { gridTreemap, rectArea } from "./grid-treemap.js";
import { packLeavesIntoBlock } from "./footprint-packer.js";
import { detectIslands } from "./islands.js";
import { runWorkerPool } from "../utils/parallel.js";
import { packIntoShape, layoutDorlingMosaic } from "./mosaic-allocator.js";
import {
  createCircleCoordinates,
  createHexagonCoordinates,
  createRectangleCoordinates,
} from "../cartogram/shape-generator.js";

const PACK_WORKER_URL = new URL("./pack-worker.js", import.meta.url);

/**
 * @param {Array} features - Finest-level features (e.g. villages).
 * @param {Object} options
 * @param {Array} [options.levels] - Parent-code keys, coarse → fine. Needs at
 *   least 2 levels: the coarsest n-2 become treemap blocks ("group" level =
 *   levels.length - 2), and the finest parent level (levels.length - 1) becomes
 *   the local mosaic.
 * @param {string} [options.shapeType] - 'rect' | 'circle' | 'hex' (default 'rect').
 *   Shape of the mosaic at the container level (groups with <2 children or a
 *   degenerate geographic span fall back to rect).
 * @param {Function} [options.idAccessor] - (feature) => id, default d.code.
 * @param {Function} [options.xAccessor] - (feature) => x/lon.
 * @param {Function} [options.yAccessor] - (feature) => y/lat.
 * @param {Function} [options.mip] - MIP solver factory (required).
 * @param {GridMapper} [options.mapper]
 * @param {number} [options.compactness] - Passed to the leaf packing MIP.
 * @param {Function} [options.weightOf] - (feature) => value used to scale the
 *   mosaic shape area at the container level (default 1 → area ∝ descendant count).
 * @param {number} [options.slack] - Extra grid cells vs. total leaf count (default 1.35).
 * @param {number} [options.minFactor] - Treemap min-area multiplier (default 1).
 * @param {number} [options.seed] - Determinism seed for the local Dorling layouts.
 * @param {number} [options.dorlingIterations] - Force-sim iterations (default 800).
 * @param {number} [options.dorlingK] - Fill ratio for the largest shape (default 12).
 * @param {string} [options.dorlingMethod] - 'auto' | 'pairwise' | 'barneshut'.
 * @param {Function} [options.islandAccessor] - (feature) => island id (optional;
 *   islands are auto-detected from seaGapKm at the root level).
 * @param {number} [options.seaGapKm] - Water-gap threshold in km (default 30).
 * @param {number} [options.seaGutter] - Root-level cells of gap between island
 *   clusters (default 1; 0 disables). Only the ROOT treemap is island-aware;
 *   below that, nesting relies on geographic ordering.
 * @param {number} [options.smallBlockThreshold] - Greedy pack below this (default 6).
 * @param {string} [options.orderMode] - Advanced treemap ordering override.
 * @param {string} [options.dirPolicy] - Advanced treemap direction override.
 * @param {number} [options.concurrency] - Worker-thread parallelism for the
 *   independent leaf-packing MIPs (default 0 = auto in Node; browser falls
 *   back to sequential). Set 1 to force sequential.
 * @param {Function} [options.onProgress] - (fraction: 0..1) => void.
 * @returns {Promise<Object>} { assignments, shapes, groups, hierarchy, meta }
 *   - assignments: each leaf + grid position + `_shape` (its kecamatan shape) +
 *     `_path` (full ancestor id path, e.g. [provinsi, kabupaten, kecamatan]).
 *     rect shapes → shape-LOCAL gridX/gridY (global cell = _shape.block.c0 + gridX);
 *     circle/hex → gridX/gridY local within the shape's inscribed grid.
 *   - shapes: array of container (kecamatan) shapes (id, type, block/bbox,
 *     polygon, shapeRows, shapeCols, weight, leafCount, ...).
 *   - groups: array of group (kabupaten) nodes with `_block` + `_path`.
 *   - hierarchy: full forest (every node has `_block`/`_path`).
 *   - meta: { mode, shapeType, levels, count, containers, groups, totalLeaves, ... }
 */
export async function allocateHybridHierarchical(features, options = {}) {
  const {
    idAccessor = (d) => d.code,
    levels = [],
    xAccessor = (d) => d.x,
    yAccessor = (d) => d.y,
    mip = null,
    mapper = new GridMapper(),
    compactness = 0.5,
    weightOf = () => 1,
    shapeType = "rect",
    slack = 1.35,
    minFactor = 1,
    seed = 1,
    dorlingIterations = 800,
    dorlingK = 12,
    dorlingMethod = "auto",
    islandAccessor = null,
    seaGapKm = 30,
    seaGutter = 1,
    smallBlockThreshold = 6,
    orderMode = null,
    dirPolicy = null,
    concurrency = 0,
    onProgress = null,
  } = options;

  if (levels.length < 2)
    throw new Error(
      "allocateHybridHierarchical: options.levels needs >= 2 parent levels " +
        "(a group level above the mosaic level)",
    );
  if (!mip)
    throw new Error("allocateHybridHierarchical: options.mip is required");

  const groupLevelIndex = levels.length - 2; // e.g. kabupaten
  const coordsOf = (f) => [xAccessor(f), yAccessor(f)];
  const roots = buildHierarchy(features, {
    idAccessor,
    levels,
    coordsOf,
    weightOf,
  });

  const totalLeaves = roots.reduce((s, r) => s + r.leafCount, 0);

  // ---- global extent + island-aware top-grid sizing ----
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const r of roots) {
    const [x, y] = r.centroid;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const aspect = Math.max(
    0.25,
    Math.min(4, (maxX - minX) / Math.max(1e-9, maxY - minY)),
  );

  let islandInfo = null;
  if (islandAccessor || (seaGapKm > 0 && roots.length > 1)) {
    islandInfo = detectIslands(roots, {
      positionOf: (n) => n.centroid,
      islandAccessor,
      seaGapKm,
    });
  }

  let layoutTotal = totalLeaves;
  let islandGroups = null;
  if (islandInfo && seaGutter > 0) {
    islandGroups = new Map();
    islandInfo.ids.forEach((island, i) => {
      if (!islandGroups.has(island)) islandGroups.set(island, []);
      islandGroups.get(island).push(roots[i]);
    });
    layoutTotal = [...islandGroups.values()].reduce((s, members) => {
      const a = members.reduce((t, m) => t + m.leafCount, 0);
      return s + a + 6 * seaGutter * Math.sqrt(a); // + island gutter headroom
    }, 0);
  }
  const cells = Math.ceil(layoutTotal * slack);
  let gridCols = Math.max(1, Math.round(Math.sqrt(cells * aspect)));
  let gridRows = Math.max(1, Math.ceil(cells / gridCols));
  while (gridRows * gridCols < cells) gridRows++;
  const globalRect = { r0: 0, c0: 0, r1: gridRows - 1, c1: gridCols - 1 };

  /** Treemap options for a set of nodes, geography-adaptive to their own span. */
  const makeTreemapOpts = makeTreemapOptsFactory(
    minFactor,
    orderMode,
    dirPolicy,
  );

  // ---- Phase A: assign coarse blocks (roots → group nodes) ----
  const assignCoarse = (node, block, path) => {
    node._block = block;
    node._path = [...path, node.id];
    if (node.children.length === 0) return;
    if (node.level >= groupLevelIndex) return; // children are containers → Phase B
    const children = node.children;
    const subBlocks = gridTreemap(children, block, {
      ...makeTreemapOpts(children),
      weightOf: (n) => n.leafCount,
    });
    for (const c of children) assignCoarse(c, subBlocks.get(c.id), node._path);
  };

  if (islandGroups) {
    // Two-level root layout: islands first (with sea gutter), then members.
    const islandNodes = [...islandGroups.entries()].map(
      ([islandId, members]) => {
        const cx =
          members.reduce((s, m) => s + m.centroid[0], 0) / members.length;
        const cy =
          members.reduce((s, m) => s + m.centroid[1], 0) / members.length;
        const area = members.reduce((s, m) => s + m.leafCount, 0);
        return {
          id: `island_${islandId}`,
          members,
          centroid: [cx, cy],
          area,
          requested: area + 6 * seaGutter * Math.sqrt(area),
        };
      },
    );
    const islandBlocks = gridTreemap(islandNodes, globalRect, {
      ...makeTreemapOpts(islandNodes),
      weightOf: (n) => n.requested,
    });
    for (const inode of islandNodes) {
      const ib = islandBlocks.get(inode.id);
      let usable = insetRect(ib, seaGutter);
      if (rectArea(usable) < inode.area) usable = ib; // too tight: no gutter
      const memberBlocks = gridTreemap(inode.members, usable, {
        ...makeTreemapOpts(inode.members),
        weightOf: (n) => n.leafCount,
      });
      for (const m of inode.members)
        assignCoarse(m, memberBlocks.get(m.id), []);
    }
  } else {
    const rootBlocks = gridTreemap(roots, globalRect, {
      ...makeTreemapOpts(roots),
      weightOf: (n) => n.leafCount,
    });
    for (const r of roots) assignCoarse(r, rootBlocks.get(r.id), []);
  }

  // ---- Phase B: local value-scaled mosaic inside each group block ----
  const groups = [];
  const collectGroups = (nodes, out = []) => {
    for (const n of nodes) {
      if (n.level === groupLevelIndex) out.push(n);
      else collectGroups(n.children, out);
    }
    return out;
  };
  collectGroups(roots, groups);
  if (groups.length === 0)
    throw new Error("allocateHybridHierarchical: no group nodes found");

  const containers = [];
  for (const group of groups) {
    const members = group.children;
    for (const c of members) c._path = [...group._path, c.id];
    // value-scaled areas LOCAL to this group
    const gl = members.reduce((s, m) => s + m.leafCount, 0);
    const gv = members.reduce((s, m) => s + Math.max(1, m.weight), 0);
    const vs = gl / Math.max(1, gv);
    for (const m of members)
      m._area = Math.max(m.leafCount, Math.max(1, Math.round(m.weight * vs)));
    layoutContainerMosaic(members, group._block, shapeType, {
      seed,
      dorlingIterations,
      dorlingK,
      dorlingMethod,
      makeTreemapOpts,
    });
    containers.push(...members);
  }

  // ---- Phase C: pack leaves into each container shape ----
  const assignments = [];
  const packOpts = {
    mapper,
    mip,
    xAccessor,
    yAccessor,
    compactness,
    smallBlockThreshold,
  };

  const buildAssignments = (n, packed) => {
    const shape = n._shape;
    const out = [];
    if (shape.type === "rect") {
      for (const p of packed) {
        if (p._subdivided) {
          out.push({
            ...p.item,
            _shapeId: n.id,
            _shape: shape,
            gridX: p.gridX,
            gridY: p.gridY,
            shapeRows: p.gridRows,
            shapeCols: p.gridCols,
            _subdivided: true,
            _path: n._path,
          });
        } else {
          out.push({
            ...p.item,
            _shapeId: n.id,
            _shape: shape,
            gridX: p.gridX - shape.block.c0, // shape-local column
            gridY: p.gridY - shape.block.r0, // shape-local row
            shapeRows: shape.shapeRows,
            shapeCols: shape.shapeCols,
            _path: n._path,
          });
        }
      }
    } else {
      for (const p of packed) {
        out.push({
          ...p.item,
          _shapeId: n.id,
          _shape: shape,
          gridX: p.localC,
          gridY: p.localR,
          shapeRows: shape.shapeRows,
          shapeCols: shape.shapeCols,
          _path: n._path,
        });
      }
    }
    return out;
  };

  const packOne = async (n) => {
    const shape = n._shape;
    if (shape.type === "rect") {
      return packLeavesIntoBlock(n.children, shape.block, packOpts);
    }
    return packIntoShape(n.children, shape, {
      mip,
      xAccessor,
      yAccessor,
      compactness,
    });
  };

  const packSequential = async () => {
    for (const n of containers) {
      assignments.push(...buildAssignments(n, await packOne(n)));
      if (onProgress) onProgress(assignments.length / totalLeaves);
    }
  };

  const packParallel = async () => {
    const tasks = containers.map((n, index) => ({
      index,
      payload: {
        mode: n._shape.type === "rect" ? "block" : "shape",
        block: n._shape.block,
        shape:
          n._shape.type === "rect"
            ? undefined
            : { bbox: n._shape.bbox, polygon: n._shape.polygon },
        children: n.children.map((c) => ({
          id: c.id,
          x: xAccessor(c.item),
          y: yAccessor(c.item),
        })),
        compactness,
        smallBlockThreshold,
      },
    }));
    const results = await runWorkerPool(tasks, PACK_WORKER_URL, {
      concurrency,
      onProgress: onProgress
        ? (f) => onProgress(Math.round(f * totalLeaves) / totalLeaves)
        : null,
    });
    containers.forEach((n, i) => {
      const shape = n._shape;
      if (shape.type !== "rect" && results[i].length) {
        shape.shapeRows = results[i][0].gridRows;
        shape.shapeCols = results[i][0].gridCols;
      }
      for (const r of results[i]) {
        const child = n.children.find((c) => c.id === r.childId);
        if (shape.type === "rect") {
          if (r.subdivided) {
            assignments.push({
              ...child.item,
              _shapeId: n.id,
              _shape: shape,
              gridX: r.gridX,
              gridY: r.gridY,
              shapeRows: r.gridRows,
              shapeCols: r.gridCols,
              _subdivided: true,
              _path: n._path,
            });
          } else {
            assignments.push({
              ...child.item,
              _shapeId: n.id,
              _shape: shape,
              gridX: r.gridX - shape.block.c0,
              gridY: r.gridY - shape.block.r0,
              shapeRows: r.gridRows,
              shapeCols: r.gridCols,
              _path: n._path,
            });
          }
        } else {
          assignments.push({
            ...child.item,
            _shapeId: n.id,
            _shape: shape,
            gridX: r.gridX,
            gridY: r.gridY,
            shapeRows: r.gridRows,
            shapeCols: r.gridCols,
            _path: n._path,
          });
        }
      }
    });
  };

  const useParallel =
    concurrency !== 1 &&
    containers.length > 4 &&
    typeof process !== "undefined" &&
    process.versions &&
    typeof process.versions.node !== "undefined"; // Node only
  if (useParallel) {
    try {
      await packParallel();
    } catch {
      assignments.length = 0;
      await packSequential();
    }
  } else {
    await packSequential();
  }

  const shapes = containers.map((n) => n._shape);
  return {
    assignments,
    shapes,
    groups,
    hierarchy: roots,
    meta: {
      mode: "hybrid",
      shapeType,
      levels,
      count: assignments.length,
      containers: containers.length,
      groups: groups.length,
      totalLeaves,
      slack,
      gridRows,
      gridCols,
      islands: islandInfo ? islandInfo.groups.size : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Local container mosaic inside a block
// ---------------------------------------------------------------------------
/** Treemap options factory (geography-adaptive to each nodes' own span). */
function makeTreemapOptsFactory(minFactor, orderMode, dirPolicy) {
  return (nodes) => {
    let a = Infinity,
      b = -Infinity,
      c = Infinity,
      d = -Infinity;
    for (const n of nodes) {
      const [x, y] = n.centroid;
      if (x < a) a = x;
      if (x > b) b = x;
      if (y < c) c = y;
      if (y > d) d = y;
    }
    const asp = (b - a) / Math.max(1e-9, d - c);
    return {
      minFactor,
      positionOf: (n) => n.centroid,
      orderMode: orderMode ?? (asp >= 1 ? "xy" : "yxDesc"),
      dirPolicy: dirPolicy ?? "spreadNorm",
      extent: { x: Math.max(1e-12, b - a), y: Math.max(1e-12, d - c) },
    };
  };
}

function layoutContainerMosaic(members, block, shapeType, o) {
  let a = Infinity,
    b = -Infinity,
    c = Infinity,
    d = -Infinity;
  for (const m of members) {
    const [x, y] = m.centroid;
    if (x < a) a = x;
    if (x > b) b = x;
    if (y < c) c = y;
    if (y > d) d = y;
  }
  const spanX = b - a;
  const spanY = d - c;
  const useDorling =
    shapeType !== "rect" &&
    members.length >= 2 &&
    (spanX > 1e-6 || spanY > 1e-6);
  if (useDorling) {
    layoutDorlingMosaic(
      members,
      shapeType,
      o.dorlingIterations,
      o.dorlingK,
      o.seed,
      null,
      0,
      o.dorlingMethod,
    );
    fitDorlingShapesToBlock(members, block);
  } else {
    const blocks = gridTreemap(members, block, {
      ...o.makeTreemapOpts(members),
      weightOf: (n) => n._area,
    });
    for (const m of members) assignRectShape(m, blocks.get(m.id), null);
  }
}

/** Uniformly scale/translate a Dorling layout (lat/lon) to fit inside a block. */
function fitDorlingShapesToBlock(containers, block) {
  const w = block.c1 - block.c0 + 1;
  const h = block.r1 - block.r0 + 1;
  let lx = Infinity,
    rx = -Infinity,
    ly = Infinity,
    ry = -Infinity,
    maxR = 0;
  for (const n of containers) {
    const s = n._shape;
    lx = Math.min(lx, s.bbox.minX);
    rx = Math.max(rx, s.bbox.maxX);
    ly = Math.min(ly, s.bbox.minY);
    ry = Math.max(ry, s.bbox.maxY);
    maxR = Math.max(maxR, s.radius);
  }
  const W = rx - lx;
  const H = ry - ly;
  let s = Math.min(w / Math.max(1e-9, W), h / Math.max(1e-9, H));
  if (maxR > 1e-9) s = Math.min(s, w / (2 * maxR), h / (2 * maxR));
  const ox = (w - W * s) / 2;
  const oy = (h - H * s) / 2;
  for (const n of containers) {
    const sh = n._shape;
    const x = block.c0 + (sh.x - lx) * s + ox;
    const y = block.r0 + (sh.y - ly) * s + oy;
    const radius = sh.radius * s;
    const polygon =
      sh.type === "hex"
        ? createHexagonCoordinates(x, y, radius)
        : createCircleCoordinates(x, y, radius);
    let bx = Infinity,
      BX = -Infinity,
      by = Infinity,
      BY = -Infinity;
    for (const [px, py] of polygon) {
      bx = Math.min(bx, px);
      BX = Math.max(BX, px);
      by = Math.min(by, py);
      BY = Math.max(BY, py);
    }
    sh.x = x;
    sh.y = y;
    sh.radius = radius;
    sh.bbox = { minX: bx, maxX: BX, minY: by, maxY: BY };
    sh.polygon = polygon;
  }
}

function assignRectShape(n, b, island) {
  const w = b.c1 - b.c0 + 1;
  const h = b.r1 - b.r0 + 1;
  n._shape = {
    id: n.id,
    type: "rect",
    block: b,
    island: island ?? n._island ?? null,
    bbox: { minX: b.c0, maxX: b.c1 + 1, minY: b.r0, maxY: b.r1 + 1 },
    shapeRows: h,
    shapeCols: w,
    polygon: createRectangleCoordinates(
      (b.c0 + b.c1) / 2,
      (b.r0 + b.r1) / 2,
      w,
      h,
    ),
    weight: n.weight,
    leafCount: n.leafCount,
  };
}

function insetRect(r, g) {
  const w = r.c1 - r.c0 + 1;
  const h = r.r1 - r.r0 + 1;
  if (w <= 2 * g || h <= 2 * g) return { ...r };
  return { r0: r.r0 + g, c0: r.c0 + g, r1: r.r1 - g, c1: r.c1 - g };
}
