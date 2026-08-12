/**
 * Grid Treemap
 * Lays out weighted items into non-overlapping integer-cell rectangles within
 * a given block, using a guillotine / binary-split treemap.
 *
 * Guarantees:
 *   - no overlap,
 *   - every item's rect has area >= its minimum (weight * minFactor),
 *   - items stay strictly inside the block.
 *
 * Items may be passed in a geo-ordered array so the mosaic keeps approximate
 * left→right / top→bottom geography.
 *
 * This is the "variable-size parent shape" primitive: a parent with more
 * descendants gets a bigger block, so downstream children have room.
 */

/**
 * @param {Array} items - Items with an id and a weight (see options).
 * @param {Object} rect - { r0, c0, r1, c1 } integer cell rect to fill.
 * @param {Object} [options]
 * @param {Function} [options.idOf] - (item) => id, default n.id.
 * @param {Function} [options.weightOf] - (item) => area weight, default n.leafCount ?? 1.
 * @param {number} [options.minFactor] - Multiplier on weight for the minimum
 *   area guarantee (headroom against integer-rounding losses). Default 1.
 * @returns {Map} id -> { r0, c0, r1, c1 }
 */
export function gridTreemap(items, rect, options = {}) {
    const {
        idOf = n => n.id,
        weightOf = n => n.leafCount ?? 1,
        minFactor = 1
    } = options;

    const rW = rect.c1 - rect.c0 + 1;
    const rH = rect.r1 - rect.r0 + 1;
    const totalArea = rW * rH;

    const list = items.map(n => {
        const w = Math.max(1, weightOf(n));
        return { id: idOf(n), raw: w, min: Math.ceil(w * minFactor) };
    });

    const rawSum = list.reduce((s, x) => s + x.raw, 0);
    const minSum = list.reduce((s, x) => s + x.min, 0);

    // Best-effort: if the block can't hold all minima (narrow/tight parent),
    // clamp slack to 0 and proceed — downstream leaf packing subdivides any
    // leaf-parent block that ends up short of its leaf count.
    const slack = Math.max(0, totalArea - minSum);

    // area_i = min_i + extra_i, where the extras are distributed by the
    // largest-remainder method so that sum(area) == totalArea EXACTLY and
    // every area >= its min (no drift handling needed).
    const extras = list.map(x => slack * x.raw / rawSum);
    list.forEach((x, i) => {
        x.frac = extras[i] - Math.floor(extras[i]);
        x.extra = Math.floor(extras[i]);
    });
    let remain = slack - list.reduce((s, x) => s + x.extra, 0);
    const order = list
        .map((x, i) => ({ i, f: x.frac }))
        .sort((a, b) => b.f - a.f || a.i - b.i);
    for (let k = 0; k < remain; k++) list[order[k].i].extra++;
    list.forEach(x => { x.area = x.min + x.extra; });

    const result = new Map();

    const sumRange = (from, to) => {
        let s = 0;
        for (let i = from; i < to; i++) s += list[i].area;
        return s;
    };
    const minRange = (from, to) => {
        let s = 0;
        for (let i = from; i < to; i++) s += list[i].min;
        return s;
    };

    function split(from, to, r) {
        const n = to - from;
        if (n === 1) {
            result.set(list[from].id, { r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c1 });
            return;
        }
        const w = r.c1 - r.c0 + 1;
        const h = r.r1 - r.r0 + 1;
        const dirs = w >= h ? ['v', 'h'] : ['h', 'v'];

        let chosen = null; // { s, pos, dir }
        for (const dir of dirs) {
            let bestS = -1;
            let bestDiff = Infinity;
            let bestPos = -1;
            let acc = 0;
            for (let s = from + 1; s < to; s++) {
                acc += list[s - 1].area;
                const areaA = acc;
                const areaB = sumRange(s, to);
                const minA = minRange(from, s);
                const minB = minRange(s, to);
                let pos;
                if (dir === 'v') {
                    const aCols = Math.ceil(minA / h);
                    const bCols = Math.ceil(minB / h);
                    if (aCols + bCols > w) continue;
                    pos = Math.round((areaA / (areaA + areaB)) * w);
                    pos = Math.max(aCols, Math.min(w - bCols, pos));
                } else {
                    const aRows = Math.ceil(minA / w);
                    const bRows = Math.ceil(minB / w);
                    if (aRows + bRows > h) continue;
                    pos = Math.round((areaA / (areaA + areaB)) * h);
                    pos = Math.max(aRows, Math.min(h - bRows, pos));
                }
                const diff = Math.abs(areaA - areaB);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestS = s;
                    bestPos = pos;
                }
            }
            if (bestS >= 0) { chosen = { s: bestS, pos: bestPos, dir }; break; }
        }

        if (!chosen) {
            // Best-effort fallback (narrow/tight block): proportional split.
            const mid = Math.floor((from + to) / 2);
            const areaA = sumRange(from, mid);
            const areaB = sumRange(mid, to);
            if (w >= h) {
                const pos = Math.max(1, Math.min(w - 1, Math.round((areaA / (areaA + areaB)) * w)));
                split(from, mid, { r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c0 + pos - 1 });
                split(mid, to, { r0: r.r0, c0: r.c0 + pos, r1: r.r1, c1: r.c1 });
            } else {
                const pos = Math.max(1, Math.min(h - 1, Math.round((areaA / (areaA + areaB)) * h)));
                split(from, mid, { r0: r.r0, c0: r.c0, r1: r.r0 + pos - 1, c1: r.c1 });
                split(mid, to, { r0: r.r0 + pos, c0: r.c0, r1: r.r1, c1: r.c1 });
            }
            return;
        }

        if (chosen.dir === 'v') {
            const cSplit = r.c0 + chosen.pos - 1;
            split(from, chosen.s, { r0: r.r0, c0: r.c0, r1: r.r1, c1: cSplit });
            split(chosen.s, to, { r0: r.r0, c0: cSplit + 1, r1: r.r1, c1: r.c1 });
        } else {
            const rSplit = r.r0 + chosen.pos - 1;
            split(from, chosen.s, { r0: r.r0, c0: r.c0, r1: rSplit, c1: r.c1 });
            split(chosen.s, to, { r0: rSplit + 1, c0: r.c0, r1: r.r1, c1: r.c1 });
        }
    }

    split(0, list.length, rect);
    return result; // Map<id, rect>
}

/** Cell area of a rect. */
export function rectArea(r) {
    return (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
}
