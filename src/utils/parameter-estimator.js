/**
 * Parameter Estimator
 * Automatically estimates optimal parameters for grid allocation from GeoJSON data
 */

import { calculateBounds } from '../normalization/bounds-calculator.js';
import { calculateAutoDimensions } from '../features/auto-dimensions.js';
import { computePolygonCentroid } from './polygon-centroid.js';
import { PCARotation } from '../features/pca-rotation.js';
import { computeAdjacencyGraph } from './adjacency-graph.js';
import { embedGraph } from './graph-embed.js';

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
        yAccessor = d => d.lat,
        // Optional: compute graph embedding for adjacency-based penalty
        computeEmbedding = false,
        embeddingOptions = {}
    } = options;

    if (!geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error('GeoJSON must contain a features array with at least one feature');
    }

    // 1. Extract centroids and bounding boxes
    const extracted = geojson.features.map((feature, fi) => {
        const geometry = feature.geometry;
        let x, y;
        // attach an id so we can map back to features for adjacency/embedding
        const id = feature.id ?? feature.properties?.id ?? String(fi);
        
        // Calculate centroid
        if (geometry.type === 'Point') {
            x = geometry.coordinates[0];
            y = geometry.coordinates[1];
        } else if (geometry.type === 'Polygon') {
            const c = computePolygonCentroid(geometry);
            if (c) {
                x = c.x;
                y = c.y;
            } else {
                const coords = geometry.coordinates[0];
                const sum = coords.reduce((acc, [lon, lat]) => ({ x: acc.x + lon, y: acc.y + lat }), { x: 0, y: 0 });
                x = sum.x / coords.length;
                y = sum.y / coords.length;
            }
        } else if (geometry.type === 'MultiPolygon') {
            const c = computePolygonCentroid(geometry);
            if (c) {
                x = c.x;
                y = c.y;
            } else {
                const coords = geometry.coordinates[0][0];
                const sum = coords.reduce((acc, [lon, lat]) => ({ x: acc.x + lon, y: acc.y + lat }), { x: 0, y: 0 });
                x = sum.x / coords.length;
                y = sum.y / coords.length;
            }
        } else {
            // Fallback for other types
            x = 0; y = 0;
        }

        // Calculate feature bounds
        const bounds = getFeatureBounds(feature);
        
        return { id, x, y, bounds };
    });

    const points = extracted.map(d => ({ x: d.x, y: d.y }));
    
    // Calculate global bounds from feature bounds (more accurate than centroid bounds)
    const globalBounds = {
        minX: Math.min(...extracted.map(d => d.bounds.minX)),
        maxX: Math.max(...extracted.map(d => d.bounds.maxX)),
        minY: Math.min(...extracted.map(d => d.bounds.minY)),
        maxY: Math.max(...extracted.map(d => d.bounds.maxY))
    };
    globalBounds.width = globalBounds.maxX - globalBounds.minX;
    globalBounds.height = globalBounds.maxY - globalBounds.minY;

    // 2. PCA Rotation Decision
    // We check if rotating the data aligns it better with the axes (smaller bounding box area)
    const pcaAngle = PCARotation.computeAngle(points);
    
    // Calculate global centroid for rotation
    const globalCentroid = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length
    };

    // Rotate points to check distribution
    const rotatedPoints = PCARotation.rotate(points, -pcaAngle, globalCentroid);
    const rotatedPointsBounds = calculateBounds(rotatedPoints);
    const pointsBounds = calculateBounds(points);

    // Rotate feature bounds to check true extent
    // We approximate this by rotating the 4 corners of each feature's bbox
    const rotatedExtents = extracted.map(d => {
        const corners = [
            { x: d.bounds.minX, y: d.bounds.minY },
            { x: d.bounds.maxX, y: d.bounds.minY },
            { x: d.bounds.maxX, y: d.bounds.maxY },
            { x: d.bounds.minX, y: d.bounds.maxY }
        ];
        const rotatedCorners = PCARotation.rotate(corners, -pcaAngle, globalCentroid);
        return calculateBounds(rotatedCorners);
    });

    const rotatedGlobalBounds = {
        minX: Math.min(...rotatedExtents.map(d => d.minX)),
        maxX: Math.max(...rotatedExtents.map(d => d.maxX)),
        minY: Math.min(...rotatedExtents.map(d => d.minY)),
        maxY: Math.max(...rotatedExtents.map(d => d.maxY))
    };
    rotatedGlobalBounds.width = rotatedGlobalBounds.maxX - rotatedGlobalBounds.minX;
    rotatedGlobalBounds.height = rotatedGlobalBounds.maxY - rotatedGlobalBounds.minY;

    // Decision logic
    const areaOriginal = globalBounds.width * globalBounds.height;
    const areaRotated = rotatedGlobalBounds.width * rotatedGlobalBounds.height;
    
    const aspectOriginal = Math.max(globalBounds.width, globalBounds.height) / Math.min(globalBounds.width, globalBounds.height);
    const aspectRotated = Math.max(rotatedGlobalBounds.width, rotatedGlobalBounds.height) / Math.min(rotatedGlobalBounds.width, rotatedGlobalBounds.height);

    const pointsAspectOriginal = Math.max(pointsBounds.width, pointsBounds.height) / Math.min(pointsBounds.width, pointsBounds.height);
    const pointsAspectRotated = Math.max(rotatedPointsBounds.width, rotatedPointsBounds.height) / Math.min(rotatedPointsBounds.width, rotatedPointsBounds.height);

    // Prefer rotation if:
    // 1. It significantly reduces the bounding box area (better fit)
    // 2. OR the original data is very elongated (high aspect ratio) and rotation preserves or improves it
    // 3. OR the rotated aspect ratio is much higher (indicating a diagonal feature like Japan becoming horizontal/vertical)
    
    let rotateByPCA = false;
    
    // If area is reduced by > 10%, rotate
    if (areaOriginal > areaRotated * 1.1) {
        rotateByPCA = true;
    } 
    // If original is somewhat square-ish but rotated is elongated (e.g. diagonal line), rotate
    else if (aspectRotated > aspectOriginal * 1.5) {
        rotateByPCA = true;
    }
    // If original is already elongated, but rotation makes it tighter
    else if (aspectOriginal > 1.5 && areaOriginal > areaRotated * 1.05) {
        rotateByPCA = true;
    }
    // Check points aspect ratio as well (centroids might align better than inflated bboxes)
    else if (pointsAspectRotated > pointsAspectOriginal * 1.5) {
        rotateByPCA = true;
    }

    // 3. Grid Dimensions
    const activeBounds = rotateByPCA ? rotatedPointsBounds : pointsBounds;
    const rawRatio = activeBounds.height / Math.max(activeBounds.width, 1e-9);
    const elongation = Math.max(activeBounds.width, activeBounds.height) /
        Math.max(1e-9, Math.min(activeBounds.width, activeBounds.height));

    const slackBase = rotateByPCA ? 0.55 : 0.35;
    const maxSlack = rotateByPCA ? 1.6 : 1.0;
    const slack = Math.min(maxSlack, Math.max(0, (elongation - 1.3) * slackBase));

    const mapArea = Math.max(globalBounds.width * globalBounds.height, 1e-9);
    const totalFeatureArea = extracted.reduce((sum, d) => sum + d.bounds.area, 0);
    const coverageRatio = Math.min(1, totalFeatureArea / mapArea);
    const coverageBoost = Math.max(0, coverageRatio - 0.35);

    // Adaptively soften the aspect ratio. Highly elongated maps should keep their shape,
    // while dense compact maps can be nudged toward a squarer starter grid.
    const rawLogRatio = Math.log(Math.max(rawRatio, 1e-9));
    let logCompression = rotateByPCA ? 0.85 : 0.75;
    if (elongation > 2.2) logCompression += 0.08;
    if (elongation > 3.5) logCompression += 0.05;
    if (coverageRatio > 0.55 && points.length < 90) logCompression -= 0.08;
    logCompression = Math.max(0.65, Math.min(0.98, logCompression));

    let ratioOverride = Math.exp(rawLogRatio * logCompression);
    const minRatio = elongation > 4 ? 0.18 : (elongation > 2.5 ? 0.24 : 0.3);
    const maxRatio = 1 / minRatio;
    ratioOverride = Math.max(minRatio, Math.min(maxRatio, ratioOverride));

    // For small, very compact datasets (like contiguous boroughs), nudge mildly toward square.
    // Keep this gentle so elongated chains (Japan/Chile-like) are not over-corrected.
    if (points.length < 50 && coverageBoost > 0.25 && elongation < 1.9) {
        ratioOverride = ratioOverride * 0.7 + 0.3 * 0.85;
    }

    const adjacencyStats = computeAdjacencyStats(extracted);
    // Reduce adjacency influence (very connected boroughs should not blow up cols)
    let adjacencyBoost = Math.max(0, (adjacencyStats.averageDegree || 0) - 2.5) * 0.1;
    if (elongation > 2.2) adjacencyBoost *= 0.6;
    if (coverageRatio < 0.3) adjacencyBoost *= 0.7;
    const densityBoost = coverageBoost + adjacencyBoost;

    const targetCells = Math.ceil(points.length * (1 + slack + densityBoost * 0.45));

    const elongationBoost = Math.max(0, Math.log2(Math.max(elongation, 1))); // 0 when elongation <=1
    const sqrtN = Math.sqrt(points.length);
    // Reduce sensitivity to density/adjacency and keep elongation influence moderate
    const minRowsScale = 1 + 0.10 * elongationBoost + densityBoost * 0.18;
    const minColsScale = 1 + (rotateByPCA ? 0.35 : 0.18) * elongationBoost + densityBoost * 0.2;
    const minRows = Math.max(1, Math.ceil(sqrtN * minRowsScale));
    let minCols = Math.max(1, Math.ceil(sqrtN * minColsScale));
    // Cap minCols to avoid unrealistic wide grids for small datasets
    const maxColsCap = Math.max(3, Math.ceil(sqrtN * 3));
    minCols = Math.min(minCols, maxColsCap);

    const { rows, cols } = calculateAutoDimensions(points.length, activeBounds, {
        aspectRatio: ratioOverride,
        targetCellCount: targetCells,
        minRows,
        minCols
    });

    // 4. Compactness Estimation
    const compactness = estimateCompactnessAdvanced(extracted, globalBounds, {
        useAdjacency: true,
        adjacencyStats
    });

    const result = {
        rows,
        cols,
        compactness,
        rotateByPCA
    };

    // Optionally compute adjacency graph and a lightweight embedding to produce per-feature targets
    if (computeEmbedding) {
        const adj = computeAdjacencyGraph(geojson.features);
        // Embed using force-directed layout scaled into the active bounds
        const active = rotateByPCA ? rotatedGlobalBounds : globalBounds;
        const embedRaw = embedGraph(adj.nodes, adj.edges, Object.assign({ iterations: 400, width: Math.max(1e-9, active.width), height: Math.max(1e-9, active.height) }, embeddingOptions));
        // Translate embedded coordinates into map space
        const embeddingTargets = {};
        Object.keys(embedRaw).forEach(id => {
            embeddingTargets[id] = {
                x: (active.minX ?? globalBounds.minX) + embedRaw[id].x,
                y: (active.minY ?? globalBounds.minY) + embedRaw[id].y
            };
        });
        result.adjacencyGraph = adj;
        result.embeddingTargets = embeddingTargets;
    }

    return result;
}

