/**
 * Point Normalizer
 * Normalizes geographic points to grid coordinate space
 */

/**
 * Normalize points to grid space (simple version for allocateSimple)
 * @param {Array} pts - Array of [x, y] coordinate pairs
 * @param {Object} bounds - Bounds object with minX, maxX, minY, maxY
 * @param {Object} grid - Grid object with nRows, nCols, cells
 * @param {number} compactness - Compactness parameter (0 to 1)
 * @returns {Array} Array of normalized [x, y] coordinate pairs
 */
export function normalizePointsSimple(pts, bounds, grid, compactness) {
    const xDomain = [bounds.minX, bounds.maxX];
    const yDomain = [bounds.minY, bounds.maxY];

    // Center of grid
    const cc = (grid.nCols - 1) / 2;
    const cr = (grid.nRows - 1) / 2;

    // Size of rectangle inversely proportional to compactness
    const rWidth = (1 / (compactness + 0.001) - 1) * (grid.nCols - 1) + 1;
    const rHeight = (1 / (compactness + 0.001) - 1) * (grid.nRows - 1) + 1;

    // Scale points to grid space
    const xNorm = (x) => {
        const t = (x - xDomain[0]) / (xDomain[1] - xDomain[0] || 1);
        return cc - rWidth / 2 + t * rWidth;
    };
    const yNorm = (y) => {
        const t = (y - yDomain[0]) / (yDomain[1] - yDomain[0] || 1);
        return cr - rHeight / 2 + t * rHeight;
    };

    return pts.map(([x, y]) => [xNorm(x), yNorm(y)]);
}

/**
 * Normalize points to grid space (advanced version for allocate)
 * @param {Array} points - Array of point objects with x, y properties
 * @param {Object} bounds - Bounds object with minX, maxX, minY, maxY, width, height
 * @param {number} rows - Number of grid rows
 * @param {number} cols - Number of grid columns
 * @param {number} compactness - Compactness parameter (0 to 1)
 * @param {string} gridType - Grid type: 'rect' | 'hex'
 * @returns {Array} Array of point objects with added normX, normY properties
 */
export function normalizePointsToGrid(points, bounds, rows, cols, compactness, gridType = 'rect') {
    // Scales geographic coordinates into the "ideal" floating point position 
    // within the grid system.
    // Compactness controls the size of the target rectangle:
    // - compactness = 1: very small rectangle centered in grid (clustered)
    // - compactness = 0.5: preserves relative geographic position
    // - compactness = 0: full grid dimensions (edge placement)
    
    // Center of grid
    const cc = (cols - 1) / 2;
    const cr = (rows - 1) / 2;

    // Size of rectangle inversely proportional to compactness
    // This matches the original library's implementation
    const rWidth = (1 / (compactness + 0.001) - 1) * (cols - 1) + 1;
    const rHeight = (1 / (compactness + 0.001) - 1) * (rows - 1) + 1;

    // For hex grids, calculate effective dimensions and center
    let effectiveCols, effectiveRows, effectiveCC, effectiveCR, effectiveRWidth, effectiveRHeight;
    
    if (gridType === 'hex') {
        // Hex grid coordinate space:
        // X: col + ((row % 2) ? 0.5 : 0), so effective width = (cols - 1) + 0.5
        // Y: row * 0.8660254037844386, so effective height = (rows - 1) * 0.8660254037844386
        effectiveCols = (cols - 1) + 0.5;
        effectiveRows = (rows - 1) * 0.8660254037844386;
        effectiveCC = effectiveCols / 2;
        effectiveCR = effectiveRows / 2;
        
        // Size of rectangle inversely proportional to compactness (using effective dimensions)
        effectiveRWidth = (1 / (compactness + 0.001) - 1) * effectiveCols + 1;
        effectiveRHeight = (1 / (compactness + 0.001) - 1) * effectiveRows + 1;
    } else {
        // Rectangular grid uses standard dimensions
        effectiveCC = cc;
        effectiveCR = cr;
        effectiveRWidth = rWidth;
        effectiveRHeight = rHeight;
    }

    return points.map(p => {
        // 0 to 1 normalization (geographic space)
        const nx = (p.x - bounds.minX) / (bounds.width || 1);
        const ny = (p.y - bounds.minY) / (bounds.height || 1);

        // Scale to compactness-adjusted rectangle centered in grid
        // This is the key difference: we scale to a smaller rectangle when compactness is high
        const gx = effectiveCC - effectiveRWidth / 2 + nx * effectiveRWidth;
        const gy = effectiveCR - effectiveRHeight / 2 + ny * effectiveRHeight;

        return {
            ...p,
            normX: gx,
            normY: gy
        };
    });
}

