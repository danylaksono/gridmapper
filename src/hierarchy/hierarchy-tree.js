/**
 * Hierarchy Tree
 * Builds a parent → children tree from flat GeoJSON features using
 * per-level parent-code accessors (coarse → fine).
 *
 * Example (Indonesia):
 *   levels = ['provinsi_code', 'kab_kota_code', 'kecamatan_code']
 *   leaves  = kel_desa features (each carries provinsi/kab_kota/kecamatan codes)
 *   Result  = array of provinsi root nodes, with nested kabupaten/kecamatan
 */

/**
 * Build the hierarchy tree from the finest-level features.
 *
 * @param {Array} leafFeatures - Features of the finest level (e.g. villages).
 * @param {Object} options
 * @param {Function} [options.idAccessor] - (feature) => unique id, default d.code
 * @param {Array} [options.levels] - Parent-code property names, coarse → fine.
 * @param {Function} [options.coordsOf] - (feature) => [x, y] centroid.
 * @param {Function} [options.weightOf] - (feature) => leaf weight, default 1.
 * @returns {Array} Array of root nodes. Each node:
 *   { id, level, item, centroid: [x,y], weight, leafCount, children, parentKey, parentNode }
 */
export function buildHierarchy(leafFeatures, options = {}) {
  const {
    idAccessor = (d) => d.code,
    levels = [],
    coordsOf = (d) => [d.x, d.y],
    weightOf = () => 1,
  } = options;

  if (levels.length === 0) {
    throw new Error("buildHierarchy: at least one level key is required");
  }

  // Leaf (finest level) nodes
  let current = leafFeatures.map((item, i) => ({
    id: String(idAccessor(item) ?? `leaf_${i}`),
    level: levels.length,
    item,
    centroid: coordsOf(item),
    weight: weightOf(item),
    leafCount: 1,
    children: [],
    parentKey: null,
    parentNode: null,
  }));

  // Group bottom-up: from the finest parent key up to the coarsest
  for (let lvl = levels.length - 1; lvl >= 0; lvl--) {
    const key = levels[lvl];
    const groups = new Map();
    for (const node of current) {
      const pid = node.item[key];
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(node);
    }
    const parents = [];
    for (const [pid, children] of groups) {
      const cx =
        children.reduce((s, c) => s + c.centroid[0], 0) / children.length;
      const cy =
        children.reduce((s, c) => s + c.centroid[1], 0) / children.length;
      const parent = {
        id: String(pid),
        level: lvl,
        item: children[0].item, // representative feature carrying this parent id
        centroid: [cx, cy],
        weight: children.reduce((s, c) => s + c.weight, 0),
        leafCount: children.reduce((s, c) => s + c.leafCount, 0),
        children,
        parentKey: key,
        parentNode: null,
      };
      for (const c of children) c.parentNode = parent;
      parents.push(parent);
    }
    current = parents;
  }

  return current; // array of root nodes (coarsest level)
}

/** Number of finest-level features under a node. */
export function subtreeLeafCount(node) {
  return node.leafCount;
}

/** Collect all leaf (finest-level) nodes in the forest. */
export function flattenLeaves(nodes) {
  const out = [];
  const walk = (n) => {
    if (n.children.length === 0) {
      out.push(n);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}
