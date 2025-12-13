/**
 * PCA Rotation Utilities
 * Provides Principal Component Analysis rotation for aligning points to grid axes
 */

/**
 * PCA rotation utilities
 */
export class PCARotation {
    /**
     * Compute PCA principal angle (radians) for points
     * @param {Array} points - Array of points with x, y properties
     * @returns {number} Rotation angle in radians
     */
    static computeAngle(points) {
        if (!points || points.length < 2) return 0;
        const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
        const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
        let sxx = 0, syy = 0, sxy = 0;
        points.forEach(p => {
            const dx = p.x - meanX;
            const dy = p.y - meanY;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        });
        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return theta;
    }

    /**
     * Rotate points around a center point by angle (radians)
     * @param {Array} points - Array of points with x, y properties
     * @param {number} angle - Rotation angle in radians
     * @param {Object} [center] - Optional center point {x, y}. If not provided, centroid of points is used.
     * @returns {Array} New array of rotated points
     */
    static rotate(points, angle, center) {
        if (!points || points.length === 0) return points.map(p => ({ ...p }));
        
        let cx, cy;
        if (center) {
            cx = center.x;
            cy = center.y;
        } else {
            cx = points.reduce((s, p) => s + p.x, 0) / points.length;
            cy = points.reduce((s, p) => s + p.y, 0) / points.length;
        }

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return points.map(p => ({
            ...p,
            x: cx + (p.x - cx) * cosA - (p.y - cy) * sinA,
            y: cy + (p.x - cx) * sinA + (p.y - cy) * cosA
        }));
    }
}

