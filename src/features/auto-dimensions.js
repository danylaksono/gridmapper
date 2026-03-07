/**
 * Auto Dimensions Calculator
 * Calculates optimal grid dimensions based on point count and aspect ratio
 */

/**
 * Calculate optimal grid dimensions based on number of points and geographic bounds
 * @param {number} n - Number of points to allocate
 * @param {Object} bounds - Bounds object with width and height properties
 * @returns {Object} Object with rows and cols properties
 */
export function calculateAutoDimensions(n, bounds, options = {}) {
    const {
        aspectRatio = bounds.height / (bounds.width || 1),
        targetCellCount = n,
        minRows = 1,
        minCols = 1
    } = options;

    const safeAspect = aspectRatio > 0 ? aspectRatio : 1;
    const cells = Math.max(targetCellCount, n, 1);

    let cols = Math.round(Math.sqrt(cells / safeAspect));
    if (cols < 1) cols = 1;

    let rows = Math.ceil(cells / cols);

    rows = Math.max(rows, minRows);
    cols = Math.max(cols, minCols);

    while ((rows * cols) < cells) {
        if ((rows / safeAspect) <= cols) {
            rows++;
        } else {
            cols++;
        }
    }

    if ((rows * cols) < n) {
        while ((rows * cols) < n) {
            if (rows <= cols) {
                rows++;
            } else {
                cols++;
            }
        }
    }

    return { rows, cols };
}

