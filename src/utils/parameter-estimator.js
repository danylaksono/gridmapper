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
        enableDimensionSearch = true,
        // Optional: compute graph embedding for adjacency-based penalty
        computeEmbedding = false,
        embeddingOptions = {}
    } = options;

    if (!geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error('GeoJSON must contain a features array with at least one feature');
    }

    // 1. Extract centroids and geometry descriptors
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

        // Calculate feature bounds + geometry descriptors
        const bounds = getFeatureBounds(feature);
        const geomStats = getFeatureGeometryStats(feature);
        
        return {
            id,
            x,
            y,
            bounds,
            geomArea: geomStats.area,
            geomPerimeter: geomStats.perimeter,
            circularity: geomStats.circularity,
            holeArea: geomStats.holeArea
        };
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

    const directional = computeDirectionalIndicators(points, pcaAngle);
    const geoIndicators = computeGeoIndicators(extracted, geojson.features);

    // Decision logic
    const areaOriginal = globalBounds.width * globalBounds.height;
    const areaRotated = rotatedGlobalBounds.width * rotatedGlobalBounds.height;
    const areaGain = areaOriginal / Math.max(areaRotated, 1e-9);
    const pointsAreaGain =
        (pointsBounds.width * pointsBounds.height) /
        Math.max(rotatedPointsBounds.width * rotatedPointsBounds.height, 1e-9);
    
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

    // Keep diagonal mental-map orientation for strongly linear chains unless PCA gives
    // a very large packing improvement. This helps Japan/Chile-like geographies.
    const diagonalChain = directional.linearity > 0.52 &&
        directional.diagonality > 0.55 &&
        pointsAspectRotated > 2.2;

    if (rotateByPCA && diagonalChain && pointsAreaGain < 1.1) {
        rotateByPCA = false;
    }

    // 3. Grid Dimensions
    const activeBounds = rotateByPCA ? rotatedPointsBounds : pointsBounds;
    const intrinsicRatio = rotatedPointsBounds.height / Math.max(rotatedPointsBounds.width, 1e-9);
    let rawRatio = activeBounds.height / Math.max(activeBounds.width, 1e-9);
    const intrinsicElongation = Math.max(rotatedPointsBounds.width, rotatedPointsBounds.height) /
        Math.max(1e-9, Math.min(rotatedPointsBounds.width, rotatedPointsBounds.height));
    let elongation = Math.max(activeBounds.width, activeBounds.height) /
        Math.max(1e-9, Math.min(activeBounds.width, activeBounds.height));

    // If we preserve diagonal orientation (no PCA rotation), still let dimensions reflect
    // the intrinsic chain-like spread measured in PCA space.
    if (!rotateByPCA && diagonalChain) {
        rawRatio = Math.min(rawRatio, intrinsicRatio * 1.05);
        elongation = Math.max(elongation, intrinsicElongation);
    }

    const slackBase = rotateByPCA ? 0.55 : 0.35;
    const maxSlack = rotateByPCA ? 1.6 : 1.0;
    const slack = Math.min(maxSlack, Math.max(0, (elongation - 1.3) * slackBase));

    const mapArea = Math.max(globalBounds.width * globalBounds.height, 1e-9);
    const totalFeatureArea = extracted.reduce((sum, d) => sum + (d.geomArea || d.bounds.area), 0);
    const coverageRatio = Math.min(1, totalFeatureArea / mapArea);
    const coverageBoost = Math.max(0, coverageRatio - 0.35);
    const featureCircularityMedian = median(
        extracted
            .map(d => d.circularity)
            .filter(v => Number.isFinite(v) && v > 0)
    );
    const holeRatio = geoIndicators.holeRatio;
    const occupancyRatio = geoIndicators.occupancyRatio;
    const componentCount = geoIndicators.componentCount;
    const componentPenalty = Math.max(0, componentCount - 1) / Math.max(1, Math.sqrt(points.length));
    const sparsityIndex = geoIndicators.sparsityIndex;

    // Adaptively soften the aspect ratio. Highly elongated maps should keep their shape,
    // while dense compact maps can be nudged toward a squarer starter grid.
    const rawLogRatio = Math.log(Math.max(rawRatio, 1e-9));
    let logCompression = rotateByPCA ? 0.85 : 0.75;
    if (!rotateByPCA && diagonalChain) logCompression = 0.96;
    if (elongation > 2.2) logCompression += 0.08;
    if (elongation > 3.5) logCompression += 0.05;
    if (coverageRatio > 0.55 && points.length < 90) logCompression -= 0.08;
    if (sparsityIndex > 0.45) logCompression += 0.04;
    if (holeRatio > 0.1) logCompression += 0.03;
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

    if (!diagonalChain && !rotateByPCA && coverageRatio > 0.32 && elongation < 1.8) {
        ratioOverride = ratioOverride * 0.55 + 0.45 * 0.9;
    }

    const adjacencyStats = geoIndicators.adjacencyStats;
    // Reduce adjacency influence (very connected boroughs should not blow up cols)
    let adjacencyBoost = Math.max(0, (adjacencyStats.averageDegree || 0) - 2.5) * 0.1;
    if (elongation > 2.2) adjacencyBoost *= 0.6;
    if (coverageRatio < 0.3) adjacencyBoost *= 0.7;
    if (featureCircularityMedian > 0.45) adjacencyBoost *= 0.85;
    const densityBoost = coverageBoost + adjacencyBoost;
    const sparseBoost = Math.max(0, sparsityIndex - 0.35);
    const occupancyBoost = Math.max(0, 0.32 - occupancyRatio);

    let targetCells = Math.ceil(points.length * (1 + slack + densityBoost * 0.45));
    targetCells = Math.ceil(targetCells * (1 + sparseBoost * 0.35 + occupancyBoost * 0.25 + componentPenalty * 0.4 + holeRatio * 0.2));

    // Compact contiguous datasets tend to be over-expanded; trim budget slightly.
    if (coverageRatio > 0.45 && elongation < 1.8 && featureCircularityMedian > 0.35) {
        targetCells = Math.max(points.length, Math.ceil(targetCells * 0.96));
    }

    if (!diagonalChain && !rotateByPCA && directional.diagonality < 0.35 && coverageRatio > 0.22 && elongation < 1.9) {
        targetCells = Math.max(points.length, Math.ceil(targetCells * 0.92));
    }

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

    let { rows, cols } = calculateAutoDimensions(points.length, activeBounds, {
        aspectRatio: ratioOverride,
        targetCellCount: targetCells,
        minRows,
        minCols
    });

    // Rebalance compact contiguous maps toward less skewed grids.
    if (!diagonalChain && !rotateByPCA && coverageRatio > 0.5 && elongation < 2.5) {
        while (
            (cols - rows) > 1 &&
            ((rows + 1) * (cols - 1)) >= points.length
        ) {
            rows += 1;
            cols -= 1;
        }
    }

    if (enableDimensionSearch) {
        const refined = refineDimensionsWithCandidateSearch({
            baseRows: rows,
            baseCols: cols,
            n: points.length,
            targetCells,
            targetAspect: ratioOverride,
            minRows,
            minCols,
            diagonalChain,
            coverageRatio,
            sparsityIndex,
            elongation
        });
        rows = refined.rows;
        cols = refined.cols;
    }

    // 4. Compactness Estimation
    const compactness = estimateCompactnessAdvanced(extracted, globalBounds, {
        useAdjacency: true,
        adjacencyStats,
        holeRatio,
        sparsityIndex,
        occupancyRatio,
        componentCount
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

function getFeatureGeometryStats(feature) {
    const geometry = feature?.geometry;
    if (!geometry) {
        return { area: 0, perimeter: 0, circularity: 0 };
    }

    if (geometry.type === 'Polygon') {
        const stats = polygonStats(geometry.coordinates);
        return {
            area: stats.area,
            perimeter: stats.perimeter,
            circularity: stats.circularity,
            holeArea: stats.holeArea
        };
    }

    if (geometry.type === 'MultiPolygon') {
        let area = 0;
        let perimeter = 0;
        let holeArea = 0;
        geometry.coordinates.forEach(polygon => {
            const stats = polygonStats(polygon);
            area += stats.area;
            perimeter += stats.perimeter;
            holeArea += stats.holeArea;
        });
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        return { area, perimeter, circularity, holeArea };
    }

    return { area: 0, perimeter: 0, circularity: 0, holeArea: 0 };
}

function polygonStats(rings) {
    if (!Array.isArray(rings) || rings.length === 0) {
        return { area: 0, perimeter: 0, circularity: 0, holeArea: 0 };
    }

    let area = 0;
    let perimeter = 0;
    let holeArea = 0;

    rings.forEach((ring, idx) => {
        const signedArea = ringSignedArea(ring);
        const ringArea = Math.abs(signedArea);
        const ringPerimeter = ringLength(ring);

        // GeoJSON Polygon: ring[0] shell, subsequent rings are holes.
        if (idx === 0) {
            area += ringArea;
        } else {
            area -= ringArea;
            holeArea += ringArea;
        }
        perimeter += ringPerimeter;
    });

    area = Math.max(0, area);
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
    return {
        area,
        perimeter,
        circularity: Math.max(0, Math.min(1, circularity)),
        holeArea: Math.max(0, holeArea)
    };
}

function ringSignedArea(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        sum += (a[0] * b[1]) - (b[0] * a[1]);
    }
    return Math.abs(sum) * 0.5;
}

function ringLength(ring) {
    if (!Array.isArray(ring) || ring.length < 2) return 0;
    let len = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
}

function computeDirectionalIndicators(points, pcaAngle) {
    if (!points || points.length < 2) {
        return { linearity: 0, diagonality: 0 };
    }

    const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    let cxx = 0;
    let cyy = 0;
    let cxy = 0;

    points.forEach(p => {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        cxx += dx * dx;
        cyy += dy * dy;
        cxy += dx * dy;
    });

    cxx /= points.length;
    cyy /= points.length;
    cxy /= points.length;

    const trace = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const disc = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
    const lambda1 = trace * 0.5 + disc;
    const lambda2 = trace * 0.5 - disc;
    const linearity = (lambda1 + lambda2) > 1e-9 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;

    const axisAngle = normalizeToHalfPi(Math.abs(pcaAngle));
    const axisDist = Math.min(axisAngle, Math.abs((Math.PI / 2) - axisAngle));
    const diagonality = Math.sin(axisDist * 2);

    return {
        linearity: Math.max(0, Math.min(1, linearity)),
        diagonality: Math.max(0, Math.min(1, diagonality))
    };
}

function normalizeToHalfPi(angle) {
    let a = angle % Math.PI;
    if (a < 0) a += Math.PI;
    if (a > Math.PI / 2) a = Math.PI - a;
    return a;
}

function median(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function refineDimensionsWithCandidateSearch(params) {
    const {
        baseRows,
        baseCols,
        n,
        targetCells,
        targetAspect,
        minRows,
        minCols,
        diagonalChain,
        coverageRatio,
        sparsityIndex,
        elongation
    } = params;

    const candidates = generateDimensionCandidates({
        baseRows,
        baseCols,
        n,
        targetCells,
        targetAspect,
        minRows,
        minCols
    });

    const compactMap = coverageRatio > 0.48 && elongation < 2.4 && !diagonalChain;
    const sparseMap = sparsityIndex > 0.32;

    let best = { rows: baseRows, cols: baseCols };
    let bestScore = scoreDimensionCandidate(best, {
        targetCells,
        targetAspect,
        n,
        compactMap,
        diagonalChain,
        sparseMap
    });

    candidates.forEach(candidate => {
        const score = scoreDimensionCandidate(candidate, {
            targetCells,
            targetAspect,
            n,
            compactMap,
            diagonalChain,
            sparseMap
        });
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    });

    return best;
}

function generateDimensionCandidates(params) {
    const {
        baseRows,
        baseCols,
        n,
        targetCells,
        targetAspect,
        minRows,
        minCols
    } = params;

    const set = new Map();
    const add = (rows, cols) => {
        if (!Number.isFinite(rows) || !Number.isFinite(cols)) return;
        rows = Math.max(minRows, Math.round(rows));
        cols = Math.max(minCols, Math.round(cols));
        if (rows < 1 || cols < 1) return;
        if (rows * cols < n) return;
        const key = `${rows}x${cols}`;
        if (!set.has(key)) {
            set.set(key, { rows, cols });
        }
    };

    add(baseRows, baseCols);

    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            add(baseRows + dr, baseCols + dc);
        }
    }

    const safeAspect = Math.max(1e-6, targetAspect);
    const colsFromAspect = Math.max(minCols, Math.round(Math.sqrt(Math.max(targetCells, n) / safeAspect)));
    const rowsFromAspect = Math.max(minRows, Math.ceil(Math.max(targetCells, n) / colsFromAspect));
    add(rowsFromAspect, colsFromAspect);
    add(rowsFromAspect - 1, colsFromAspect + 1);
    add(rowsFromAspect + 1, colsFromAspect - 1);
    add(rowsFromAspect + 1, colsFromAspect + 1);

    return Array.from(set.values());
}

