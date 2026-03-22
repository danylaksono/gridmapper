/**
 * GridMapper
 * Main class to allocate geographic points to a grid using Mixed Integer Programming (MIP).
 * 
 * Simple API (matches original Jo Wood library):
 *   await mapper.allocateSimple(points, rows, cols, compactness, spacers, { mip })
 * 
 * Advanced API (with auto-dimensions, PCA, etc.):
 *   await mapper.allocate(data, { mip, rows, cols, compactness, ... })
 */

import { createGrid } from '../grid/grid-factory.js';
import { calculateBounds } from '../normalization/bounds-calculator.js';
import { normalizePointsToGrid } from '../normalization/point-normalizer.js';
import { calculateAutoDimensions } from '../features/auto-dimensions.js';
import { PCARotation } from '../features/pca-rotation.js';
import { SpacerUtils } from '../features/spacer-utils.js';
import { solveSimpleAllocation } from './allocation-engine-simple.js';
import { solveAdvancedAllocation, mapSolutionToAssignments } from './allocation-engine-advanced.js';
import { postProcessSwaps } from '../post-processing/optimizer.js';

export class GridMapper {
    constructor() {
        // Configuration defaults
        this.defaultCompactness = 0.5; 
    }

    /**
     * Simple allocation API matching the original Jo Wood library.
     * @param {Array} points - Array of [x, y] coordinates or objects with x/y accessors
     * @param {number} nRows - Number of grid rows
     * @param {number} nCols - Number of grid columns
     * @param {number} compactness - 0 to 1 (default: 1). 0.5 = relative geo position, 1 = center cluster
     * @param {Array} spacers - Optional array of [row, col] spacer positions
     * @param {Object} options - Optional: { xAccessor, yAccessor, mip }
     * @returns {Promise<Object>} - { nRows, nCols, cells: [[row, col], ...] }
     */
    async allocateSimple(points, nRows, nCols, compactness = 1, spacers = [], options = {}) {
        const {
            xAccessor = d => Array.isArray(d) ? d[0] : d.x,
            yAccessor = d => Array.isArray(d) ? d[1] : d.y,
            mip = null
        } = options;

        if (!mip) {
            throw new Error("MIP solver function must be provided in options.mip");
        }

        // Extract points as [x, y] arrays
        const pts = points.map(d => [xAccessor(d), yAccessor(d)]);

        // Create grid with spacers
        const grid = createGrid(nRows, nCols, spacers);

        // Check if we have enough cells
        if (pts.length > grid.cells.length) {
            throw new Error(
                `Cannot allocate ${pts.length} points to a grid with only ${grid.cells.length} cells.`
            );
        }

        // Solve using MIP
        const solution = await solveSimpleAllocation(pts, grid, compactness, mip);

        // Map solution back to grid coordinates
        const gPos = Object.entries(solution.vars)
            .filter(([_, v]) => v === 1) // Select true variables
            .map(([k, _]) => Number(k.slice(1))) // Extract index from "x0", "x1", etc.
            .sort((a, b) => a - b); // Keep in original point order

        return {
            nRows: nRows,
            nCols: nCols,
            cells: gPos.map(idx => grid.cells[idx])
        };
    }

