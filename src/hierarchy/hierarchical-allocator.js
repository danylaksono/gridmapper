/**
 * Hierarchical Allocator — grid-in-grid mode (M1 prototype)
 *
 * Recursively allocates a multi-level administrative hierarchy onto a single
 * global grid such that every level's cells are strictly contained within the
 * parent level's cells:
 *
 *   1. Coarsest level → global grid via an exact-cell treemap. Each parent
 *      gets a variable-size rectangular block whose area ∝ descendant count.
 *   2. Each non-leaf level subdivides its parent's block into its children's
 *      blocks (treemap), recursively.
 *   3. At the leaf level, children (finest features) are packed one-per-cell
 *      inside their parent's block, reusing the existing MIP allocation engine
 *      on a local grid (or a greedy packer for tiny blocks).
 *
 * Containment is guaranteed by construction: the local grid is the parent
 * block's integer extent, so every assigned cell lies inside it.
 */

import { GridMapper } from "../core/grid-mapper.js";
import { buildHierarchy } from "./hierarchy-tree.js";
import { gridTreemap, rectArea } from "./grid-treemap.js";
import { packLeavesIntoBlock } from "./footprint-packer.js";
import { runWorkerPool } from "../utils/parallel.js";

const PACK_WORKER_URL = new URL("./pack-worker.js", import.meta.url);

/**
 * @param {Array} features - Finest-level features (e.g. villages).
 * @param {Object} options
 * @param {Array} [options.levels] - Parent-code keys, coarse → fine.
 *   e.g. ['provinsi_code', 'kab_kota_code', 'kecamatan_code'].
 * @param {Function} [options.idAccessor] - (feature) => id, default d.code.
 * @param {Function} [options.xAccessor] - (feature) => x/lon.
 * @param {Function} [options.yAccessor] - (feature) => y/lat.
 * @param {Function} [options.mip] - MIP solver factory (required).
 * @param {GridMapper} [options.mapper]
 * @param {number} [options.compactness] - Passed to the leaf MIP.
 * @param {number} [options.slack] - Extra grid cells vs. total leaf count (default 1.35).
 *   Slack flows down proportionally through every level, giving each parent
 *   block headroom above its descendant count.
 * @param {number} [options.minFactor] - Minimum-area multiplier passed to the
 *   treemap (default 1). Keep at 1 so sum(children mins) == parent leaf count;
 *   headroom comes from `slack`, not from min inflation.
 * @param {number|null} [options.rows] - Optional top-level grid rows override.
 * @param {number|null} [options.cols] - Optional top-level grid cols override.
 * @param {number} [options.smallBlockThreshold] - Greedy pack below this (default 6).
 * @param {Function} [options.weightOf] - (feature) => leaf weight (default 1).
 * @param {string} [options.order] - 'spatial' (default) or 'input'. Spatial orders
 *   every treemap level by a spatial key over centroids and follows the geographic
 *   spread (normalized to the global extent), retaining relative geography much
 *   better than the raw input order.
 * @param {string} [options.orderMode] - Advanced: 'input' | 'hilbert' | 'z' | 'xy'
 *   | 'xyDesc' | 'yx' | 'yxDesc'. Overrides the ordering (default is data-adaptive:
 *   'xy' for wider-than-tall maps, 'yxDesc' for taller-than-wide).
 * @param {string} [options.dirPolicy] - Advanced: 'aspect' | 'spread' | 'spreadNorm'
 *   | 'orderKey'. Overrides the split-direction policy (default 'spreadNorm').
 * @param {number} [options.concurrency] - Worker-thread parallelism for the
 *   independent leaf-packing MIPs (default 0 = auto: min(8, cpuCount-1) in
 *   Node; browser falls back to sequential). Set 1 to force sequential.
 * @returns {Promise<Object>} { assignments, hierarchy, meta }
 *   - assignments: each leaf feature + global gridX/gridY + _path (ancestor ids) + _block.
 *   - hierarchy: root nodes (each gets a `_block` rect after allocation).
 *   - meta: { mode, rows, cols, levels, totalLeaves, count, slack }
 */
