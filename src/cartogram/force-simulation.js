/**
 * Force Simulation for Dorling Cartograms
 * Implements force-directed layout to eliminate overlapping shapes
 */

/**
 * Apply pair-wise repulsion forces to eliminate overlaps
 * Uses simple O(n²) algorithm - suitable for < 500 nodes
 * @param {Array} nodes - Array of node objects with x, y, radius properties
 * @param {number} strength - Repulsion strength (0-1)
 * @returns {void} Modifies nodes in place
 */
export function applyPairwiseRepulsion(nodes, strength = 1.0) {
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
export function applyRectangularRepulsion(nodes, strength = 1.0) {
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
        onProgress = null
    } = options;
    
    let currentRepulsion = repulsionStrength;
    
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
                applyPairwiseRepulsion(nodes, currentRepulsion);
            } else {
                applyRectangularRepulsion(nodes, currentRepulsion);
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
            applyPairwiseRepulsion(nodes, 1.0);
        } else {
            applyRectangularRepulsion(nodes, 1.0);
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
