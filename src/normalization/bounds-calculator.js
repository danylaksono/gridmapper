/**
 * Bounds Calculator
 * Calculates bounding box for arrays of points
 */

/**
 * Calculate bounds (min/max x/y) for an array of points
 * @param {Array} points - Array of points with x, y properties
 * @returns {Object} Bounds object with minX, maxX, minY, maxY, width, height
 */
export function calculateBounds(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { 
        minX, 
        maxX, 
        minY, 
        maxY, 
        width: maxX - minX, 
        height: maxY - minY 
    };
}