function scoreDimensionCandidate(candidate, params) {
    const {
        targetCells,
        targetAspect,
        n,
        compactMap,
        diagonalChain,
        sparseMap
    } = params;

    const rows = candidate.rows;
    const cols = candidate.cols;
    const cells = rows * cols;
    const ratio = rows / Math.max(cols, 1e-9);
    const safeTargetAspect = Math.max(1e-9, targetAspect);

    const aspectError = Math.abs(Math.log(Math.max(ratio, 1e-9) / safeTargetAspect));
    const cellError = Math.abs(cells - targetCells) / Math.max(1, targetCells);
    const excessCells = Math.max(0, cells - targetCells) / Math.max(1, targetCells);
    const imbalance = Math.abs(cols - rows) / Math.max(1, Math.sqrt(n));

    let score = 0;
    score += aspectError * 0.6;
    score += cellError * 0.28;
    score += excessCells * 0.12;

    if (compactMap) {
        score += Math.max(0, imbalance - 0.35) * 0.35;
    }

    if (diagonalChain) {
        const chainPenalty = Math.max(0, ratio - Math.min(0.75, safeTargetAspect * 1.25));
        score += chainPenalty * 0.8;
    }

    if (sparseMap) {
        score += Math.max(0, ratio - 0.78) * 0.3;
    }

    return score;
}

