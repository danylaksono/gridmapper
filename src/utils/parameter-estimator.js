/**
 * Parameter Estimator
 * Automatically estimates optimal parameters for grid allocation from GeoJSON data
 */

import { calculateBounds } from '../normalization/bounds-calculator.js';
import { calculateAutoDimensions } from '../features/auto-dimensions.js';
import { computePolygonCentroid } from './polygon-centroid.js';

/**
 * Estimate optimal parameters for grid allocation from GeoJSON data
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {Object} options - Configuration options
 * @param {Function} options.xAccessor - Accessor for longitude/x coordinate (default: d => d.lon)
 * @param {Function} options.yAccessor - Accessor for latitude/y coordinate (default: d => d.lat)
 * @returns {Object} Object with estimated parameters: { rows, cols, compactness, rotateByPCA }
 */
export function estimateParameters(geojson, options = {}) {
    const {
        xAccessor = d => d.lon,
        yAccessor = d => d.lat
    } = options;

    if (!geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error('GeoJSON must contain a features array with at least one feature');
    }

    // Extract points from features
    const points = geojson.features.map((feature, i) => {
        const geometry = feature.geometry;
        let x, y;
        
        if (geometry.type === 'Point') {
            x = geometry.coordinates[0];
            y = geometry.coordinates[1];
        } else if (geometry.type === 'Polygon') {
            // Use polylabel-based interior point (pole-of-inaccessibility) when possible
            const c = computePolygonCentroid(geometry);
            if (c) {
                x = c.x;
                y = c.y;
            } else {
                // Fallback to arithmetic mean of outer ring
                const coords = geometry.coordinates[0];
                const sum = coords.reduce((acc, [lon, lat]) => ({
                    x: acc.x + lon,
                    y: acc.y + lat
                }), { x: 0, y: 0 });
                x = sum.x / coords.length;
                y = sum.y / coords.length;
            }
        } else if (geometry.type === 'MultiPolygon') {
            // Use the centroid of the largest polygon (by area), via polylabel when possible
            const c = computePolygonCentroid(geometry);
            if (c) {
                x = c.x;
                y = c.y;
            } else {
                // Use first polygon's centroid as a conservative fallback
                const coords = geometry.coordinates[0][0];
                const sum = coords.reduce((acc, [lon, lat]) => ({
                    x: acc.x + lon,
                    y: acc.y + lat
                }), { x: 0, y: 0 });
                x = sum.x / coords.length;
                y = sum.y / coords.length;
            }
        } else {
            throw new Error(`Unsupported geometry type: ${geometry.type}. Supported types: Point, Polygon, MultiPolygon`);
        }
        
        return { x, y };
    });

    // Calculate bounds
    const bounds = calculateBounds(points);

    // Auto-calculate grid dimensions based on point count and aspect ratio
    const { rows, cols } = calculateAutoDimensions(points.length, bounds);

    // Estimate compactness based on point spread
    // If points are spread out, use lower compactness (preserve relative positions)
    // If points are clustered, use higher compactness (allow more clustering)
    const compactness = estimateCompactness(points, bounds);

    // Estimate if PCA rotation would be beneficial
    // This is a simple heuristic: if the aspect ratio is very different from 1:1,
    // PCA rotation might help align the data better
    const rotateByPCA = estimatePCARotation(bounds);

    return {
        rows,
        cols,
        compactness,
        rotateByPCA
    };
}

/**
 * Estimate optimal compactness value based on point distribution
 * @param {Array} points - Array of points with x, y properties
 * @param {Object} bounds - Bounds object
 * @returns {number} Compactness value between 0 and 1
 */
function estimateCompactness(points, bounds) {
    if (points.length === 0) return 0.5;

    // Calculate the spread of points relative to bounds
    // If points are evenly distributed, spread will be high
    // If points are clustered, spread will be low
    
    // Calculate mean position
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    // Calculate standard deviation of distances from mean
    const distances = points.map(p => {
        const dx = (p.x - meanX) / (bounds.width || 1);
        const dy = (p.y - meanY) / (bounds.height || 1);
        return Math.sqrt(dx * dx + dy * dy);
    });

    const meanDist = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDist, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    // Normalize spread (0 = very clustered, 1 = very spread out)
    // For a uniform distribution in a unit square, stdDev ≈ 0.4
    // We'll use this as a reference
    const normalizedSpread = Math.min(1, stdDev / 0.4);

    // Map spread to compactness:
    // - High spread (evenly distributed) -> lower compactness (0.3-0.5) to preserve positions
    // - Low spread (clustered) -> higher compactness (0.5-0.7) to allow clustering
    // Default to 0.5 (preserve relative geographic position)
    const compactness = 0.3 + (1 - normalizedSpread) * 0.4;

    // Clamp to reasonable range
    return Math.max(0.2, Math.min(0.8, compactness));
}

/**
 * Estimate if PCA rotation would be beneficial
 * @param {Object} bounds - Bounds object
 * @returns {boolean} Whether PCA rotation is recommended
 */
function estimatePCARotation(bounds) {
    // Simple heuristic: if aspect ratio is very different from 1:1, PCA might help
    // But for most cases, default to false (let user decide)
    const aspectRatio = bounds.width / (bounds.height || 1);
    
    // If aspect ratio is very extreme (< 0.3 or > 3), PCA rotation might help
    // But we'll be conservative and default to false
    return false; // Conservative default - let user enable if needed
}

/**
 * Estimate parameters from processed data points (alternative API)
 * @param {Array} data - Array of data objects with x/y coordinates
 * @param {Object} options - Configuration options
 * @param {Function} options.xAccessor - Accessor for x coordinate
 * @param {Function} options.yAccessor - Accessor for y coordinate
 * @returns {Object} Object with estimated parameters
 */
export function estimateParametersFromData(data, options = {}) {
    const {
        xAccessor = d => d.x,
        yAccessor = d => d.y
    } = options;

    if (!data || data.length === 0) {
        throw new Error('Data array must contain at least one item');
    }

    // Extract points
    const points = data.map(d => ({
        x: xAccessor(d),
        y: yAccessor(d)
    }));

    // Calculate bounds
    const bounds = calculateBounds(points);

    // Auto-calculate grid dimensions
    const { rows, cols } = calculateAutoDimensions(points.length, bounds);

    // Estimate compactness
    const compactness = estimateCompactness(points, bounds);

    // Estimate PCA rotation
    const rotateByPCA = estimatePCARotation(bounds);

    return {
        rows,
        cols,
        compactness,
        rotateByPCA
    };
}

