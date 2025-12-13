/**
 * Simple Allocation Engine
 * Core MIP solving logic for simple allocation (allocateSimple API)
 */

import { normalizePointsSimple } from '../normalization/point-normalizer.js';
import { calculateBounds } from '../normalization/bounds-calculator.js';

/**
 * Solve the linear programming problem for simple allocation
 * @param {Array} pts - Array of [x, y] coordinate pairs
 * @param {Object} grid - Grid object with nRows, nCols, cells
 * @param {number} compactness - Compactness parameter (0 to 1)
 * @param {Function} mipFactory - Factory function that returns MIP solver instance
 * @returns {Promise<Object>} Solution object with vars, result, status
 */
export async function solveSimpleAllocation(pts, grid, compactness, mipFactory) {
    const n = grid.cells.length;
    const bounds = calculateBounds(pts.map(([x, y]) => ({ x, y })));

    // Normalize points based on compactness
    const normalizedPts = normalizePointsSimple(pts, bounds, grid, compactness);

    // Build objective function: minimize squared distance
    const objectiveTerms = [];
    const pointVars = {}; // pointId -> [varName, ...]
    const cellVars = {};  // cellId -> [varName, ...]

    // Initialize trackers
    for (let i = 0; i < pts.length; i++) {
        pointVars[i] = [];
    }
    for (let i = 0; i < n; i++) {
        cellVars[i] = [];
    }

    // Create variables and objective terms
    let varIdx = 0;
    for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
            if (a < pts.length) {
                const [px, py] = normalizedPts[a];
                const [gx, gy] = grid.cells[b];
                const cost = (px - gx) ** 2 + (py - gy) ** 2;

                if (cost !== 0) {
                    objectiveTerms.push({ name: `x${varIdx}`, coef: cost });
                }
                pointVars[a].push(`x${varIdx}`);
                cellVars[b].push(`x${varIdx}`);
            }
            varIdx++;
        }
    }

    // Build MIP model
    const solver = mipFactory();
    
    // Declare all variables as binary
    for (let i = 0; i < varIdx; i++) {
        solver.var(`x${i}`, Boolean);
    }

    // Set objective
    solver.setObjective(Math.min, objectiveTerms);

    // Constraint: Each point must be assigned to exactly 1 cell
    Object.values(pointVars).forEach(vars => {
        if (vars.length > 0) {
            solver.addConstraint(
                vars.map(v => ({ name: v, coef: 1 })),
                '==',
                1
            );
        }
    });

    // Constraint: Each cell can hold at most 1 point
    Object.values(cellVars).forEach(vars => {
        if (vars.length > 0) {
            solver.addConstraint(
                vars.map(v => ({ name: v, coef: 1 })),
                '<=',
                1
            );
        }
    });

    // Solve
    return await solver.solve();
}

