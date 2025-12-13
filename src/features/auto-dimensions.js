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
export function calculateAutoDimensions(n, bounds) {
    // Aspect ratio of the geography
    // Prevent divide by zero if width is 0 (unlikely)
    const ratio = bounds.height / (bounds.width || 1);

    // Solve for cols: 
    // Area ~= n
    // rows / cols ~= ratio  => rows = cols * ratio
    // (cols * ratio) * cols = n
    // cols^2 * ratio = n
    // cols = sqrt(n / ratio)
    
    let cols = Math.round(Math.sqrt(n / ratio));
    // Boundary check
    if (cols < 1) cols = 1;
    
    let rows = Math.ceil(n / cols);

    // Ensure we have enough slots
    while ((rows * cols) < n) {
        rows++;
    }

    return { rows, cols };
}

