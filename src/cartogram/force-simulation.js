/**
 * Force Simulation for Dorling Cartograms
 * Implements force-directed layout to eliminate overlapping shapes
 */

function createSeededRandom(seed = null) {
  if (seed === null || seed === undefined || seed === "") {
    return Math.random;
  }

  let s = Number(seed);
  if (!Number.isFinite(s)) {
    s = 1;
  }
  s = s >>> 0 || 1;

  return function seeded() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomUnitVector(rng) {
  const angle = (rng() * 2 - 1) * Math.PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Apply pair-wise repulsion forces to eliminate overlaps
 * Uses simple O(n²) algorithm - suitable for < 500 nodes
 * @param {Array} nodes - Array of node objects with x, y, radius properties
 * @param {number} strength - Repulsion strength (0-1)
 * @param {Function} [rng] - Random number generator
 * @param {Object} [options]
 * @param {Function} [options.islandOf] - (node) => island key. When provided
 *   with islandGap > 0, nodes from different islands are pushed apart to keep
 *   a visible sea gap between them (archipelago preservation).
 * @param {number} [options.islandGap] - Fractional extra separation between
 *   different islands (e.g. 0.25 → min distance * 1.25). Default 0.
 * @returns {void} Modifies nodes in place
 */
export function applyPairwiseRepulsion(
  nodes,
  strength = 1.0,
  rng = Math.random,
  options = {},
) {
  const { islandOf = null, islandGap = 0 } = options;
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Minimum distance to avoid overlap (extra gap between islands)
      let minDist = nodeA.radius + nodeB.radius;
      if (islandOf && islandGap > 0 && islandOf(nodeA) !== islandOf(nodeB)) {
        minDist *= 1 + islandGap;
      }

      if (distance < minDist && distance > 0) {
        // Calculate overlap
        const overlap = minDist - distance;

        // Normalize direction
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate mass ratio for weighted movement
        const massA = nodeA.radius * nodeA.radius;
        const massB = nodeB.radius * nodeB.radius;
        const totalMass = massA + massB;

        // Move nodes apart proportionally to their mass
        const moveA = ((overlap * massB) / totalMass) * strength;
        const moveB = ((overlap * massA) / totalMass) * strength;

        nodeA.x -= nx * moveA;
        nodeA.y -= ny * moveA;
        nodeB.x += nx * moveB;
        nodeB.y += ny * moveB;
      } else if (distance === 0 && minDist > 0) {
        const dir = randomUnitVector(rng);
        const push = minDist * 0.5 * strength;
        nodeA.x -= dir.x * push;
        nodeA.y -= dir.y * push;
        nodeB.x += dir.x * push;
        nodeB.y += dir.y * push;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Barnes-Hut style quadtree acceleration
//
// The overlap interaction is strictly LOCAL (only pairs within r_i + r_j are
// pushed apart), so we use a quadtree purely for PRUNING: any subtree whose
// bounding circle cannot reach a node is skipped entirely. Per-pair pushes are
// computed exactly, so results match the O(n²) pairwise pass while cost drops
// to ~O(n log n). Deterministic (same tree, same pair order).
// ---------------------------------------------------------------------------

const BH_LEAF_CAP = 32;

function bhBounds(nodes) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const nd of nodes) {
    if (nd.x < minX) minX = nd.x;
    if (nd.x > maxX) maxX = nd.x;
    if (nd.y < minY) minY = nd.y;
    if (nd.y > maxY) maxY = nd.y;
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 1e-6 + 1e-9;
  return { x0: minX - pad, y0: minY - pad, x1: maxX + pad, y1: maxY + pad };
}

function bhInsert(cell, idx, nodes, radii) {
  if (cell.children) {
    const mx = (cell.x0 + cell.x1) / 2;
    const my = (cell.y0 + cell.y1) / 2;
    const q = (nodes[idx].x < mx ? 0 : 1) + (nodes[idx].y < my ? 0 : 2);
    bhInsert(cell.children[q], idx, nodes, radii);
  } else {
    cell.leaves = cell.leaves || [];
    cell.leaves.push(idx);
    if (cell.leaves.length > BH_LEAF_CAP && cell.x1 - cell.x0 > 1e-12) {
      const mx = (cell.x0 + cell.x1) / 2;
      const my = (cell.y0 + cell.y1) / 2;
      cell.children = [
        { x0: cell.x0, y0: cell.y0, x1: mx, y1: my },
        { x0: mx, y0: cell.y0, x1: cell.x1, y1: my },
        { x0: cell.x0, y0: my, x1: mx, y1: cell.y1 },
        { x0: mx, y0: my, x1: cell.x1, y1: cell.y1 },
      ].map((q) => ({
        ...q,
        count: 0,
        leaves: null,
        children: null,
        cx: 0,
        cy: 0,
        br: 0,
        maxR: 0,
      }));
      const old = cell.leaves;
      cell.leaves = null;
      for (const j of old) bhInsert(cell, j, nodes, radii);
      bhInsert(cell, idx, nodes, radii);
    }
  }
}

function bhStats(cell, nodes, radii) {
  if (cell.children) {
    let sx = 0,
      sy = 0,
      cnt = 0;
    for (const c of cell.children) {
      bhStats(c, nodes, radii);
      sx += c.cx * c.count;
      sy += c.cy * c.count;
      cnt += c.count;
    }
    cell.count = cnt;
    cell.cx = cnt ? sx / cnt : 0;
    cell.cy = cnt ? sy / cnt : 0;
    let br = 0;
    let maxR = 0;
    for (const c of cell.children) {
      if (!c.count) continue;
      br = Math.max(br, Math.hypot(c.cx - cell.cx, c.cy - cell.cy) + c.br);
      maxR = Math.max(maxR, c.maxR);
    }
    cell.br = br;
    cell.maxR = maxR;
  } else {
    const L = cell.leaves || [];
    cell.count = L.length;
    let sx = 0,
      sy = 0,
      maxR = 0;
    for (const j of L) {
      sx += nodes[j].x;
      sy += nodes[j].y;
      maxR = Math.max(maxR, radii[j]);
    }
    cell.cx = L.length ? sx / L.length : 0;
    cell.cy = L.length ? sy / L.length : 0;
    let br = 0;
    for (const j of L) {
      br = Math.max(
        br,
        Math.hypot(nodes[j].x - cell.cx, nodes[j].y - cell.cy) + radii[j],
      );
    }
    cell.br = br;
    cell.maxR = maxR;
  }
}

function bhBuild(nodes, radii) {
  const root = {
    ...bhBounds(nodes),
    count: 0,
    leaves: null,
    children: null,
    cx: 0,
    cy: 0,
    br: 0,
    maxR: 0,
  };
  for (let i = 0; i < nodes.length; i++) bhInsert(root, i, nodes, radii);
  bhStats(root, nodes, radii);
  return root;
}

/**
 * Visit every potentially-overlapping pair (i, j) with j > i, deterministically.
 * `fn(i, j)` is called for candidate pairs; callers re-check the exact distance
 * (the quadtree only prunes provably non-overlapping subtrees). Return true from
 * `fn` to stop early (used by the boolean overlap check).
 * @param {number} islandGap - fractional gap; prunes slightly less aggressively
 *   so cross-island gaps are also resolved.
 */
function bhWalk(nodes, radii, islandGap, fn) {
  const root = bhBuild(nodes, radii);
  const gapFactor = 1 + (islandGap > 0 ? islandGap : 0);
  let stop = false;
  const visit = (cell, i) => {
    if (stop) return;
    if (cell.children) {
      const nd = nodes[i];
      const d = Math.hypot(cell.cx - nd.x, cell.cy - nd.y);
      // Safe prune: node i's circle (radius, inflated by the island gap) must
      // not reach the cell's bounding circle (cell.br covers every node's
      // position + radius). Never skips a cell that could contain an overlap.
      if (d > (nd.radius + cell.br) * gapFactor) return;
      for (const c of cell.children) visit(c, i);
    } else {
      const L = cell.leaves;
      if (!L) return;
      for (const j of L) {
        if (j > i && fn(i, j)) {
          stop = true;
          return;
        }
      }
    }
  };
  for (let i = 0; i < nodes.length && !stop; i++) visit(root, i);
}

/**
 * Quadtree-accelerated overlap repulsion for circles/hexagons.
 * Same push semantics as applyPairwiseRepulsion, O(n log n) expected.
 * @param {Array} nodes - Node objects with x, y, radius.
 * @param {number} strength
 * @param {Function} [rng]
 * @param {Object} [options] - { islandOf, islandGap } (same as pairwise).
 * @returns {void} Modifies nodes in place.
 */
export function applyBarnesHutRepulsion(
  nodes,
  strength = 1.0,
  rng = Math.random,
  options = {},
) {
  const { islandOf = null, islandGap = 0 } = options;
  const radii = nodes.map((nd) => nd.radius);
  bhWalk(nodes, radii, islandGap, (i, j) => {
    const nodeA = nodes[i];
    const nodeB = nodes[j];
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let minDist = nodeA.radius + nodeB.radius;
    if (islandOf && islandGap > 0 && islandOf(nodeA) !== islandOf(nodeB)) {
      minDist *= 1 + islandGap;
    }
    if (distance < minDist && distance > 0) {
      const overlap = minDist - distance;
      const nx = dx / distance;
      const ny = dy / distance;
      const massA = nodeA.radius * nodeA.radius;
      const massB = nodeB.radius * nodeB.radius;
      const totalMass = massA + massB;
      const moveA = ((overlap * massB) / totalMass) * strength;
      const moveB = ((overlap * massA) / totalMass) * strength;
      nodeA.x -= nx * moveA;
      nodeA.y -= ny * moveA;
      nodeB.x += nx * moveB;
      nodeB.y += ny * moveB;
    } else if (distance === 0 && minDist > 0) {
      const dir = randomUnitVector(rng);
      const push = minDist * 0.5 * strength;
      nodeA.x -= dir.x * push;
      nodeA.y -= dir.y * push;
      nodeB.x += dir.x * push;
      nodeB.y += dir.y * push;
    }
    return false;
  });
}

/**
 * Fast overlap existence check (quadtree-pruned, exact) for circles/hexagons.
 * Falls back to the O(n²) check for rectangles.
 * @returns {boolean}
 */
export function hasOverlapsFast(nodes, shapeType = "circle") {
  if (nodes.length < 2) return false;
  if (shapeType === "circle" || shapeType === "hexagon") {
    const radii = nodes.map((nd) => nd.radius);
    let found = false;
    bhWalk(nodes, radii, 0, (i, j) => {
      const ndA = nodes[i];
      const ndB = nodes[j];
      if (
        Math.hypot(ndB.x - ndA.x, ndB.y - ndA.y) <
        (ndA.radius + ndB.radius) * 0.99
      ) {
        found = true;
        return true;
      }
      return false;
    });
    return found;
  }
  return hasOverlaps(nodes, shapeType);
}

/**
 * Apply rectangular pair-wise repulsion for squares/rectangles
 * @param {Array} nodes - Array of node objects with x, y, width, height properties
 * @param {number} strength - Repulsion strength (0-1)
 * @returns {void} Modifies nodes in place
 */
export function applyRectangularRepulsion(
  nodes,
  strength = 1.0,
  rng = Math.random,
) {
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      // Calculate half-sizes
      const halfWidthA = nodeA.width / 2;
      const halfHeightA = nodeA.height / 2;
      const halfWidthB = nodeB.width / 2;
      const halfHeightB = nodeB.height / 2;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;

      // Check for overlap
      const overlapX = halfWidthA + halfWidthB - Math.abs(dx);
      const overlapY = halfHeightA + halfHeightB - Math.abs(dy);

      if (overlapX > 0 && overlapY > 0) {
        // Calculate mass ratio
        const massA = nodeA.width * nodeA.height;
        const massB = nodeB.width * nodeB.height;
        const totalMass = massA + massB;

        // Push apart along the axis of minimum overlap
        if (overlapX < overlapY) {
          const sign = dx >= 0 ? 1 : -1;
          const moveA = ((overlapX * massB) / totalMass) * strength;
          const moveB = ((overlapX * massA) / totalMass) * strength;
          nodeA.x -= sign * moveA;
          nodeB.x += sign * moveB;
        } else {
          const sign = dy >= 0 ? 1 : -1;
          const moveA = ((overlapY * massB) / totalMass) * strength;
          const moveB = ((overlapY * massA) / totalMass) * strength;
          nodeA.y -= sign * moveA;
          nodeB.y += sign * moveB;
        }
      } else if (dx === 0 && dy === 0) {
        const dir = randomUnitVector(rng);
        nodeA.x -= dir.x * 0.001 * strength;
        nodeA.y -= dir.y * 0.001 * strength;
        nodeB.x += dir.x * 0.001 * strength;
        nodeB.y += dir.y * 0.001 * strength;
      }
    }
  }
}

/**
 * Apply position anchoring force to pull nodes toward original positions
 * @param {Array} nodes - Array of node objects with x, y, originalX, originalY properties
 * @param {number} strength - Anchor strength (0-1), lower = weaker pull
 * @returns {void} Modifies nodes in place
 */
export function applyPositionAnchor(nodes, strength = 0.1) {
  for (const node of nodes) {
    const dx = node.originalX - node.x;
    const dy = node.originalY - node.y;

    node.x += dx * strength;
    node.y += dy * strength;
  }
}

/**
 * Apply adjacency attraction force to keep neighbors close
 * @param {Array} nodes - Array of node objects
 * @param {Array} edges - Array of [sourceIndex, targetIndex] pairs
 * @param {number} strength - Attraction strength (0-1)
 * @returns {void} Modifies nodes in place
 */
export function applyAdjacencyAttraction(nodes, edges, strength = 0.05) {
  for (const [sourceIdx, targetIdx] of edges) {
    const nodeA = nodes[sourceIdx];
    const nodeB = nodes[targetIdx];

    if (!nodeA || !nodeB) continue;

    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Target distance is sum of radii (touching)
    const targetDist = nodeA.radius + nodeB.radius;

    if (distance > targetDist) {
      // Pull together
      const pull = (distance - targetDist) * strength;
      const nx = dx / distance;
      const ny = dy / distance;

      // Equal pull for adjacent regions
      nodeA.x += nx * pull * 0.5;
      nodeA.y += ny * pull * 0.5;
      nodeB.x -= nx * pull * 0.5;
      nodeB.y -= ny * pull * 0.5;
    }
  }
}

/**
 * Run the full force simulation
 * @param {Array} nodes - Array of node objects
 * @param {Object} options - Simulation options
 * @returns {Array} The nodes array after simulation
 */
export function runForceSimulation(nodes, options = {}) {
  const {
    iterations = 1000,
    shapeType = "circle",
    repulsionStrength = 1.0,
    anchorStrength = 0.02,
    adjacencyStrength = 0.05,
    edges = [],
    coolingFactor = 0.998, // Slow cooling
    minRepulsion = 0.5, // Higher minimum repulsion
    seed = null,
    initialJitter = 0,
    islandOf = null, // (node) => island key (archipelago separation)
    islandGap = 0, // fractional gap between different islands
    method = "auto", // 'auto' | 'pairwise' | 'barneshut'
    onProgress = null,
  } = options;

  const rng = createSeededRandom(seed);
  const repulseOpts = { islandOf, islandGap };
  // Quadtree (Barnes-Hut) repulsion for large sets; exact pairwise otherwise.
  const useBH =
    method === "barneshut" || (method === "auto" && nodes.length > 1500);

  let currentRepulsion = repulsionStrength;

  if (initialJitter > 0) {
    for (const node of nodes) {
      const jx = (rng() * 2 - 1) * initialJitter;
      const jy = (rng() * 2 - 1) * initialJitter;
      node.x += jx;
      node.y += jy;
    }
  }

  // Main simulation loop
  for (let i = 0; i < iterations; i++) {
    // Decrease anchor strength early, increase later
    // This allows spreading first, then gentle pull-back
    const progress = i / iterations;
    const dynamicAnchor = anchorStrength * Math.pow(progress, 2);

    // Apply repulsion multiple times per iteration to overcome anchor
    const repulsionPasses = hasOverlaps(nodes, shapeType) ? 3 : 1;
    for (let pass = 0; pass < repulsionPasses; pass++) {
      if (shapeType === "circle" || shapeType === "hexagon") {
        if (useBH)
          applyBarnesHutRepulsion(nodes, currentRepulsion, rng, repulseOpts);
        else applyPairwiseRepulsion(nodes, currentRepulsion, rng, repulseOpts);
      } else {
        applyRectangularRepulsion(nodes, currentRepulsion, rng);
      }
    }

    // Apply adjacency attraction if edges provided
    if (edges.length > 0) {
      applyAdjacencyAttraction(nodes, edges, adjacencyStrength);
    }

    // Apply position anchoring (with dynamic strength)
    applyPositionAnchor(nodes, dynamicAnchor);

    // Cooling: reduce repulsion strength over time, but keep minimum
    currentRepulsion = Math.max(currentRepulsion * coolingFactor, minRepulsion);

    // Progress callback
    if (onProgress && i % 100 === 0) {
      onProgress(i / iterations);
    }
  }

  // Final cleanup pass: run pure repulsion without anchoring to resolve remaining overlaps
  const cleanupIterations = Math.min(500, iterations / 2);
  for (let i = 0; i < cleanupIterations && hasOverlaps(nodes, shapeType); i++) {
    if (shapeType === "circle" || shapeType === "hexagon") {
      if (useBH) applyBarnesHutRepulsion(nodes, 1.0, rng, repulseOpts);
      else applyPairwiseRepulsion(nodes, 1.0, rng, repulseOpts);
    } else {
      applyRectangularRepulsion(nodes, 1.0, rng);
    }
  }

  return nodes;
}

/**
 * Check if any nodes are still overlapping
 * @param {Array} nodes - Array of node objects
 * @param {string} shapeType - 'circle' | 'hexagon' | 'rectangle'
 * @returns {boolean} True if overlaps exist
 */
export function hasOverlaps(nodes, shapeType = "circle") {
  const n = nodes.length;

  // Fast, exact quadtree-pruned check for large circle/hexagon sets.
  if ((shapeType === "circle" || shapeType === "hexagon") && n > 200) {
    return hasOverlapsFast(nodes, shapeType);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      if (shapeType === "circle" || shapeType === "hexagon") {
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDist = nodeA.radius + nodeB.radius;

        if (distance < minDist * 0.99) {
          // 1% tolerance
          return true;
        }
      } else {
        const overlapX =
          nodeA.width / 2 + nodeB.width / 2 - Math.abs(nodeB.x - nodeA.x);
        const overlapY =
          nodeA.height / 2 + nodeB.height / 2 - Math.abs(nodeB.y - nodeA.y);

        if (overlapX > 0.01 && overlapY > 0.01) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Ratio of overlapping pairs to all pairs.
 * @param {Array} nodes - Array of node objects
 * @param {string} shapeType - 'circle' | 'hexagon' | 'rectangle'
 * @returns {number} Overlap ratio in [0,1]
 */
export function getOverlapRatio(nodes, shapeType = "circle") {
  const n = nodes.length;
  if (n < 2) return 0;

  let overlaps = 0;
  const totalPairs = (n * (n - 1)) / 2;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      if (shapeType === "circle" || shapeType === "hexagon") {
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDist = nodeA.radius + nodeB.radius;
        if (distance < minDist * 0.99) overlaps++;
      } else {
        const overlapX =
          nodeA.width / 2 + nodeB.width / 2 - Math.abs(nodeB.x - nodeA.x);
        const overlapY =
          nodeA.height / 2 + nodeB.height / 2 - Math.abs(nodeB.y - nodeA.y);
        if (overlapX > 0.01 && overlapY > 0.01) overlaps++;
      }
    }
  }

  return overlaps / totalPairs;
}

/**
 * Deterministic final-pass overlap resolver for rectangular/square nodes.
 * Prioritizes removing overlaps over strict position preservation.
 * @param {Array} nodes - Array of rectangular node objects
 * @param {Object} options - Resolver options
 * @returns {Object} Diagnostics about the resolver run
 */
export function resolveRectangularOverlapsStrict(nodes, options = {}) {
  const {
    maxIterations = 2500,
    epsilon = 1e-4,
    gap = 1e-4,
    anchor = 0.002,
  } = options;

  const overlapsBefore = hasOverlaps(nodes, "rectangle");
  if (!overlapsBefore) {
    return {
      iterations: 0,
      movedPairs: 0,
      overlapsBefore: false,
      overlapsAfter: false,
    };
  }

  let movedPairs = 0;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    let movedThisIter = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const halfWidthA = a.width / 2;
        const halfHeightA = a.height / 2;
        const halfWidthB = b.width / 2;
        const halfHeightB = b.height / 2;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = halfWidthA + halfWidthB - Math.abs(dx);
        const overlapY = halfHeightA + halfHeightB - Math.abs(dy);

        if (overlapX > epsilon && overlapY > epsilon) {
          const areaA = Math.max(epsilon, a.width * a.height);
          const areaB = Math.max(epsilon, b.width * b.height);
          const total = areaA + areaB;
          const pushA = areaB / total;
          const pushB = areaA / total;

          if (overlapX <= overlapY) {
            const sign = dx >= 0 ? 1 : -1;
            const delta = overlapX + gap;
            a.x -= sign * delta * pushA;
            b.x += sign * delta * pushB;
          } else {
            const sign = dy >= 0 ? 1 : -1;
            const delta = overlapY + gap;
            a.y -= sign * delta * pushA;
            b.y += sign * delta * pushB;
          }

          movedPairs++;
          movedThisIter++;
        }
      }
    }

    // Gentle return toward original positions once pair collisions are reduced.
    if (anchor > 0) {
      for (const n of nodes) {
        n.x += (n.originalX - n.x) * anchor;
        n.y += (n.originalY - n.y) * anchor;
      }
    }

    if (movedThisIter === 0 || !hasOverlaps(nodes, "rectangle")) {
      break;
    }
  }

  return {
    iterations: iter + 1,
    movedPairs,
    overlapsBefore: overlapsBefore,
    overlapsAfter: hasOverlaps(nodes, "rectangle"),
  };
}
