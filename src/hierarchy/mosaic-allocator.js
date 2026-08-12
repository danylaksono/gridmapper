/**
 * Mosaic Hierarchical Allocator — mode 'mosaic' (M2)
 *
 * Case B: a parent level is laid out as a VALUE-SCALED mosaic cartogram and the
 * finest-level features are packed inside each parent's shape.
 *
 * Supported parent shapes:
 *   - 'rect'   : rectangular mosaic carved by the exact-cell treemap; area ∝
 *                value (descendant count or a custom weight), geography-aware.
 *   - 'circle' : Dorling-style circles scaled by value, non-overlapping via the
 *                existing force simulation.
 *   - 'hex'    : flat-top hexagons, same Dorling layout.
 *
 * Children (finest features, e.g. villages) are then packed one-per-cell inside
 * their parent shape:
 *   - rect  → reused footprint-packer (local grid == block).
 *   - circle/hex → a local grid is inscribed in the shape's bounding box and
 *                only cells inside the polygon are allowed (hard spacers
 *                outside), so every child cell lies strictly inside the shape.
 *
 * Containment is guaranteed by construction in both paths.
 */

import { GridMapper } from "../core/grid-mapper.js";
import { buildHierarchy } from "./hierarchy-tree.js";
import { gridTreemap, rectArea } from "./grid-treemap.js";
import { packLeavesIntoBlock } from "./footprint-packer.js";
import { detectIslands } from "./islands.js";import { runWorkerPool } from '../utils/parallel.js';import { SpacerUtils } from "../features/spacer-utils.js";
import { normalizePointsToGrid } from "../normalization/point-normalizer.js";
import {
  solveAdvancedAllocation,
  mapSolutionToAssignments,
} from "../core/allocation-engine-advanced.js";
import { runForceSimulation } from "../cartogram/force-simulation.js";
import {
  weightToRadius,
  calculateScaleFactor,
  createCircleCoordinates,
  createHexagonCoordinates,
  createRectangleCoordinates,
} from "../cartogram/shape-generator.js";
const PACK_WORKER_URL = new URL('./pack-worker.js', import.meta.url);
/**
 * @param {Array} features - Finest-level features (e.g. villages).
 * @param {Object} options
 * @param {Array} [options.levels] - Parent-code keys, coarse → fine. The finest
 *   parent level (e.g. kecamatan_code) becomes the mosaic.
 * @param {string} [options.shapeType] - 'rect' | 'circle' | 'hex' (default 'rect').
 * @param {Function} [options.idAccessor] - (feature) => id, default d.code.
 * @param {Function} [options.xAccessor] - (feature) => x/lon.
 * @param {Function} [options.yAccessor] - (feature) => y/lat.
 * @param {Function} [options.mip] - MIP solver factory (required).
 * @param {GridMapper} [options.mapper]
 * @param {number} [options.compactness] - Passed to the leaf packing MIP.
 * @param {Function} [options.weightOf] - (feature) => value used to scale the
 *   mosaic shape area (default 1 → area ∝ descendant count).
 * @param {number} [options.slack] - Extra cells vs. total leaf count (default 1.35).
 * @param {number} [options.seed] - Determinism seed for the Dorling layout (default 1).
 * @param {number} [options.dorlingIterations] - Force-sim iterations (default 800).
 * @param {number} [options.dorlingK] - Fill ratio for the largest shape (default 12).
 * @param {string} [options.dorlingMethod] - 'auto' | 'pairwise' | 'barneshut'.
 *   Force-sim repulsion method (default 'auto'; barneshut for > 1500 nodes).
 * @param {Function} [options.islandAccessor] - (feature) => island/landmass id.
 *   When omitted, islands are auto-detected from a `seaGapKm` water-gap threshold.
 * @param {number} [options.seaGapKm] - Water-gap threshold in km for automatic
 *   island detection (default 30).
 * @param {number} [options.islandGap] - circle/hex: fractional sea gap kept
 *   between different islands' shapes (default 0.25).
 * @param {number} [options.seaGutter] - rect: cells of gap reserved between
 *   island blocks so islands read as separated (default 1; 0 disables).
 * @param {string} [options.orderMode] - Advanced treemap ordering override.
 * @param {string} [options.dirPolicy] - Advanced treemap direction override.
 * @param {number} [options.concurrency] - Worker-thread parallelism for the
 *   independent per-shape packing MIPs (default 0 = auto in Node; browser
 *   falls back to sequential). Set 1 to force sequential.
 * @returns {Promise<Object>} { assignments, shapes, meta }
 *   - assignments: each leaf + local gridX/gridY within its shape + `_shape`
 *     (the parent shape: id, type, bbox, polygon, ...) + `_path`.
 *   - shapes: array of mosaic shapes (id, type, bbox, shapeRows, shapeCols,
 *     polygon, weight, leafCount).
 *   - meta: { mode, shapeType, count, containers, ... }
 */