export async function allocateHierarchical(features, options = {}) {
  const {
    idAccessor = (d) => d.code,
    levels = [],
    xAccessor = (d) => d.x,
    yAccessor = (d) => d.y,
    mip = null,
    mapper = new GridMapper(),
    compactness = 0.5,
    slack = 1.35,
    minFactor = 1,
    rows = null,
    cols = null,
    smallBlockThreshold = 6,
    weightOf = () => 1,
    order = "spatial",
    orderMode = null,
    dirPolicy = null,
    concurrency = 0,
    onProgress = null,
  } = options;

  if (levels.length === 0)
    throw new Error("allocateHierarchical: options.levels is required");
  if (!mip) throw new Error("allocateHierarchical: options.mip is required");

  const coordsOf = (f) => [xAccessor(f), yAccessor(f)];
  const roots = buildHierarchy(features, {
    idAccessor,
    levels,
    coordsOf,
    weightOf,
  });

  // --- Top-level global grid sizing ---
  const totalLeaves = roots.reduce((s, r) => s + r.leafCount, 0);
  const cellBudget = Math.max(totalLeaves, roots.length);

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

  let gridRows = rows;
  let gridCols = cols;
  if (!gridRows || !gridCols) {
    const aspect = Math.max(
      0.25,
      Math.min(4, (maxX - minX) / Math.max(1e-9, maxY - minY)),
    );
    const cells = Math.ceil(cellBudget * slack);
    gridCols = Math.max(1, Math.round(Math.sqrt(cells * aspect)));
    gridRows = Math.max(1, Math.ceil(cells / gridCols));
    while (gridRows * gridCols < cells) gridRows++;
  }

  const globalRect = { r0: 0, c0: 0, r1: gridRows - 1, c1: gridCols - 1 };
  const spatial = order === "spatial";
  const aspect = (maxX - minX) / Math.max(1e-9, maxY - minY);
  const treemapOpts = {
    weightOf: (n) => n.leafCount,
    minFactor,
    positionOf: spatial ? (n) => n.centroid : null,
    orderMode:
      orderMode ?? (spatial ? (aspect >= 1 ? "xy" : "yxDesc") : "input"),
    dirPolicy: dirPolicy ?? (spatial ? "spreadNorm" : "aspect"),
    extent: {
      x: Math.max(1e-12, maxX - minX),
      y: Math.max(1e-12, maxY - minY),
    },
  };
  const rootBlocks = gridTreemap(roots, globalRect, treemapOpts);
  for (const root of roots) root._block = rootBlocks.get(root.id);

  // --- Phase A: assign a block to every node (treemap), no packing ---
  const assignBlocks = (node, block, path) => {
    node._block = block;
    node._path = [...path, node.id];
    const isLeafParent =
      node.children.length > 0 && node.children.every((c) => c.children.length === 0);
    if (!isLeafParent) {
      const subBlocks = gridTreemap(node.children, block, treemapOpts);
      for (const child of node.children) {
        assignBlocks(child, subBlocks.get(child.id), node._path);
      }
    }
  };
  for (const root of roots) assignBlocks(root, rootBlocks.get(root.id), []);

  // --- Collect the independent packable units (leaf parents) ---
  const leafParents = [];
  const collect = (node) => {
    if (node.children.length > 0 && node.children.every((c) => c.children.length === 0)) {
      leafParents.push(node);
    } else {
      for (const c of node.children) collect(c);
    }
  };
  for (const root of roots) collect(root);

  const assignments = [];
  const packOpts = {
    mapper,
    mip,
    xAccessor,
    yAccessor,
    compactness,
    smallBlockThreshold,
  };

  const packSequential = async () => {
    for (const node of leafParents) {
      const packed = await packLeavesIntoBlock(node.children, node._block, packOpts);
      for (const p of packed) {
        assignments.push({ ...p, _path: node._path, _block: node._block });
      }
      if (onProgress) onProgress(assignments.length / totalLeaves);
    }
  };

  const packParallel = async () => {
    const tasks = leafParents.map((node, index) => ({
      index,
      payload: {
        mode: "block",
        block: node._block,
        children: node.children.map((c) => ({
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
    let done = 0;
    leafParents.forEach((node, i) => {
      for (const r of results[i]) {
        const child = node.children.find((c) => c.id === r.childId);
        assignments.push({
          ...child.item,
          gridX: r.gridX,
          gridY: r.gridY,
          gridRows: r.gridRows,
          gridCols: r.gridCols,
          ...(r.subdivided ? { _subdivided: true } : {}),
          _path: node._path,
          _block: node._block,
        });
        done++;
      }
    });
    void done;
  };

  const useParallel =
    concurrency !== 1 &&
    leafParents.length > 4 &&
    typeof process !== "undefined" &&
    process.versions &&
    typeof process.versions.node !== "undefined"; // Node only

  if (useParallel) {
    try {
      await packParallel();
    } catch (e) {
      // worker_threads unavailable (e.g. browser/bundler) → fall back
      assignments.length = 0;
      await packSequential();
    }
  } else {
    await packSequential();
  }

  return {
    assignments,
    hierarchy: roots,
    meta: {
      mode: "grid-in-grid",
      rows: gridRows,
      cols: gridCols,
      levels,
      totalLeaves,
      count: assignments.length,
      slack,
      minFactor,
      gridCells: gridRows * gridCols,
      usedCells: new Set(assignments.map((a) => `${a.gridY}_${a.gridX}`)).size,
    },
  };
}