/**
 * Calculate bounding box for a feature
 */
function getFeatureBounds(feature) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    function expand(coord) {
        if (coord[0] < minX) minX = coord[0];
        if (coord[0] > maxX) maxX = coord[0];
        if (coord[1] < minY) minY = coord[1];
        if (coord[1] > maxY) maxY = coord[1];
    }

    function traverse(coords) {
        if (!Array.isArray(coords)) return;
        const first = coords[0];
        if (Array.isArray(first) && first.length > 0 && typeof first[0] !== 'number') {
            coords.forEach(traverse);
            return;
        }

        if (Array.isArray(first) && typeof first[0] === 'number') {
            coords.forEach(expand);
            return;
        }

        // Handle direct coordinate pair
        if (typeof coords[0] === 'number') {
            expand(coords);
        }
    }

    traverse(feature.geometry.coordinates);

    return {
        minX, maxX, minY, maxY,
        width: maxX - minX,
        height: maxY - minY,
        area: (maxX - minX) * (maxY - minY) // Approximation using bbox area
    };
}

/**
 * Advanced Compactness Estimation
 */
function estimateCompactnessAdvanced(extractedData, bounds, options = {}) {
    const points = extractedData.map(d => ({ x: d.x, y: d.y }));
    const n = points.length;
    if (n < 2) return 0.5;

    const totalArea = bounds.width * bounds.height || 1;
    const pointsBounds = calculateBounds(points);
    const aspect = Math.max(pointsBounds.width, pointsBounds.height) /
        Math.max(1e-9, Math.min(pointsBounds.width, pointsBounds.height));

    // 1. Nearest Neighbor Index (NNI)
    // Measures clustering. < 1 is clustered, > 1 is dispersed.
    let sumMinDist = 0;
    for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
        }
        if (minDist < Infinity) sumMinDist += minDist;
    }
    
    const observedMeanDist = sumMinDist / n;
    const density = n / totalArea;
    const expectedMeanDist = 0.5 / Math.sqrt(density);
    const nni = expectedMeanDist > 0 ? observedMeanDist / expectedMeanDist : 1;

    // 2. Coverage Ratio
    // How much of the bounding box is covered by feature bboxes?
    const totalFeatureArea = extractedData.reduce((sum, d) => sum + d.bounds.area, 0);
    const coverageRatio = Math.min(1, totalFeatureArea / totalArea);

    // Base compactness — bias slightly upward for administrative/contiguous regions
    let compactness = 0.55;

    // Adjust based on NNI (clustering)
    if (nni < 0.7) {
        compactness += 0.05;
    } else if (nni > 1.2) {
        compactness -= 0.03;
    }

    // Adjust based on Coverage (dense coverage -> can be more compact)
    if (coverageRatio > 0.5) {
        compactness += 0.03;
    } else if (coverageRatio < 0.1) {
        compactness += 0.05;
    }

    // 3. Adjacency (Topology)
    if (options.useAdjacency) {
        const stats = options.adjacencyStats || computeAdjacencyStats(extractedData);
        const averageDegree = stats?.averageDegree ?? 0;
        
        if (averageDegree > 3.5) {
            compactness += 0.02;
        } else if (averageDegree < 1.5) {
            compactness += 0.03;
        }
    }

    if (aspect > 2.3) {
        const weight = Math.min(1, (aspect - 2.3) / 2.0);
        const mid = 0.5;
        compactness = mid + (compactness - mid) * (1 - weight);
        compactness = Math.max(0.45, Math.min(0.65, compactness));
    }

    return Math.max(0.35, Math.min(0.85, compactness));
}

