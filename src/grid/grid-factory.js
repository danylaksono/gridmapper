/**
 * Grid Factory
 * Creates and manipulates grid structures
 */

/**
 * Create grid cell list, excluding spacers
 * @param {number} nRows - Number of grid rows
 * @param {number} nCols - Number of grid columns
 * @param {Array} spacers - Optional array of [row, col] spacer positions
 * @returns {Object} Grid object with nRows, nCols, cells properties
 */
export function createGrid(nRows, nCols, spacers = []) {
    const spacerSet = new Set(spacers.map(([r, c]) => `${r}_${c}`));
    const cells = [];

    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            // Note: Original library uses (nRows - 1 - row) for Y-flip
            // We'll use standard row/col ordering
            if (!spacerSet.has(`${row}_${col}`)) {
                cells.push([row, col]);
            }
        }
    }

    return { nRows, nCols, cells };
}

/**
 * Calculate grid center coordinates for a given cell
 * @param {number} row - Grid row
 * @param {number} col - Grid column
 * @param {string} gridType - Grid type: 'rect' | 'hex'
 * @returns {Object} Object with x, y center coordinates
 */
export function getGridCellCenter(row, col, gridType = 'rect') {
    if (gridType === 'hex') {
        return {
            x: col + ((row % 2) ? 0.5 : 0),
            y: row * 0.8660254037844386
        };
    }
    // Rectangular grid
    return { x: col, y: row };
}