function computeGeoIndicators(extractedData, features) {
    const points = extractedData.map(d => ({ x: d.x, y: d.y }));
    const adjacencyStats = computeHybridAdjacencyStats(extractedData, features, points);

    const totalFeatureArea = extractedData.reduce((sum, d) => sum + (d.geomArea || 0), 0);
    const totalHoleArea = extractedData.reduce((sum, d) => sum + (d.holeArea || 0), 0);
    const hullArea = computeConvexHullArea(points);

    const occupancyRatio = hullArea > 1e-9 ? Math.min(1, totalFeatureArea / hullArea) : 1;
    const holeRatio = totalFeatureArea > 1e-9 ? Math.min(0.95, totalHoleArea / totalFeatureArea) : 0;
    const componentCount = Math.max(1, adjacencyStats.topologyComponents || 1);

    const sparsityIndex = Math.max(
        0,
        Math.min(
            1,
            0.5 * (1 - occupancyRatio) +
            0.25 * Math.min(1, holeRatio * 3) +
            0.25 * Math.min(1, (componentCount - 1) / Math.max(1, Math.sqrt(points.length)))
        )
    );

    return {
        adjacencyStats,
        holeRatio,
        occupancyRatio,
        componentCount,
        sparsityIndex
    };
}

function computeHybridAdjacencyStats(extractedData, features, points) {
    const n = extractedData.length;
    if (n < 2) return { averageDegree: 0, maxDegree: 0, topologyComponents: 1 };

    const idToIndex = new Map();
    extractedData.forEach((d, i) => idToIndex.set(String(d.id), i));

    const topology = computeAdjacencyGraph(features, { bufferFraction: 0.015 });
    const edgeSet = new Set();
    const degrees = new Array(n).fill(0);

    const addEdge = (a, b) => {
        if (a === b) return;
        const i = Math.min(a, b);
        const j = Math.max(a, b);
        const key = `${i}|${j}`;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        degrees[i] += 1;
        degrees[j] += 1;
    };

    topology.edges.forEach(edge => {
        const i = edge.i ?? idToIndex.get(String(edge.source));
        const j = edge.j ?? idToIndex.get(String(edge.target));
        if (Number.isInteger(i) && Number.isInteger(j)) {
            addEdge(i, j);
        }
    });

    // Add proximity edges as soft neighborhood links (Delaunay-like fallback
    // based on mutual nearest neighbors + distance pruning).
    if (points.length >= 3) {
        const candidateEdges = buildProximityEdges(points, 4);
        const lengths = candidateEdges.map(edge => edge.dist);
        const medianLen = median(lengths);
        const maxKeep = Math.max(1e-9, medianLen * 2.2);

        candidateEdges
            .filter(edge => edge.dist <= maxKeep)
            .forEach(edge => addEdge(edge.i, edge.j));
    }

    const totalDegree = degrees.reduce((sum, d) => sum + d, 0);
    const maxDegree = Math.max(...degrees);
    const topologyComponents = countGraphComponents(n, topology.edges, idToIndex);

    return {
        averageDegree: totalDegree / n,
        maxDegree,
        topologyComponents
    };
}

