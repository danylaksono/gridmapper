/**
 * Footprint Packer
 * Packs leaf children (finest-level features) into a parent block.
 *
 * Reuses the existing MIP allocation engine on a local grid inscribed in the
 * block, then maps local cells back to global cell coordinates. For tiny
 * blocks it falls back to a fast deterministic greedy packer (MIP setup
 * overhead dominates below ~6 items).
 *
 * Guarantee: every child cell lies strictly inside the parent block, by
 * construction (the local grid == the block's integer extent).
 */

import { GridMapper } from '../core/grid-mapper.js';

/**
 * @param {Array} children - Leaf nodes ({ item }) to pack, one cell each.
 * @param {Object} block - { r0, c0, r1, c1 } parent block.
 * @param {Object} [options]
 * @param {GridMapper} [options.mapper]
 * @param {Function} [options.mip] - MIP solver factory (required for larger blocks).
 * @param {Function} [options.xAccessor]
 * @param {Function} [options.yAccessor]
 * @param {number} [options.compactness]
 * @param {number} [options.smallBlockThreshold] - Greedy below this many children.
 * @returns {Promise<Array>} Assignments with global gridX/gridY (plus original props).
 */
export async function packLeavesIntoBlock(children, block, options = {}) {
    const {
        mapper = new GridMapper(),
        mip = null,
        xAccessor = d => d.x,
        yAccessor = d => d.y,
        compactness = 0.5,
        smallBlockThreshold = 6
    } = options;

    const blockRows = block.r1 - block.r0 + 1;
    const blockCols = block.c1 - block.c0 + 1;

    // Local grid = the block's integer extent. If the block is smaller than the
    // leaf count (a treemap shape that can't split into enough integer cells),
    // subdivide the block's interior into finer sub-cells so the MIP always has
    // capacity. Sub-cells stay strictly inside the block (containment holds).
    let rows = blockRows;
    let cols = blockCols;
    let subdivided = false;
    if (rows * cols < children.length) {
        const need = children.length;
        const f = Math.sqrt(need / (rows * cols));
        rows = Math.max(rows, Math.ceil(rows * f));
        cols = Math.max(cols, Math.ceil(cols * f));
        while (rows * cols < need) {
            if (cols <= rows) cols++; else rows++;
        }
        subdivided = true;
    }

    let local;
    if (children.length <= smallBlockThreshold) {
        local = greedyPack(children, rows, cols, xAccessor, yAccessor);
    } else {
        if (!mip) {
            throw new Error('packLeavesIntoBlock: options.mip is required for blocks above smallBlockThreshold');
        }
        const res = await mapper.allocate(children.map(c => c.item), {
            rows,
            cols,
            compactness,
            mip,
            xAccessor,
            yAccessor
        });
        local = res.assignments.map(a => ({ item: a, localR: a.gridY, localC: a.gridX }));
    }

    return local.map(a => ({
        ...a.item,
        gridX: subdivided ? a.localC : block.c0 + a.localC,
        gridY: subdivided ? a.localR : block.r0 + a.localR,
        gridCols: cols,
        gridRows: rows,
        _subdivided: subdivided || undefined,
        _subDim: subdivided ? { rows, cols, blockRows, blockCols } : undefined
    }));
}

/**
 * Deterministic greedy packing: order children by (y, x), place each at the
 * nearest free cell to its normalized ideal position.
 */
function greedyPack(children, rows, cols, xAccessor, yAccessor) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of children) {
        const x = xAccessor(c.item);
        const y = yAccessor(c.item);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);

    const order = children
        .map((c, i) => ({ c, i }))
        .sort((a, b) => {
            const ay = yAccessor(a.c.item), ax = xAccessor(a.c.item);
            const by = yAccessor(b.c.item), bx = xAccessor(b.c.item);
            return (ay - by) || (ax - bx);
        });

    const used = new Set();
    const out = [];
    for (const { c } of order) {
        const x = xAccessor(c.item);
        const y = yAccessor(c.item);
        const tX = (x - minX) / spanX;
        const tY = (y - minY) / spanY;
        const idealR = clamp(Math.round(tY * (rows - 1)), 0, rows - 1);
        const idealC = clamp(Math.round(tX * (cols - 1)), 0, cols - 1);
        const [r, cc] = nearestFree(idealR, idealC, rows, cols, used);
        used.add(`${r}_${cc}`);
        out.push({ item: c.item, localR: r, localC: cc });
    }
    return out;
}

function nearestFree(ir, ic, rows, cols, used) {
    const maxD = Math.max(rows, cols);
    for (let d = 0; d <= maxD; d++) {
        for (let r = ir - d; r <= ir + d; r++) {
            for (let c = ic - d; c <= ic + d; c++) {
                if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
                if (Math.abs(r - ir) + Math.abs(c - ic) !== d) continue; // diamond ring
                if (!used.has(`${r}_${c}`)) return [r, c];
            }
        }
    }
    throw new Error('greedyPack: no free cell found');
}

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
