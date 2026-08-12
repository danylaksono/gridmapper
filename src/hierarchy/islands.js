/**
 * Island Detection
 * Groups geographic nodes into "islands" so archipelagos can keep visual
 * separation (sea gaps) in cartogram layouts.
 *
 * Two modes:
 *   - explicit: pass `islandAccessor` (e.g. feature property that names the
 *     island / landmass) for accurate grouping.
 *   - automatic: union-find over nodes whose geodesic distance is below
 *     `seaGapKm` (a water-gap threshold). Points closer than `seaGapKm` are
 *     considered the same landmass; everything else is a separate island.
 *
 * Automatic detection uses spatial binning (O(n)) and is a heuristic — narrow
 * straits (e.g. Bali–Java ~2.5 km) will merge unless seaGapKm is small or an
 * explicit islandAccessor is supplied.
 */

/**
 * @param {Array} nodes - Nodes with a position (see positionOf).
 * @param {Object} [options]
 * @param {Function} [options.positionOf] - (node) => [lon, lat]. Default uses
 *   node.centroid, else node.x/node.y.
 * @param {Function} [options.islandAccessor] - (node) => island id. When given,
 *   detection is skipped and ids come straight from this.
 * @param {number} [options.seaGapKm] - Water-gap threshold in km (default 30).
 * @returns {{ ids: Array, groups: Map }} ids: islandId per node; groups:
 *   Map islandId -> [nodeIndex, ...].
 */
export function detectIslands(nodes, options = {}) {
  const {
    positionOf = (n) => n.centroid ?? [n.x, n.y],
    islandAccessor = null,
    seaGapKm = 30,
  } = options;

  if (islandAccessor) {
    const ids = nodes.map((n) => String(islandAccessor(n)));
    return { ids, groups: groupIndices(ids) };
  }

  const n = nodes.length;
  const positions = nodes.map((x) => positionOf(x));

  // Union-find
  const parent = nodes.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  // Spatial binning to keep neighbor checks near-linear.
  const degPerKm = 1 / 111.32; // approx degrees per km (lat)
  const cellDeg = Math.max(seaGapKm * degPerKm, 1e-6);
  const bins = new Map();
  const key = (ix, iy) => `${ix}_${iy}`;
  const cellOf = (x, y) => [Math.floor(x / cellDeg), Math.floor(y / cellDeg)];
  positions.forEach(([x, y], i) => {
    const [ix, iy] = cellOf(x, y);
    if (!bins.has(key(ix, iy))) bins.set(key(ix, iy), []);
    bins.get(key(ix, iy)).push(i);
  });

  const distKm = (i, j) => {
    const [x1, y1] = positions[i];
    const [x2, y2] = positions[j];
    const midLat = ((y1 + y2) / 2) * (Math.PI / 180);
    const dLat = (y2 - y1) * 111.32;
    const dLon = (x2 - x1) * 111.32 * Math.cos(midLat);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  };

  for (const [, ids] of bins) {
    for (const i of ids) {
      const [x, y] = positions[i];
      const [ix, iy] = cellOf(x, y);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nb = bins.get(key(ix + dx, iy + dy));
          if (!nb) continue;
          for (const j of nb) {
            if (j <= i) continue;
            if (distKm(i, j) <= seaGapKm) union(i, j);
          }
        }
      }
    }
  }

  const rootToId = new Map();
  const ids = new Array(n);
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!rootToId.has(root)) rootToId.set(root, rootToId.size);
    ids[i] = rootToId.get(root);
  }

  return { ids, groups: groupIndices(ids) };
}

function groupIndices(ids) {
  const groups = new Map();
  ids.forEach((id, i) => {
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(i);
  });
  return groups;
}
