import { orderByHilbert, orderByMorton } from "./spatial-order.js";

// Sort-key specs for axis-major orders. axis: 0 = x/lon, 1 = y/lat; dir: sort sign.
const SPEC_ORDER = {
  xy: [
    { axis: 0, dir: 1 },
    { axis: 1, dir: 1 },
  ],
  xyDesc: [
    { axis: 0, dir: -1 },
    { axis: 1, dir: 1 },
  ],
  yx: [
    { axis: 1, dir: 1 },
    { axis: 0, dir: 1 },
  ],
  yxDesc: [
    { axis: 1, dir: -1 },
    { axis: 0, dir: 1 },
  ],
};

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
 * Geography retention: pass `positionOf` and items are reordered by a Hilbert
 * space-filling curve over their positions, and each split's direction follows
 * the children's geographic spread — so the mosaic keeps approximate relative
 * positions (spatially ordered treemap, cf. Wood & Dykes 2008).
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
 * @param {Function} [options.positionOf] - (item) => [x, y] geographic position.
 *   When provided, items may be reordered and split directions may follow the
 *   geographic spread (improves geography retention).
 * @param {string} [options.orderMode] - 'input' | 'hilbert' | 'z' | 'xy' | 'xyDesc'
 *   | 'yx' | 'yxDesc'. Ordering applied to `items` before layout (default:
 *   'hilbert' when positionOf is given, else 'input').
 * @param {string} [options.dirPolicy] - 'aspect' | 'spread' | 'spreadNorm' | 'orderKey'.
 *   How each split direction is chosen (default: 'spread' when positionOf is
 *   given, else 'aspect'). 'spreadNorm' compares spreads as a fraction of the
 *   global geographic extent (see `extent`).
 * @param {string} [options.layoutMode] - 'split' (default) | 'hilbertPath'.
 *   'split' is the classic guillotine area-balance treemap. 'hilbertPath' is a
 *   true path-following layout (Wood & Dykes 2008): items are ordered by a
 *   Hilbert curve and the rect is recursively subdivided into the four quadrants
 *   in the curve's visit order (BL→TL→TR→BR, matching the standard xy2d curve
 *   that starts south-west), assigning each quadrant a contiguous segment proportional to its area. This makes contiguous
 *   Hilbert-order segments map to contiguous Hilbert quadrants, retaining BOTH
 *   geography axes instead of the one-axis-vs-balance trade-off of 'split'.
 *   Falls back to 'split' for infeasible/tight sub-blocks. Requires positionOf.
 * @param {Object} [options.extent] - { x, y } global geographic extents, used by
 *   'spreadNorm' to normalize spread comparisons.
 * @returns {Map} id -> { r0, c0, r1, c1 }
 */