function computeAdjacencyStats(extractedData) {
    const n = extractedData.length;
    if (n < 2) return { averageDegree: 0, maxDegree: 0 };

    const degrees = new Array(n).fill(0);
    
    // Use a small buffer for "touching"
    // Estimate buffer as a fraction of average feature size
    const avgWidth = extractedData.reduce((s, d) => s + d.bounds.width, 0) / n;
    const buffer = avgWidth * 0.05;

    for (let i = 0; i < n; i++) {
        const a = extractedData[i].bounds;
        for (let j = i + 1; j < n; j++) {
            const b = extractedData[j].bounds;
            
            // Check overlap with buffer
            const overlap = !(
                a.maxX + buffer < b.minX - buffer ||
                a.minX - buffer > b.maxX + buffer ||
                a.maxY + buffer < b.minY - buffer ||
                a.minY - buffer > b.maxY + buffer
            );

            if (overlap) {
                degrees[i]++;
                degrees[j]++;
            }
        }
    }

    const totalDegree = degrees.reduce((s, d) => s + d, 0);
    const maxDegree = Math.max(...degrees);

    return {
        averageDegree: totalDegree / n,
        maxDegree
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
 * @param {Array} points - Array of points
 * @param {Object} bounds - Bounds object
 * @returns {boolean} Whether PCA rotation is recommended
 */
function estimatePCARotation(points, bounds) {
    if (!points || points.length < 2) return false;

    // Calculate PCA angle
    const angle = PCARotation.computeAngle(points);
    
    // Rotate points
    const rotatedPoints = PCARotation.rotate(points, -angle);
    const rotatedBounds = calculateBounds(rotatedPoints);
    
    const areaOriginal = bounds.width * bounds.height;
    const areaRotated = rotatedBounds.width * rotatedBounds.height;
    
    const aspectOriginal = Math.max(bounds.width, bounds.height) / Math.min(bounds.width, bounds.height);
    const aspectRotated = Math.max(rotatedBounds.width, rotatedBounds.height) / Math.min(rotatedBounds.width, rotatedBounds.height);

    // Same logic as in estimateParameters
    if (areaOriginal > areaRotated * 1.1) return true;
    if (aspectRotated > aspectOriginal * 1.5) return true;
    if (aspectOriginal > 1.5 && areaOriginal > areaRotated * 1.05) return true;
    
    return false;
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
    const rotateByPCA = estimatePCARotation(points, bounds);

    return {
        rows,
        cols,
        compactness,
        rotateByPCA
    };
}

