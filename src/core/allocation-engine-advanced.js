/**
 * Advanced Allocation Engine
 * Core MIP solving logic for advanced allocation (allocate API)
 */

import { getGridCellCenter } from '../grid/grid-factory.js';

/**
 * Build and solve advanced allocation problem
 * @param {Array} normalizedPoints - Array of normalized point objects with id, normX, normY, originalData
 * @param {Object} config - Configuration object
 * @param {number} config.gridRows - Number of grid rows
 * @param {number} config.gridCols - Number of grid columns
 * @param {Object} config.bounds - Bounds object
 * @param {number} config.compactness - Compactness parameter
 * @param {string} config.gridType - Grid type: 'rect' | 'hex'
 * @param {string} config.distanceMetric - Distance metric: 'euclidean' | 'manhattan'
 * @param {number} config.compactnessWeight - Weight for distance objective
 * @param {string} config.spacerMode - Spacer mode: 'hard' | 'soft'
 * @param {number} config.maskPenalty - Penalty for soft spacer cells
 * @param {Set} config.spacerSet - Set of spacer cell keys
 * @param {number} config.adjacencyWeight - Weight for adjacency constraints
 * @param {boolean} config.adjacencyDiagonal - Include diagonal neighbors
 * @param {Function} config.mipFactory - Factory function returning MIP solver
 * @returns {Promise<Object>} Solution object with vars, result, status
 */