export function gridTreemap(items, rect, options = {}) {
  const {
    idOf = (n) => n.id,
    weightOf = (n) => n.leafCount ?? 1,
    minFactor = 1,
    positionOf = null,
    orderMode = positionOf ? "hilbert" : "input",
    dirPolicy = positionOf ? "spread" : "aspect",
    layoutMode = "split",
    extent = null,
  } = options;

  const rW = rect.c1 - rect.c0 + 1;
  const rH = rect.r1 - rect.r0 + 1;
  const totalArea = rW * rH;

  const list = items.map((n) => {
    const w = Math.max(1, weightOf(n));
    return {
      id: idOf(n),
      raw: w,
      min: Math.ceil(w * minFactor),
      pos: positionOf ? positionOf(n) : null,
    };
  });

  if (layoutMode === "hilbertPath" && positionOf) {
    // Path-following layout REQUIRES Hilbert ordering (independent of orderMode).
    const orderIdx = orderByHilbert(items, positionOf);
    const reordered = orderIdx.map((i) => list[i]);
    list.length = 0;
    list.push(...reordered);
  } else if (positionOf && orderMode !== "input") {
    let orderIdx = null;
    if (orderMode === "hilbert") {
      orderIdx = orderByHilbert(items, positionOf);
    } else if (orderMode === "z") {
      orderIdx = orderByMorton(items, positionOf);
    } else if (SPEC_ORDER[orderMode]) {
      const specs = SPEC_ORDER[orderMode];
      orderIdx = items
        .map((n, i) => {
          const p = positionOf(n);
          const o = { i };
          specs.forEach((s, k) => {
            o["k" + k] = s.dir * p[s.axis];
          });
          return o;
        })
        .sort((a, b) => {
          for (let k = 0; k < specs.length; k++) {
            const d = a["k" + k] - b["k" + k];
            if (d) return d;
          }
          return a.i - b.i;
        })
        .map((o) => o.i);
    }
    if (orderIdx) {
      const reordered = orderIdx.map((i) => list[i]);
      list.length = 0;
      list.push(...reordered);
    }
  }

  const rawSum = list.reduce((s, x) => s + x.raw, 0);
  const minSum = list.reduce((s, x) => s + x.min, 0);

  // Best-effort: if the block can't hold all minima (narrow/tight parent),
  // clamp slack to 0 and proceed — downstream leaf packing subdivides any
  // leaf-parent block that ends up short of its leaf count.
  const slack = Math.max(0, totalArea - minSum);

  // area_i = min_i + extra_i, where the extras are distributed by the
  // largest-remainder method so that sum(area) == totalArea EXACTLY and
  // every area >= its min (no drift handling needed).
  const extras = list.map((x) => (slack * x.raw) / rawSum);
  list.forEach((x, i) => {
    x.frac = extras[i] - Math.floor(extras[i]);
    x.extra = Math.floor(extras[i]);
  });
  let remain = slack - list.reduce((s, x) => s + x.extra, 0);
  const order = list
    .map((x, i) => ({ i, f: x.frac }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < remain; k++) list[order[k].i].extra++;
  list.forEach((x) => {
    x.area = x.min + x.extra;
  });

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
      result.set(list[from].id, {
        r0: r.r0,
        c0: r.c0,
        r1: Math.max(r.r1, r.r0), // never emit a zero-height/width block
        c1: Math.max(r.c1, r.c0),
      });
      return;
    }
    const w = r.c1 - r.c0 + 1;
    const h = r.r1 - r.r0 + 1;

    // Split direction policy:
    //  - 'aspect'   : split the longer rect side (classic treemap).
    //  - 'spread'   : follow the geographic spread of this slice's items.
    //  - 'orderKey' : follow the primary key of the chosen ordering.
    let dirs;
    if (dirPolicy === "aspect" || !list[from].pos) {
      dirs = w >= h ? ["v", "h"] : ["h", "v"];
    } else if (dirPolicy === "spread") {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = from; i < to; i++) {
        const [x, y] = list[i].pos;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      dirs = maxX - minX >= maxY - minY ? ["v", "h"] : ["h", "v"];
    } else if (dirPolicy === "spreadNorm") {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = from; i < to; i++) {
        const [x, y] = list[i].pos;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const fx = (maxX - minX) / Math.max(1e-12, extent?.x ?? maxX - minX);
      const fy = (maxY - minY) / Math.max(1e-12, extent?.y ?? maxY - minY);
      dirs = fx >= fy ? ["v", "h"] : ["h", "v"];
    } else {
      // 'orderKey': follow the primary axis of the chosen ordering.
      dirs =
        orderMode === "yx" || orderMode === "yxDesc" ? ["h", "v"] : ["v", "h"];
    }

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
        if (dir === "v") {
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
      if (bestS >= 0) {
        chosen = { s: bestS, pos: bestPos, dir };
        break;
      }
    }

    if (!chosen) {
      // Best-effort fallback (narrow/tight block): proportional split.
      const mid = Math.floor((from + to) / 2);
      const areaA = sumRange(from, mid);
      const areaB = sumRange(mid, to);
      if (w >= h) {
        const pos = Math.max(
          1,
          Math.min(w - 1, Math.round((areaA / (areaA + areaB)) * w)),
        );
        split(from, mid, { r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c0 + pos - 1 });
        split(mid, to, { r0: r.r0, c0: r.c0 + pos, r1: r.r1, c1: r.c1 });
      } else {
        const pos = Math.max(
          1,
          Math.min(h - 1, Math.round((areaA / (areaA + areaB)) * h)),
        );
        split(from, mid, { r0: r.r0, c0: r.c0, r1: r.r0 + pos - 1, c1: r.c1 });
        split(mid, to, { r0: r.r0 + pos, c0: r.c0, r1: r.r1, c1: r.c1 });
      }
      return;
    }

    if (chosen.dir === "v") {
      const cSplit = r.c0 + chosen.pos - 1;
      split(from, chosen.s, { r0: r.r0, c0: r.c0, r1: r.r1, c1: cSplit });
      split(chosen.s, to, { r0: r.r0, c0: cSplit + 1, r1: r.r1, c1: r.c1 });
    } else {
      const rSplit = r.r0 + chosen.pos - 1;
      split(from, chosen.s, { r0: r.r0, c0: r.c0, r1: rSplit, c1: r.c1 });
      split(chosen.s, to, { r0: rSplit + 1, c0: r.c0, r1: r.r1, c1: r.c1 });
    }
  }

  /**
   * Path-following Hilbert layout: recursively subdivide the rect into the four
   * quadrants in the Hilbert curve's visit order (BL→TL→TR→BR) and give each
   * quadrant a contiguous slice of the Hilbert-ordered list, proportional to the
   * quadrant's area. Contiguous Hilbert-order runs therefore land in contiguous
   * Hilbert quadrants, which preserves both geographic axes much better than a
   * single-sort guillotine cut. Falls back to `split` when a quadrant cannot
   * hold its slice's minimum areas (tight/odd blocks).
   */
  function layoutHilbertPath(from, to, r) {
    const n = to - from;
    if (n <= 1) {
      if (n === 1)
        result.set(list[from].id, {
          r0: r.r0,
          c0: r.c0,
          r1: Math.max(r.r1, r.r0), // never emit a zero-height/width block
          c1: Math.max(r.c1, r.c0),
        });
      return;
    }
    const w = r.c1 - r.c0 + 1;
    const h = r.r1 - r.r0 + 1;
    if (w < 2 || h < 2) {
      split(from, to, r);
      return;
    }
    const c0 = Math.ceil(w / 2);
    const c1 = w - c0; // right column width
    const r0 = Math.ceil(h / 2);
    const r1 = h - r0; // bottom row height
    // Hilbert visit order (standard xy2d curve, starts south-west):
    // bottom-left → top-left → top-right → bottom-right.
    const quads = [
      { r0: r0, c0: 0, r1: h - 1, c1: c0 - 1 }, // BL
      { r0: 0, c0: 0, r1: r0 - 1, c1: c0 - 1 }, // TL
      { r0: 0, c0: c0, r1: r0 - 1, c1: w - 1 }, // TR
      { r0: r0, c0: c0, r1: h - 1, c1: w - 1 }, // BR
    ];
    const qAreas = quads.map((q) =>
      Math.max(0, (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1)),
    );
    const totalArea = w * h;
    if (totalArea <= 0) {
      split(from, to, r);
      return;
    }

    // Contiguous segment sizes ∝ quadrant areas (largest-remainder).
    const exact = qAreas.map((a) => (a * n) / totalArea);
    let sizes = exact.map(Math.floor);
    let remain = n - sizes.reduce((s, x) => s + x, 0);
    const ord = exact
      .map((f, i) => ({ i, f: f - Math.floor(f) }))
      .sort((a, b) => b.f - a.f || a.i - b.i);
    for (let k = 0; k < remain; k++) sizes[ord[k % 4].i]++;
    for (let k = 0; k < 4; k++) if (qAreas[k] === 0) sizes[k] = 0; // empty quadrant
    let ssum = sizes.reduce((s, x) => s + x, 0);
    if (ssum !== n) {
      let bi = 0;
      for (let k = 1; k < 4; k++) if (qAreas[k] > qAreas[bi]) bi = k;
      sizes[bi] += n - ssum;
    }

    const segs = [];
    let start = from;
    for (let k = 0; k < 4; k++) {
      segs.push([start, start + sizes[k]]);
      start += sizes[k];
    }
    // Feasibility: each segment's minimum areas must fit its quadrant.
    let feasible = true;
    for (let k = 0; k < 4; k++) {
      const [s0, s1] = segs[k];
      if (s1 <= s0) continue;
      let minSum = 0;
      for (let i = s0; i < s1; i++) minSum += list[i].min;
      if (minSum > qAreas[k]) {
        feasible = false;
        break;
      }
    }
    if (!feasible) {
      split(from, to, r);
      return;
    }

    for (let k = 0; k < 4; k++) {
      const [s0, s1] = segs[k];
      if (s1 <= s0) continue;
      const q = quads[k];
      layoutHilbertPath(s0, s1, {
        r0: r.r0 + q.r0,
        c0: r.c0 + q.c0,
        r1: r.r0 + q.r1,
        c1: r.c0 + q.c1,
      });
    }
  }

  if (layoutMode === "hilbertPath" && positionOf && list.length > 1) {
    layoutHilbertPath(0, list.length, rect);
  } else {
    split(0, list.length, rect);
  }
  return result; // Map<id, rect>
}

/** Cell area of a rect. */
export function rectArea(r) {
  return (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
}
