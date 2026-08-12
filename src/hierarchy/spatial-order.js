/**
 * Spatial Ordering
 * Orders items by their geographic position so treemap layouts retain
 * relative geography, using a Hilbert space-filling curve (the recipe behind
 * "spatially ordered treemaps", cf. Wood & Dykes 2008).
 *
 * Hilbert order maps nearby 2D points to nearby list positions, so splitting a
 * geo-ordered list yields spatially contiguous halves.
 */

/**
 * Hilbert curve index for integer coordinates (x, y) in [0, 2^bits).
 * Standard xy2d algorithm.
 *
 * @param {number} x - Integer coordinate, 0 <= x < 2^bits.
 * @param {number} y - Integer coordinate, 0 <= y < 2^bits.
 * @param {number} [bits] - Curve resolution (default 16).
 * @returns {number} Hilbert distance.
 */
export function hilbertIndex(x, y, bits = 16) {
  let d = 0;
  let s = 1 << (bits - 1);
  while (s > 0) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const t = x;
      x = y;
      y = t;
    }
    s >>= 1;
  }
  return d;
}

/**
 * Return indices of `items` sorted by the Hilbert key of their positions.
 * Deterministic: ties are broken by original index.
 *
 * @param {Array} items - Items to order.
 * @param {Function} positionOf - (item) => [x, y] geographic position.
 * @param {number} [bits] - Hilbert curve resolution.
 * @returns {Array} Array of indices into `items`, sorted by spatial key.
 */
export function orderByHilbert(items, positionOf, bits = 16) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const positions = items.map((n) => {
    const [x, y] = positionOf(n);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return [x, y];
  });
  const spanX = Math.max(1e-12, maxX - minX);
  const spanY = Math.max(1e-12, maxY - minY);
  const range = (1 << bits) - 1;
  return positions
    .map(([x, y], i) => {
      const nx = Math.round(((x - minX) / spanX) * range);
      const ny = Math.round(((y - minY) / spanY) * range);
      return { i, k: hilbertIndex(nx, ny, bits) };
    })
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((o) => o.i);
}

/**
 * Morton (Z-order) index for integer coordinates (x, y) in [0, 2^bits).
 * Interleaves the bits of x and y. Unlike Hilbert it has no rotation step, so
 * its quadrant structure aligns cleanly with guillotine (binary-split) cuts.
 *
 * @param {number} x - Integer coordinate, 0 <= x < 2^bits.
 * @param {number} y - Integer coordinate, 0 <= y < 2^bits.
 * @param {number} [bits] - Resolution (default 16).
 * @returns {number} Morton distance.
 */
export function mortonIndex(x, y, bits = 16) {
  let z = 0;
  for (let i = 0; i < bits; i++) {
    z |= ((x >> i) & 1) << (2 * i);
    z |= ((y >> i) & 1) << (2 * i + 1);
  }
  return z;
}

/**
 * Return indices of `items` sorted by the Morton (Z-order) key of their
 * positions. Deterministic: ties are broken by original index.
 */
export function orderByMorton(items, positionOf, bits = 16) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const positions = items.map((n) => {
    const [x, y] = positionOf(n);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return [x, y];
  });
  const spanX = Math.max(1e-12, maxX - minX);
  const spanY = Math.max(1e-12, maxY - minY);
  const range = (1 << bits) - 1;
  return positions
    .map(([x, y], i) => {
      const nx = Math.round(((x - minX) / spanX) * range);
      const ny = Math.round(((y - minY) / spanY) * range);
      return { i, k: mortonIndex(nx, ny, bits) };
    })
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((o) => o.i);
}
