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

import { GridMapper } from '../core/grid-mapper.js';
import { buildHierarchy } from './hierarchy-tree.js';
import { gridTreemap, rectArea } from './grid-treemap.js';
import { packLeavesIntoBlock } from './footprint-packer.js';

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
 * @returns {Promise<Object>} { assignments, hierarchy, meta }
 *   - assignments: each leaf feature + global gridX/gridY + _path (ancestor ids) + _block.
 *   - hierarchy: root nodes (each gets a `_block` rect after allocation).
 *   - meta: { mode, rows, cols, levels, totalLeaves, count, slack }
 */
export async function allocateHierarchical(features, options = {}) {
    const {
        idAccessor = d => d.code,
        levels = [],
        xAccessor = d => d.x,
        yAccessor = d => d.y,
        mip = null,
        mapper = new GridMapper(),
        compactness = 0.5,
        slack = 1.35,
        minFactor = 1,
        rows = null,
        cols = null,
        smallBlockThreshold = 6,
        weightOf = () => 1,
        onProgress = null
    } = options;

    if (levels.length === 0) throw new Error('allocateHierarchical: options.levels is required');
    if (!mip) throw new Error('allocateHierarchical: options.mip is required');

    const coordsOf = f => [xAccessor(f), yAccessor(f)];
    const roots = buildHierarchy(features, { idAccessor, levels, coordsOf, weightOf });

    // --- Top-level global grid sizing ---
    const totalLeaves = roots.reduce((s, r) => s + r.leafCount, 0);
    const cellBudget = Math.max(totalLeaves, roots.length);

    let gridRows = rows;
    let gridCols = cols;
    if (!gridRows || !gridCols) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const r of roots) {
            const [x, y] = r.centroid;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const aspect = Math.max(0.25, Math.min(4, (maxX - minX) / Math.max(1e-9, maxY - minY)));
        const cells = Math.ceil(cellBudget * slack);
        gridCols = Math.max(1, Math.round(Math.sqrt(cells * aspect)));
        gridRows = Math.max(1, Math.ceil(cells / gridCols));
        while (gridRows * gridCols < cells) gridRows++;
    }

    const globalRect = { r0: 0, c0: 0, r1: gridRows - 1, c1: gridCols - 1 };
    const treemapOpts = { weightOf: n => n.leafCount, minFactor };
    const rootBlocks = gridTreemap(roots, globalRect, treemapOpts);
    for (const root of roots) root._block = rootBlocks.get(root.id);

    const assignments = [];
    const packOpts = { mapper, mip, xAccessor, yAccessor, compactness, smallBlockThreshold };

    const walk = async (node, block, path) => {
        node._block = block;
        const childPath = [...path, node.id];

        if (node.children.length > 0 && node.children.every(c => c.children.length === 0)) {
            // Node's children are leaves → pack one cell each.
            const packed = await packLeavesIntoBlock(node.children, block, packOpts);
            for (const p of packed) {
                assignments.push({ ...p, _path: childPath, _block: block });
            }
            return;
        }

        const subBlocks = gridTreemap(node.children, block, treemapOpts);
        for (const child of node.children) {
            await walk(child, subBlocks.get(child.id), childPath);
        }
    };

    let done = 0;
    const rootCount = roots.length;
    for (const root of roots) {
        await walk(root, rootBlocks.get(root.id), []);
        done++;
        if (onProgress) onProgress(done / rootCount);
    }

    return {
        assignments,
        hierarchy: roots,
        meta: {
            mode: 'grid-in-grid',
            rows: gridRows,
            cols: gridCols,
            levels,
            totalLeaves,
            count: assignments.length,
            slack,
            minFactor,
            gridCells: gridRows * gridCols,
            usedCells: new Set(assignments.map(a => `${a.gridY}_${a.gridX}`)).size
        }
    };
}