    /**
     * Main entry point for advanced allocation.
     * @param {Array} data - Array of objects (e.g., [{id: 'A', lat: 10, lon: 20}, ...])
     * @param {Object} options - Config options
     * @returns {Promise<Object>} - Object with assignments and meta information
     */
    async allocate(data, options = {}) {
        const {
            xAccessor = d => d.x, // Accessor for Longitude/X
            yAccessor = d => d.y, // Accessor for Latitude/Y
            rows = null,          // Optional: Force specific rows
            cols = null,          // Optional: Force specific cols
            compactness = 0.5,    // 0 to 1. 0.5 = relative geo position.
            mip = null,           // MIP solver function (required)
            rotateByPCA = false,  // align grid to principal axis
            distanceMetric = 'euclidean', // 'euclidean' or 'manhattan'
            compactnessWeight = 1.0, // multiplier for distance objective
            spacerMode = 'hard',  // 'hard' (skip) or 'soft' (penalize)
            maskPenalty = 1e3     // penalty coef for soft spacer cells
        } = options;
        const gridType = options.gridType || 'rect'; // 'rect' | 'hex' | 'ragged'
        const adjacencyWeight = options.adjacencyWeight || 0;
        const adjacencyDiagonal = options.adjacencyDiagonal || false;

        if (!mip) {
            throw new Error("MIP solver function must be provided in options.mip");
        }

        // 1. Extract and normalize points
        const points = data.map((d, i) => ({
            originalData: d,
            id: i, // Internal ID for the solver
            x: xAccessor(d),
            y: yAccessor(d)
        }));

        // 2. Calculate Bounds
        const bounds = calculateBounds(points);
        
        // 3. Automate Grid Dimensions if not provided
        let gridRows = rows;
        let gridCols = cols;

        if (!gridRows || !gridCols) {
            const autoDims = calculateAutoDimensions(points.length, bounds);
            gridRows = autoDims.rows;
            gridCols = autoDims.cols;
        }

        // Optionally rotate points to align principal axis with grid X
        let workingPoints = points.map(p => ({ ...p }));
        if (rotateByPCA) {
            const rotation = PCARotation.computeAngle(workingPoints);
            // Use the same rotation direction as the estimator's PCA evaluation.
            workingPoints = PCARotation.rotate(workingPoints, -rotation);
        }

        // Compute spacers (either provided or auto-compute from geometry)
        const providedSpacers = options.spacers || null;
        const mask = options.mask || null; // optional GeoJSON-like polygon

        // recompute bounds if rotated
        const workingBounds = rotateByPCA ? calculateBounds(workingPoints) : bounds;

        let spacers = providedSpacers;
        if (!spacers && mask) {
            // Auto-compute spacers from mask
            spacers = SpacerUtils.autoCompute(workingPoints, workingBounds, gridRows, gridCols, mask, gridType);
        }
        spacers = spacers || [];

        // Simple spacer handling: just check if we have enough cells
        const spacerSet = new Set(spacers.map(s => `${s[0]}_${s[1]}`));
        const hardSpacerCount = spacerMode === 'hard' ? spacerSet.size : 0;
        const totalAvailable = gridRows * gridCols - hardSpacerCount;

        if (totalAvailable < points.length) {
            throw new Error(
                `Grid dimensions [${gridCols}x${gridRows}] with ${spacerSet.size} spacers leave only ${totalAvailable} slots for ${points.length} items. ` +
                `Please increase rows/cols or reduce spacers.`
            );
        }

        // 4. Normalize points for solver (also needed for post-processing)
        const normalizedPoints = normalizePointsToGrid(
            rotateByPCA ? workingPoints : points,
            rotateByPCA ? workingBounds : bounds,
            gridRows,
            gridCols,
            compactness,
            gridType
        );

        // 5. Solve using advanced allocation engine
        const solution = await solveAdvancedAllocation(
            normalizedPoints,
            {
                gridRows,
                gridCols,
                gridType,
                distanceMetric,
                compactnessWeight,
                spacerMode,
                maskPenalty,
                spacerSet,
                adjacencyWeight,
                adjacencyDiagonal,
                embeddingTargets: options.embeddingTargets,
                embeddingWeight: options.embeddingWeight || 0,
                // pass-through extended options
                pairwiseAdjacency: options.pairwiseAdjacency,
                adjacencyGraph: options.adjacencyGraph,
                mipFactory: mip
            }
        );

        // 6. Map Solution back to Data
        const result = mapSolutionToAssignments(solution, points, gridRows, gridCols);

        // 7. Optional post-processing (disabled by default to match original simplicity)
        let finalResult = result;
        let postProcessMeta = null;
        if (options.runPostProcess || options.runSA || options.runAdjacencyFix) {

            const swapConfig = {
                maxIter: options.maxSwapIter || 1000,
                adjacencyWeight: adjacencyWeight,
                adjacencyDiagonal: adjacencyDiagonal,
                distanceMetric: distanceMetric,
                compactnessWeight: compactnessWeight,
                spacerMode: spacerMode,
                maskPenalty: maskPenalty,
                spacerSet: spacerSet,
                runSA: options.runSA === undefined ? false : Boolean(options.runSA),
                saIter: options.saIter || 2000,
                saInitialTemp: options.saInitialTemp || 1.0,
                saCooling: options.saCooling || 0.995,
                adjacencyGraph: options.adjacencyGraph,
                runAdjacencyFix: Boolean(options.runAdjacencyFix),
                adjFixIter: options.adjFixIter || 500
            };
            const postRes = postProcessSwaps(result, normalizedPoints, gridRows, gridCols, swapConfig);
            finalResult = postRes.assignments;
            postProcessMeta = postRes.meta;
        }

        return {
            assignments: finalResult,
            meta: {
                rows: gridRows,
                cols: gridCols,
                gridType: gridType,
                score: solution.result,
                isFeasible: solution.status === 'optimal',
                bounds: bounds,
                spacers: spacers,
                postProcess: postProcessMeta
            }
        };
    }
}

