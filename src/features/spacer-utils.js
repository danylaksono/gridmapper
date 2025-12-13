/**
 * Spacer Utilities
 * Provides utilities for computing spacer positions from masks and polygons
 */

/**
 * Spacer auto-computation utilities
 */
export class SpacerUtils {
    /**
     * Auto-compute spacers from polygon mask
     * @param {Array} points - Array of points with x, y properties
     * @param {Object} bounds - Bounds object with minX, maxX, minY, maxY, width, height
     * @param {number} rows - Number of grid rows
     * @param {number} cols - Number of grid columns
     * @param {Object|Array} mask - GeoJSON polygon or array of coordinates
     * @param {string} gridType - Grid type: 'rect' | 'hex'
     * @returns {Array} Array of [row, col] spacer positions
     */
    static autoCompute(points, bounds, rows, cols, mask, gridType = 'rect') {
        let polygon = null;
        if (mask) {
            if (mask.coordinates) {
                polygon = mask.coordinates[0].map(c => [c[0], c[1]]);
            } else if (Array.isArray(mask)) {
                polygon = mask;
            }
        }

        if (!polygon) {
            const pts = points.map(p => [p.x, p.y]);
            polygon = SpacerUtils._convexHull(pts);
        }

        const spacers = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let tx, ty;
                if (gridType === 'hex') {
                    const xOffset = (r % 2) ? 0.5 : 0;
                    const denomX = (cols > 1) ? ((cols - 1) + 0.5) : 1;
                    const denomY = (rows > 1) ? ((rows - 1) * 0.8660254037844386) : 1;
                    tx = (cols > 1) ? ((c + xOffset) / denomX) : 0.5;
                    ty = (rows > 1) ? ((r * 0.8660254037844386) / denomY) : 0.5;
                } else {
                    tx = (cols > 1) ? (c / (cols - 1)) : 0.5;
                    ty = (rows > 1) ? (r / (rows - 1)) : 0.5;
                }

                const gx = bounds.minX + tx * (bounds.width || 0);
                const gy = bounds.minY + ty * (bounds.height || 0);

                if (!SpacerUtils._pointInPolygon(gx, gy, polygon)) {
                    spacers.push([r, c]);
                }
            }
        }

        return spacers;
    }

    /**
     * Convex hull using Andrew's monotone chain algorithm
     * @private
     */
    static _convexHull(points) {
        if (!points || points.length <= 1) return points.slice();
        const pts = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

        const lower = [];
        for (let p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    /**
     * Point-in-polygon test using ray-casting algorithm
     * @private
     */
    static _pointInPolygon(x, y, polygon) {
        if (!polygon || polygon.length === 0) return false;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}

