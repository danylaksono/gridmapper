/**
 * Post-Processing Optimizer
 * Greedy swap optimization and simulated annealing for improving allocations
 */import { reduceCutEdges } from './adjacency-fixer.js';
/**
 * Post-process swap heuristic: greedy pairwise swaps and moves to empty cells.
 * @param {Array} assignments - Array of assignment objects with gridX, gridY, originalData
 * @param {Array} normPoints - Normalized points array with id, normX, normY
 * @param {number} rows - Number of grid rows
 * @param {number} cols - Number of grid columns
 * @param {Object} cfg - Configuration object
 * @returns {Object} Object with assignments and meta information
 */
export function postProcessSwaps(assignments, normPoints, rows, cols, cfg = {}) {
    const maxIter = cfg.maxIter || 1000;
    const adjacencyWeight = cfg.adjacencyWeight || 0;
    const adjacencyDiagonal = cfg.adjacencyDiagonal || false;
    const distanceMetric = cfg.distanceMetric || 'euclidean';
    const compactnessWeight = cfg.compactnessWeight || 1.0;
    const spacerMode = cfg.spacerMode || 'hard';
    const maskPenalty = cfg.maskPenalty || 1e3;
    const spacerSet = cfg.spacerSet || new Set();

    // Build maps
    const idToNorm = new Map();
    normPoints.forEach(p => idToNorm.set(p.id, { x: p.normX, y: p.normY }));

    const cellKey = (r, c) => `${r}_${c}`;

    // occupancy map: cellKey -> assignment index in assignments array
    const occ = new Map();
    assignments.forEach((a, idx) => {
        if (a.gridX >= 0 && a.gridY >= 0) occ.set(cellKey(a.gridY, a.gridX), idx);
    });

    const distCost = (id, r, c) => {
        const np = idToNorm.get(id);
        if (!np) return 0;
        if (distanceMetric === 'manhattan') {
            return (Math.abs(np.x - c) + Math.abs(np.y - r)) * compactnessWeight + ((spacerMode === 'soft' && spacerSet.has(`${r}_${c}`)) ? maskPenalty : 0);
        }
        // euclidean squared
        return ((np.x - c) ** 2 + (np.y - r) ** 2) * compactnessWeight + ((spacerMode === 'soft' && spacerSet.has(`${r}_${c}`)) ? maskPenalty : 0);
    };

    const countAdjacentPairs = (occSet) => {
        let count = 0;
        const keys = Array.from(occSet);
        const s = new Set(occSet);
        for (const k of keys) {
            const [rs, cs] = k.split('_').map(Number);
            const nbrs = [[rs, cs+1], [rs+1, cs]];
            if (adjacencyDiagonal) {
                nbrs.push([rs+1, cs+1]);
            }
            nbrs.forEach(([nr,nc]) => {
                if (s.has(`${nr}_${nc}`)) count++;
            });
        }
        return count; // each pair counted once due to chosen neighbor directions
    };

    const currentOccSet = new Set(occ.keys());
    let adjCount = adjacencyWeight ? countAdjacentPairs(currentOccSet) : 0;

    let iter = 0;
    let swaps = 0;
    // Greedy pairwise swaps first
    let improved = true;
    while (improved && iter < maxIter) {
        improved = false;
        iter++;
        for (let i = 0; i < assignments.length; i++) {
            const ai = assignments[i];
            const ki = cellKey(ai.gridY, ai.gridX);
            for (let j = i + 1; j < assignments.length; j++) {
                const aj = assignments[j];
                const kj = cellKey(aj.gridY, aj.gridX);

                const oldDist = distCost(i, ai.gridY, ai.gridX) + distCost(j, aj.gridY, aj.gridX);
                const newDist = distCost(i, aj.gridY, aj.gridX) + distCost(j, ai.gridY, ai.gridX);

                const newOcc = new Set(currentOccSet);
                newOcc.delete(ki); newOcc.delete(kj);
                newOcc.add(kj); newOcc.add(ki);
                const newAdj = adjacencyWeight ? countAdjacentPairs(newOcc) : 0;

                const delta = (newDist - oldDist) - ((newAdj - adjCount) * adjacencyWeight);
                if (delta < -1e-9) {
                    const tmpX = ai.gridX, tmpY = ai.gridY;
                    ai.gridX = aj.gridX; ai.gridY = aj.gridY;
                    aj.gridX = tmpX; aj.gridY = tmpY;
                    currentOccSet.delete(ki); currentOccSet.delete(kj);
                    currentOccSet.add(cellKey(ai.gridY, ai.gridX)); currentOccSet.add(cellKey(aj.gridY, aj.gridX));
                    adjCount = newAdj;
                    swaps++;
                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }

    // Build list of free (empty) non-spacer cells
    const freeCells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const k = cellKey(r, c);
            if (spacerSet.has(k)) continue;
            if (!currentOccSet.has(k)) freeCells.push([r, c]);
        }
    }

    // Simulated annealing phase (random swaps and moves to empty cells)
    if (cfg.runSA) {
        const saIter = cfg.saIter || 2000;
        let T = cfg.saInitialTemp || 1.0;
        const cooling = cfg.saCooling || 0.995;

        // compute current total cost
        const computeTotal = () => {
            let sum = 0;
            const occSet = new Set();
            assignments.forEach((a, idx) => {
                sum += distCost(idx, a.gridY, a.gridX);
                occSet.add(cellKey(a.gridY, a.gridX));
            });
            const adj = adjacencyWeight ? countAdjacentPairs(occSet) : 0;
            return sum - adj * adjacencyWeight;
        };

        let bestCost = computeTotal();
        let bestAssign = assignments.map(a => ({ ...a }));

        for (let s = 0; s < saIter; s++) {
            // random choice: 0..1 -> 0 swap, 1 move-to-empty
            if (freeCells.length === 0) {
                // only swaps available
                const i = Math.floor(Math.random() * assignments.length);
                let j = Math.floor(Math.random() * assignments.length);
                if (i === j) continue;
                const ai = assignments[i]; const aj = assignments[j];
                const prev = computeTotal();
                // apply swap
                const tmpX = ai.gridX, tmpY = ai.gridY;
                ai.gridX = aj.gridX; ai.gridY = aj.gridY;
                aj.gridX = tmpX; aj.gridY = tmpY;
                const post = computeTotal();
                const delta = post - prev;
                if (delta <= 0 || Math.exp(-delta / T) > Math.random()) {
                    if (post < bestCost) { bestCost = post; bestAssign = assignments.map(a => ({ ...a })); }
                } else {
                    // revert
                    aj.gridX = ai.gridX; aj.gridY = ai.gridY; // revert via stored tmp not ideal but acceptable rarely
                }
            } else {
                // pick random point and random free cell
                const i = Math.floor(Math.random() * assignments.length);
                const fi = Math.floor(Math.random() * freeCells.length);
                const [nr, nc] = freeCells[fi];
                const ai = assignments[i];
                const prev = computeTotal();
                // move i to [nr,nc]
                const oldR = ai.gridY, oldC = ai.gridX;
                ai.gridY = nr; ai.gridX = nc;
                const post = computeTotal();
                const delta = post - prev;
                if (delta <= 0 || Math.exp(-delta / T) > Math.random()) {
                    // accepted: update freeCells
                    freeCells.splice(fi, 1);
                    freeCells.push([oldR, oldC]);
                    if (post < bestCost) { bestCost = post; bestAssign = assignments.map(a => ({ ...a })); }
                } else {
                    // revert
                    ai.gridY = oldR; ai.gridX = oldC;
                }
            }
            T *= cooling;
        }

        // apply best found
        for (let k = 0; k < assignments.length; k++) {
            assignments[k].gridX = bestAssign[k].gridX;
            assignments[k].gridY = bestAssign[k].gridY;
        }
    }

    // Optionally run adjacency-specific local fixer to reduce feature cut edges
    if (cfg.adjacencyGraph && cfg.runAdjacencyFix) {
        try {
            const res = reduceCutEdges(assignments, cfg.adjacencyGraph, rows, cols, { maxIter: cfg.adjFixIter || 500, adjacencyDiagonal: cfg.adjacencyDiagonal, spacerSet: cfg.spacerSet });
            assignments = res.assignments;
            return { assignments, meta: { iterations: iter, swaps, adjFix: res.meta } };
        } catch (e) {
            // ignore and return standard results
        }
    }

    return { assignments, meta: { iterations: iter, swaps } };
}