function countGraphComponents(n, edges, idToIndex) {
    if (n <= 0) return 0;
    const neighbors = Array.from({ length: n }, () => []);

    edges.forEach(edge => {
        const i = edge.i ?? idToIndex.get(String(edge.source));
        const j = edge.j ?? idToIndex.get(String(edge.target));
        if (!Number.isInteger(i) || !Number.isInteger(j) || i === j) return;
        neighbors[i].push(j);
        neighbors[j].push(i);
    });

    const seen = new Array(n).fill(false);
    let components = 0;

    for (let i = 0; i < n; i++) {
        if (seen[i]) continue;
        components += 1;
        const stack = [i];
        seen[i] = true;
        while (stack.length > 0) {
            const node = stack.pop();
            neighbors[node].forEach(next => {
                if (!seen[next]) {
                    seen[next] = true;
                    stack.push(next);
                }
            });
        }
    }

    return components;
}

function computeConvexHullArea(points) {
    if (!points || points.length < 3) return 0;
    const hull = convexHull(points);
    if (!hull || hull.length < 3) return 0;

    let area2 = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        area2 += a.x * b.y - b.x * a.y;
    }

    return Math.abs(area2) * 0.5;
}

function buildProximityEdges(points, k = 4) {
    const n = points.length;
    if (n < 2) return [];

    const neighborLists = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
        const distances = [];
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            distances.push({ j, dist });
        }

        distances.sort((a, b) => a.dist - b.dist);
        neighborLists[i] = distances.slice(0, Math.max(1, Math.min(k, n - 1)));
    }

    const edgeMap = new Map();
    const addCandidate = (i, j, dist) => {
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const key = `${a}|${b}`;
        const prev = edgeMap.get(key);
        if (!prev || dist < prev.dist) {
            edgeMap.set(key, { i: a, j: b, dist });
        }
    };

    for (let i = 0; i < n; i++) {
        neighborLists[i].forEach(({ j, dist }) => {
            addCandidate(i, j, dist);

            // Prefer mutual-neighbor links (closer to planar local neighborhoods).
            const reciprocal = neighborLists[j].some(entry => entry.j === i);
            if (reciprocal) addCandidate(i, j, dist);
        });
    }

    return Array.from(edgeMap.values());
}