export async function solveAdvancedAllocation(normalizedPoints, config) {
    const {
        gridRows,
        gridCols,
        gridType = 'rect',
        distanceMetric,
        compactnessWeight,
        spacerMode,
        maskPenalty,
        spacerSet,
        adjacencyWeight,
        adjacencyDiagonal,
        mipFactory
    } = config;

    // Prepare Solver Model
    const solverBuilder = mipFactory();
    const objectiveTerms = [];
    const pointVars = {}; // pointId -> [varName, ...]
    const cellVars = {};  // cellId -> [varName, ...]

    // Initialize trackers
    normalizedPoints.forEach(p => pointVars[p.id] = []);
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            // Skip spacer cells entirely (treat as unavailable)
            if (spacerSet.has(`${r}_${c}`)) continue;
            cellVars[`${r}_${c}`] = [];
        }
    }

    // Build Constraints and Variables
    normalizedPoints.forEach(p => {
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                // skip spacer cells
                if (spacerSet.has(`${r}_${c}`)) continue;
                const varName = `p${p.id}_r${r}_c${c}`;
                
                // Calculate grid center coordinates
                const gridCenter = getGridCellCenter(r, c, gridType);

                // Calculate cost based on selected metric
                let distCost = 0;
                if (distanceMetric === 'manhattan') {
                    distCost = Math.abs(p.normX - gridCenter.x) + Math.abs(p.normY - gridCenter.y);
                } else {
                    // euclidean squared (preserves previous behavior)
                    distCost = (p.normX - gridCenter.x) ** 2 + (p.normY - gridCenter.y) ** 2;
                }
                distCost *= compactnessWeight;

                // Add to objective (minimize cost)
                objectiveTerms.push({ name: varName, coef: distCost });

                // If spacerMode is soft and this cell is a spacer, add mask penalty
                if (spacerMode === 'soft' && spacerSet.has(`${r}_${c}`)) {
                    objectiveTerms.push({ name: varName, coef: maskPenalty });
                }

                // Add to trackers
                pointVars[p.id].push(varName);
                cellVars[`${r}_${c}`].push(varName);
                
                // Declare as binary integer (0 or 1)
                solverBuilder.var(varName, Boolean);
            }
        }
    });

    // --- Adjacency / Compactness terms ---
    // Create occupancy variables per cell and linearize pairwise AND vars
    const occVars = {};
    Object.keys(cellVars).forEach(cellId => {
        const occName = `occ_${cellId}`;
        solverBuilder.var(occName, Boolean);
        occVars[cellId] = occName;
        // sum(assignments in cell) - occ == 0  (since at most 1 assignment per cell)
        const expr = cellVars[cellId].map(v => ({ name: v, coef: 1 }));
        expr.push({ name: occName, coef: -1 });
        solverBuilder.addConstraint(expr, '==', 0);
    });

    if (adjacencyWeight && adjacencyWeight !== 0) {
        const seenPairs = new Set();
        Object.keys(cellVars).forEach(cellId => {
            const [rStr, cStr] = cellId.split('_');
            const r = parseInt(rStr, 10);
            const c = parseInt(cStr, 10);
            const neighbors = [ [r-1,c], [r+1,c], [r,c-1], [r,c+1] ];
            if (adjacencyDiagonal) {
                neighbors.push([r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]);
            }
            neighbors.forEach(([nr,nc]) => {
                const nid = `${nr}_${nc}`;
                if (!occVars[nid]) return;
                const pairKey = [cellId, nid].sort().join('__');
                if (seenPairs.has(pairKey)) return;
                seenPairs.add(pairKey);

                const pij = `pij_${cellId}_${nid}`;
                solverBuilder.var(pij, Boolean);
                // pij <= occ_i
                solverBuilder.addConstraint([{ name: pij, coef: 1 }, { name: occVars[cellId], coef: -1 }], '<=', 0);
                // pij <= occ_j
                solverBuilder.addConstraint([{ name: pij, coef: 1 }, { name: occVars[nid], coef: -1 }], '<=', 0);
                // occ_i + occ_j - pij <= 1  => pij >= occ_i + occ_j -1
                solverBuilder.addConstraint([{ name: occVars[cellId], coef: 1 }, { name: occVars[nid], coef: 1 }, { name: pij, coef: -1 }], '<=', 1);

                // Reward adjacent occupied pairs (negative cost)
                objectiveTerms.push({ name: pij, coef: -adjacencyWeight });
            });
        });
    }

    // Set Objective
    solverBuilder.setObjective(Math.min, objectiveTerms);

    // Constraint A: Each Point must be assigned to exactly 1 Grid Cell.
    Object.values(pointVars).forEach(vars => {
        if (vars.length > 0) {
            solverBuilder.addConstraint(vars.map(v => ({ name: v, coef: 1 })), '==', 1);
        }
    });

    // Constraint B: Each Grid Cell can hold max 1 Point.
    Object.values(cellVars).forEach(vars => {
        if (vars.length > 0) {
            solverBuilder.addConstraint(vars.map(v => ({ name: v, coef: 1 })), '<=', 1);
        }
    });

    // Solve
    return await solverBuilder.solve();
}

/**
 * Map solution back to data assignments
 * @param {Object} solution - Solution object from solver
 * @param {Array} points - Array of point objects with id, originalData
 * @param {number} gridRows - Number of grid rows
 * @param {number} gridCols - Number of grid columns
 * @returns {Array} Array of assignment objects with gridX, gridY, gridCols, gridRows
 */
export function mapSolutionToAssignments(solution, points, gridRows, gridCols) {
    // The solver returns variables like "p0_r2_c3": 1
    return points.map(p => {
        // Find the variable for this point that was selected (value 1)
        let assignedR = -1;
        let assignedC = -1;

        // Iterate potential keys in solution to find this point's assignment
        for (const key of Object.keys(solution.vars)) {
            if (key.startsWith(`p${p.id}_`) && solution.vars[key] === 1) {
                const parts = key.split('_'); // ["p0", "r2", "c3"]
                assignedR = parseInt(parts[1].substring(1)); // "r2" -> 2
                assignedC = parseInt(parts[2].substring(1)); // "c3" -> 3
                break;
            }
        }

        return {
            ...p.originalData,
            gridX: assignedC,
            gridY: assignedR,
            gridCols: gridCols,
            gridRows: gridRows
        };
    });
}

