/**
 * Force Simulation for Dorling Cartograms
 * Implements force-directed layout to eliminate overlapping shapes
 */

function createSeededRandom(seed = null) {
    if (seed === null || seed === undefined || seed === '') {
        return Math.random;
    }

    let s = Number(seed);
    if (!Number.isFinite(s)) {
        s = 1;
    }
    s = (s >>> 0) || 1;

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
 * @returns {void} Modifies nodes in place
 */
export function applyPairwiseRepulsion(nodes, strength = 1.0, rng = Math.random) {
    const n = nodes.length;
    
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];
            
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Minimum distance to avoid overlap
            const minDist = nodeA.radius + nodeB.radius;
            
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
                const moveA = (overlap * massB / totalMass) * strength;
                const moveB = (overlap * massA / totalMass) * strength;
                
                nodeA.x -= nx * moveA;
                nodeA.y -= ny * moveA;
                nodeB.x += nx * moveB;
                nodeB.y += ny * moveB;
            } else if (distance === 0 && minDist > 0) {
                const dir = randomUnitVector(rng);
                const push = (minDist * 0.5) * strength;
                nodeA.x -= dir.x * push;
                nodeA.y -= dir.y * push;
                nodeB.x += dir.x * push;
                nodeB.y += dir.y * push;
            }
        }
    }
}

/**
 * Apply rectangular pair-wise repulsion for squares/rectangles
 * @param {Array} nodes - Array of node objects with x, y, width, height properties
 * @param {number} strength - Repulsion strength (0-1)
 * @returns {void} Modifies nodes in place
 */
export function applyRectangularRepulsion(nodes, strength = 1.0, rng = Math.random) {
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
            const overlapX = (halfWidthA + halfWidthB) - Math.abs(dx);
            const overlapY = (halfHeightA + halfHeightB) - Math.abs(dy);
            
            if (overlapX > 0 && overlapY > 0) {
                // Calculate mass ratio
                const massA = nodeA.width * nodeA.height;
                const massB = nodeB.width * nodeB.height;
                const totalMass = massA + massB;
                
                // Push apart along the axis of minimum overlap
                if (overlapX < overlapY) {
                    const sign = dx >= 0 ? 1 : -1;
                    const moveA = (overlapX * massB / totalMass) * strength;
                    const moveB = (overlapX * massA / totalMass) * strength;
                    nodeA.x -= sign * moveA;
                    nodeB.x += sign * moveB;
                } else {
                    const sign = dy >= 0 ? 1 : -1;
                    const moveA = (overlapY * massB / totalMass) * strength;
                    const moveB = (overlapY * massA / totalMass) * strength;
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
        shapeType = 'circle',
        repulsionStrength = 1.0,
        anchorStrength = 0.02,
        adjacencyStrength = 0.05,
        edges = [],
        coolingFactor = 0.998,  // Slow cooling
        minRepulsion = 0.5,     // Higher minimum repulsion
        seed = null,
        initialJitter = 0,
        onProgress = null
    } = options;

    const rng = createSeededRandom(seed);
    
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
            if (shapeType === 'circle' || shapeType === 'hexagon') {
                applyPairwiseRepulsion(nodes, currentRepulsion, rng);
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
        if (shapeType === 'circle' || shapeType === 'hexagon') {
            applyPairwiseRepulsion(nodes, 1.0, rng);
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
export function hasOverlaps(nodes, shapeType = 'circle') {
    const n = nodes.length;
    
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];
            
            if (shapeType === 'circle' || shapeType === 'hexagon') {
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDist = nodeA.radius + nodeB.radius;
                
                if (distance < minDist * 0.99) { // 1% tolerance
                    return true;
                }
            } else {
                const overlapX = (nodeA.width/2 + nodeB.width/2) - Math.abs(nodeB.x - nodeA.x);
                const overlapY = (nodeA.height/2 + nodeB.height/2) - Math.abs(nodeB.y - nodeA.y);
                
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
export function getOverlapRatio(nodes, shapeType = 'circle') {
    const n = nodes.length;
    if (n < 2) return 0;

    let overlaps = 0;
    const totalPairs = (n * (n - 1)) / 2;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];

            if (shapeType === 'circle' || shapeType === 'hexagon') {
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDist = nodeA.radius + nodeB.radius;
                if (distance < minDist * 0.99) overlaps++;
            } else {
                const overlapX = (nodeA.width / 2 + nodeB.width / 2) - Math.abs(nodeB.x - nodeA.x);
                const overlapY = (nodeA.height / 2 + nodeB.height / 2) - Math.abs(nodeB.y - nodeA.y);
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
        anchor = 0.002
    } = options;

    const overlapsBefore = hasOverlaps(nodes, 'rectangle');
    if (!overlapsBefore) {
        return {
            iterations: 0,
            movedPairs: 0,
            overlapsBefore: false,
            overlapsAfter: false
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
                const overlapX = (halfWidthA + halfWidthB) - Math.abs(dx);
                const overlapY = (halfHeightA + halfHeightB) - Math.abs(dy);

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

        if (movedThisIter === 0 || !hasOverlaps(nodes, 'rectangle')) {
            break;
        }
    }

    return {
        iterations: iter + 1,
        movedPairs,
        overlapsBefore: overlapsBefore,
        overlapsAfter: hasOverlaps(nodes, 'rectangle')
    };
}