function convexHull(points) {
    const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    if (sorted.length <= 1) return sorted;

    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    sorted.forEach(p => {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    });

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
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
    const totalFeatureArea = extractedData.reduce((sum, d) => sum + (d.geomArea || d.bounds.area), 0);
    const coverageRatio = Math.min(1, totalFeatureArea / totalArea);
    const holeRatio = options.holeRatio ?? 0;
    const sparsityIndex = options.sparsityIndex ?? 0;
    const occupancyRatio = options.occupancyRatio ?? 1;
    const componentCount = options.componentCount ?? 1;

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

    // Sparse / holed / multi-component geographies should preserve positional structure more.
    if (sparsityIndex > 0.45) {
        compactness -= 0.07;
    } else if (sparsityIndex > 0.3) {
        compactness -= 0.04;
    }

    if (holeRatio > 0.12) {
        compactness -= 0.04;
    }

    if (occupancyRatio < 0.32) {
        compactness -= 0.03;
    }

    if (componentCount > 1) {
        compactness -= Math.min(0.06, (componentCount - 1) * 0.015);
    }

    // 3. Adjacency (Topology)
    if (options.useAdjacency) {
        const stats = options.adjacencyStats || computeAdjacencyStats(extractedData);
        const averageDegree = stats?.averageDegree ?? 0;
        
        if (averageDegree > 4.0) {
            compactness += 0.02;
        } else if (averageDegree < 1.5) {
            compactness += 0.01;
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