export async function allocateMosaicHierarchical(features, options = {}) {
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
    seed = 1,
    dorlingIterations = 800,
    dorlingK = 12,
    dorlingMethod = "auto",
    islandAccessor = null,
    seaGapKm = 30,
    islandGap = 0.25,
    seaGutter = 1,
    smallBlockThreshold = 6,
    minFactor = 1,
    orderMode = null,
    dirPolicy = null,
    concurrency = 0,
  } = options;

  if (levels.length === 0)
    throw new Error("allocateMosaicHierarchical: options.levels is required");
  if (!mip)
    throw new Error("allocateMosaicHierarchical: options.mip is required");

  const coordsOf = (f) => [xAccessor(f), yAccessor(f)];
  const roots = buildHierarchy(features, {
    idAccessor,
    levels,
    coordsOf,
    weightOf,
  });

  // Containers = leaf-parent nodes (children are leaves).
  const containers = [];
  const collect = (nodes) => {
    for (const n of nodes) {
      if (
        n.children.length > 0 &&
        n.children.every((c) => c.children.length === 0)
      ) {
        containers.push(n);
      } else {
        collect(n.children);
      }
    }
  };
  collect(roots);
  if (containers.length === 0)
    throw new Error(
      "allocateMosaicHierarchical: no leaf-parent containers found",
    );

  // --- Value-scaled areas (value ∝ weight, floored by descendant count) ---
  const totalLeaves = containers.reduce((s, n) => s + n.leafCount, 0);
  const totalValue = containers.reduce((s, n) => s + Math.max(1, n.weight), 0);
  const valueScale = totalLeaves / Math.max(1, totalValue);
  containers.forEach((n) => {
    n._area = Math.max(
      n.leafCount,
      Math.max(1, Math.round(n.weight * valueScale)),
    );
  });
  const totalArea = containers.reduce((s, n) => s + n._area, 0);

  // --- Island groups (archipelago separation) ---
  let islandInfo = null;
  if (islandAccessor || seaGapKm > 0) {
    islandInfo = detectIslands(containers, {
      positionOf: (n) => n.centroid,
      islandAccessor,
      seaGapKm,
    });
    containers.forEach((n, i) => {
      n._island = islandInfo.ids[i];
    });
  }

  // --- Layout the mosaic parent level ---
  if (shapeType === "rect") {
    layoutRectMosaic(
      containers,
      totalArea,
      slack,
      minFactor,
      orderMode,
      dirPolicy,
      islandInfo,
      seaGutter,
    );
  } else if (shapeType === "circle" || shapeType === "hex") {
    layoutDorlingMosaic(
      containers,
      shapeType,
      dorlingIterations,
      dorlingK,
      seed,
      islandInfo,
      islandGap,
      dorlingMethod,
    );
  } else {
    throw new Error(
      `allocateMosaicHierarchical: unknown shapeType "${shapeType}"`,
    );
  }

  // --- Pack children into each shape ---
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
            _path: [n.id],
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
            _path: [n.id],
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
          _path: [n.id],
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
    return packIntoShape(n.children, shape, { mip, xAccessor, yAccessor, compactness });
  };

  const packSequential = async () => {
    for (const n of containers) {
      assignments.push(...buildAssignments(n, await packOne(n)));
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
    const results = await runWorkerPool(tasks, PACK_WORKER_URL, { concurrency });
    containers.forEach((n, i) => {
      const shape = n._shape;
      if (shape.type !== "rect" && results[i].length) {
        // worker computed the shape's grid dims on its own copy → copy back
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
              _path: [n.id],
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
              _path: [n.id],
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
            _path: [n.id],
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
    hierarchy: roots,
    meta: {
      mode: "mosaic",
      shapeType,
      levels,
      count: assignments.length,
      containers: containers.length,
      totalLeaves,
      slack,
      seed,
      islands: islandInfo ? islandInfo.groups.size : 0,
      seaGapKm: islandAccessor ? null : seaGapKm,
    },
  };
}

// ---------------------------------------------------------------------------
// Rectangular mosaic (exact-cell treemap)
// ---------------------------------------------------------------------------
function layoutRectMosaic(
  containers,
  totalArea,
  slack,
  minFactor,
  orderMode,
  dirPolicy,
  islandInfo = null,
  seaGutter = 0,
) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of containers) {
    const [x, y] = n.centroid;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const aspect = Math.max(
    0.25,
    Math.min(4, (maxX - minX) / Math.max(1e-9, maxY - minY)),
  );

  // Grid must be big enough for the blocks plus the sea gutters between islands.
  let layoutTotal = totalArea;
  if (islandInfo && seaGutter > 0) {
    const groups0 = new Map();
    islandInfo.ids.forEach((island, i) => {
      if (!groups0.has(island)) groups0.set(island, []);
      groups0.get(island).push(containers[i]);
    });
    layoutTotal = [...groups0.values()].reduce((s, members) => {
      const a = members.reduce((t, m) => t + m._area, 0);
      return s + a + 6 * seaGutter * Math.sqrt(a); // area + ~perimeter of gutter
    }, 0);
  }

  const cells = Math.ceil(layoutTotal * slack);
  let cols = Math.max(1, Math.round(Math.sqrt(cells * aspect)));
  let rows = Math.max(1, Math.ceil(cells / cols));
  while (rows * cols < cells) rows++;

  const globalRect = { r0: 0, c0: 0, r1: rows - 1, c1: cols - 1 };
  const extent = {
    x: Math.max(1e-12, maxX - minX),
    y: Math.max(1e-12, maxY - minY),
  };
  const treemapBase = {
    minFactor,
    positionOf: (n) => n.centroid,
    orderMode: orderMode ?? (aspect >= 1 ? "xy" : "yxDesc"),
    dirPolicy: dirPolicy ?? "spreadNorm",
    extent,
  };

  if (islandInfo && seaGutter > 0) {
    // Two-level layout: islands first (with a sea gutter between them), then
    // each island's containers inside its usable (inset) block.
    const groups = new Map();
    islandInfo.ids.forEach((island, i) => {
      if (!groups.has(island)) groups.set(island, []);
      groups.get(island).push(containers[i]);
    });
    const islandNodes = [...groups.entries()].map(([islandId, members]) => {
      const cx =
        members.reduce((s, m) => s + m.centroid[0], 0) / members.length;
      const cy =
        members.reduce((s, m) => s + m.centroid[1], 0) / members.length;
      const area = members.reduce((s, m) => s + m._area, 0);
      return {
        id: `island_${islandId}`,
        members,
        centroid: [cx, cy],
        area,
        requested: area + 6 * seaGutter * Math.sqrt(area), // + gutter cost
      };
    });
    const islandBlocks = gridTreemap(islandNodes, globalRect, {
      ...treemapBase,
      weightOf: (n) => n.requested,
    });
    for (const inode of islandNodes) {
      const ib = islandBlocks.get(inode.id);
      let usable = insetRect(ib, seaGutter);
      if (rectArea(usable) < inode.area) usable = ib; // too tight: no sea gutter for this island
      const memberBlocks = gridTreemap(inode.members, usable, {
        ...treemapBase,
        weightOf: (n) => n._area,
      });
      for (const m of inode.members) {
        assignRectShape(m, memberBlocks.get(m.id), inode.id);
      }
    }
    return;
  }

  const blocks = gridTreemap(containers, globalRect, {
    ...treemapBase,
    weightOf: (n) => n._area,
  });
  for (const n of containers) {
    assignRectShape(n, blocks.get(n.id), null);
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

// ---------------------------------------------------------------------------
// Dorling mosaic (circles / hexagons via force simulation)
// ---------------------------------------------------------------------------
function layoutDorlingMosaic(
  containers,
  shapeType,
  iterations,
  k,
  seed,
  islandInfo = null,
  islandGap = 0,
  method = "auto",
) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const nodes = containers.map((n, i) => {
    const [x, y] = n.centroid;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return {
      id: n.id,
      item: n.item,
      leafCount: n.leafCount,
      weight: n.weight,
      island: islandInfo ? islandInfo.ids[i] : null,
      x,
      y,
      originalX: x,
      originalY: y,
    };
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const scaleLen = Math.max(width, height, 1e-9);

  nodes.forEach((n) => {
    n.x = (n.x - minX) / scaleLen;
    n.y = (n.y - minY) / scaleLen;
    n.originalX = n.x;
    n.originalY = n.y;
  });

  const maxArea = Math.max(...containers.map((n) => n._area));
  const scaleFactor = calculateScaleFactor(
    { minX: 0, maxX: width / scaleLen, minY: 0, maxY: height / scaleLen },
    maxArea,
    k,
  );
  nodes.forEach((n, i) => {
    n.radius = weightToRadius(containers[i]._area, scaleFactor);
  });

  // Adaptive iterations: for large layouts the force sim converges with far
  // fewer iterations (overlap reduction is asymptotic). Scales 800 down to
  // ~100-200 for the full 7,275-kecamatan case.
  const effIterations =
    nodes.length > 1500
      ? Math.max(100, Math.round((iterations * 1000) / nodes.length))
      : iterations;

  runForceSimulation(nodes, {
    iterations: effIterations,
    shapeType: shapeType === "hex" ? "hexagon" : "circle",
    repulsionStrength: 1.0,
    anchorStrength: 0.02,
    coolingFactor: 0.998,
    minRepulsion: 0.5,
    seed,
    initialJitter: seed == null ? 0 : 1e-6,
    islandOf: islandInfo ? (n) => n.island : null,
    islandGap,
    method,
  });

  nodes.forEach((n) => {
    n.x = n.x * scaleLen + minX;
    n.y = n.y * scaleLen + minY;
    n.radius *= scaleLen;
  });

  nodes.forEach((n, i) => {
    const container = containers[i];
    const polygon =
      shapeType === "hex"
        ? createHexagonCoordinates(n.x, n.y, n.radius)
        : createCircleCoordinates(n.x, n.y, n.radius);
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
    container._shape = {
      id: n.id,
      type: shapeType,
      island: n.island,
      x: n.x,
      y: n.y,
      radius: n.radius,
      bbox: { minX: bx, maxX: BX, minY: by, maxY: BY },
      shapeRows: null,
      shapeCols: null,
      polygon,
      weight: n.weight,
      leafCount: n.leafCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Pack leaves into a non-rectangular shape (masked local grid)
// ---------------------------------------------------------------------------
export async function packIntoShape(children, shape, opts) {
  const { mip, xAccessor, yAccessor, compactness } = opts;
  const bbox = shape.bbox;
  const bounds = {
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
  };
  const pts = children.map((c, i) => ({
    id: i,
    originalData: c.item,
    x: xAccessor(c.item),
    y: yAccessor(c.item),
  }));

  const target = Math.max(children.length, 1);
  let rows = Math.max(2, Math.ceil(Math.sqrt(target * 1.6)));
  let cols = rows;
  let spacers = null;
  for (let g = 0; g < 24; g++) {
    const sp = SpacerUtils.autoCompute(
      [],
      bounds,
      rows,
      cols,
      shape.polygon,
      "rect",
    );
    if (rows * cols - sp.length >= target) {
      spacers = sp;
      break;
    }
    rows += 1;
    cols += 1;
  }
  if (!spacers) {
    throw new Error(
      `packIntoShape: cannot fit ${target} cells into shape ${shape.id}`,
    );
  }

  const spacerSet = new Set(spacers.map(([r, c]) => `${r}_${c}`));
  const normalizedPoints = normalizePointsToGrid(
    pts,
    bounds,
    rows,
    cols,
    compactness,
    "rect",
  );
  const solution = await solveAdvancedAllocation(normalizedPoints, {
    gridRows: rows,
    gridCols: cols,
    gridType: "rect",
    distanceMetric: "euclidean",
    compactnessWeight: 1,
    spacerMode: "hard",
    maskPenalty: 1e3,
    spacerSet,
    adjacencyWeight: 0,
    embeddingWeight: 0,
    mipFactory: mip,
  });
  const asg = mapSolutionToAssignments(solution, pts, rows, cols);
  shape.shapeRows = rows;
  shape.shapeCols = cols;
  return asg.map((a) => ({ item: a, localR: a.gridY, localC: a.gridX }));
}
