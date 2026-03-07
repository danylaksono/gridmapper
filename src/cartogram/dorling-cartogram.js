/**
 * Dorling Cartogram
 * Creates non-overlapping proportional symbol cartograms
 * 
 * References:
 * - Dorling, D. (1996). Area Cartograms: Their Use and Creation. CATMOG 59.
 * - Nusrat, S. & Kobourov, S. (2016). The State of the Art in Cartograms.
 */

import { runForceSimulation, hasOverlaps } from './force-simulation.js';
import { 
    createFeatureCollection, 
    weightToRadius, 
    calculateScaleFactor 
} from './shape-generator.js';
import { computePolygonCentroid } from '../utils/polygon-centroid.js';
import { computeAdjacencyGraph } from '../utils/adjacency-graph.js';

/**
 * Create a Dorling cartogram from GeoJSON input
 * 
 * @param {Object} geojson - Input GeoJSON FeatureCollection with polygon features
 * @param {string} weightField - Property name containing the weight value
 * @param {Object} options - Configuration options
 * @returns {Object} GeoJSON FeatureCollection with cartogram shapes
 * 
 * @example
 * const cartogram = createDorlingCartogram(statesGeoJson, 'population', {
 *   shapeType: 'circle',
 *   k: 5,
 *   iterations: 1000
 * });
 */
export function createDorlingCartogram(geojson, weightField, options = {}) {
    const {
        shapeType = 'circle',       // 'circle' | 'hexagon' | 'square' | 'rectangle'
        k = 10,                      // Scale factor: % of bbox filled by largest shape
        iterations = 2000,           // Force simulation iterations (higher = better overlap resolution)
        repulsionStrength = 1.0,     // Initial repulsion force strength
        anchorStrength = 0.01,       // Strength of pull toward original position (lower = less drift back)
        preserveAdjacency = false,   // Whether to attract adjacent regions
        adjacencyStrength = 0.05,    // Strength of adjacency attraction
        coolingFactor = 0.998,       // Rate of repulsion decay per iteration
        minWeight = null,            // Minimum weight (features below are excluded)
        onProgress = null            // Progress callback: (progress: 0-1) => void
    } = options;
    
    // Validate input
    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
        throw new Error('Input must be a valid GeoJSON FeatureCollection');
    }
    
    if (!weightField) {
        throw new Error('weightField parameter is required');
    }
    
    // Filter features with valid weights
    const validFeatures = geojson.features.filter(f => {
        const weight = getNestedProperty(f.properties, weightField);
        if (weight === undefined || weight === null || isNaN(weight)) {
            return false;
        }
        if (minWeight !== null && weight < minWeight) {
            return false;
        }
        return weight > 0;
    });
    
    if (validFeatures.length === 0) {
        throw new Error(`No features with valid positive weight values found for field "${weightField}"`);
    }
    
    // Extract centroids, weights, and build nodes
    const nodes = validFeatures.map((feature, index) => {
        // computePolygonCentroid expects a geometry object, not a feature
        const centroidResult = computePolygonCentroid(feature.geometry);
        
        if (!centroidResult) {
            throw new Error(`Could not compute centroid for feature at index ${index}`);
        }
        
        const weight = getNestedProperty(feature.properties, weightField);
        
        return {
            index,
            x: centroidResult.x,
            y: centroidResult.y,
            originalX: centroidResult.x,
            originalY: centroidResult.y,
            weight: weight,
            properties: { ...feature.properties },
            feature: feature
        };
    });
    
    // Calculate bounds
    const bounds = calculateBounds(nodes);
    
    // Normalize coordinates to unit space for better force simulation
    // This helps when working with geographic coordinates
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const scale = Math.max(width, height);
    
    // Normalize node positions to [0, 1] range
    nodes.forEach(node => {
        node.x = (node.x - bounds.minX) / scale;
        node.y = (node.y - bounds.minY) / scale;
        node.originalX = node.x;
        node.originalY = node.y;
    });
    
    // Calculate normalized bounds for scale factor calculation
    const normalizedBounds = {
        minX: 0,
        maxX: width / scale,
        minY: 0,
        maxY: height / scale
    };
    
    // Calculate scale factor and radii
    const maxWeight = Math.max(...nodes.map(n => n.weight));
    const scaleFactor = calculateScaleFactor(normalizedBounds, maxWeight, k);
    
    nodes.forEach(node => {
        node.radius = weightToRadius(node.weight, scaleFactor);
        // For rectangular shapes, also set width/height
        if (shapeType === 'rectangle' || shapeType === 'square') {
            const side = node.radius * Math.sqrt(Math.PI);
            node.width = side;
            node.height = side;
        }
    });
    
    // Compute adjacency edges if needed
    let edges = [];
    if (preserveAdjacency) {
        // computeAdjacencyGraph expects an array of features (or feature-like objects)
        const adjacencyResult = computeAdjacencyGraph(validFeatures);
        edges = adjacencyResult.edges.map(e => [e.i, e.j]);
    }
    
    // Run force simulation
    runForceSimulation(nodes, {
        iterations,
        shapeType,
        repulsionStrength,
        anchorStrength,
        adjacencyStrength,
        edges,
        coolingFactor,
        onProgress
    });
    
    // Denormalize coordinates back to original coordinate space
    nodes.forEach(node => {
        node.x = node.x * scale + bounds.minX;
        node.y = node.y * scale + bounds.minY;
        node.radius = node.radius * scale;
        if (shapeType === 'rectangle' || shapeType === 'square') {
            node.width = node.width * scale;
            node.height = node.height * scale;
        }
    });
    
    // Check for remaining overlaps
    const stillHasOverlaps = hasOverlaps(nodes, shapeType);
    
    // Create output GeoJSON
    const result = createFeatureCollection(nodes, shapeType);
    
    // Add metadata
    result.metadata = {
        weightField,
        shapeType,
        k,
        iterations,
        featureCount: nodes.length,
        hasOverlaps: stillHasOverlaps,
        bounds: bounds,
        scaleFactor
    };
    
    return result;
}

/**
 * Create a Demers cartogram (squares with adjacency preservation)
 * Convenience wrapper around createDorlingCartogram
 * 
 * @param {Object} geojson - Input GeoJSON FeatureCollection
 * @param {string} weightField - Property name containing the weight value
 * @param {Object} options - Configuration options
 * @returns {Object} GeoJSON FeatureCollection with square shapes
 */
export function createDemersCartogram(geojson, weightField, options = {}) {
    return createDorlingCartogram(geojson, weightField, {
        shapeType: 'square',
        preserveAdjacency: true,
        adjacencyStrength: 0.1,
        anchorStrength: 0.01,  // Lower anchor for more contiguity
        ...options
    });
}

/**
 * Get bounds from nodes
 * @param {Array} nodes - Array of node objects with x, y properties
 * @returns {Object} { minX, maxX, minY, maxY }
 */
function calculateBounds(nodes) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const node of nodes) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.y > maxY) maxY = node.y;
    }
    
    return { minX, maxX, minY, maxY };
}

/**
 * Convert adjacency graph to edge list for force simulation
 * @param {Map} adjacencyGraph - Map from computeAdjacencyGraph
 * @param {Array} nodes - Array of node objects
 * @returns {Array} Array of [sourceIndex, targetIndex] pairs
 */
function adjacencyGraphToEdges(adjacencyGraph, nodes) {
    const edges = [];
    const seen = new Set();
    
    // Build index lookup from feature properties
    // Assumes nodes have same order as original features
    adjacencyGraph.forEach((neighbors, featureIndex) => {
        neighbors.forEach(neighborIndex => {
            const edgeKey = [featureIndex, neighborIndex].sort().join('-');
            if (!seen.has(edgeKey)) {
                seen.add(edgeKey);
                edges.push([featureIndex, neighborIndex]);
            }
        });
    });
    
    return edges;
}

/**
 * Get nested property from object using dot notation
 * @param {Object} obj - The object to extract from
 * @param {string} path - Property path (e.g., 'properties.population')
 * @returns {*} The property value or undefined
 */
function getNestedProperty(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[part];
    }
    
    return current;
}

/**
 * DorlingCartogram class for OOP-style usage
 */
export class DorlingCartogram {
    constructor(options = {}) {
        this.options = {
            shapeType: 'circle',
            k: 10,
            iterations: 2000,
            repulsionStrength: 1.0,
            anchorStrength: 0.01,
            preserveAdjacency: false,
            adjacencyStrength: 0.05,
            coolingFactor: 0.998,
            ...options
        };
    }
    
    /**
     * Create cartogram from GeoJSON
     * @param {Object} geojson - Input GeoJSON FeatureCollection
     * @param {string} weightField - Property name for weight values
     * @param {Object} options - Override options
     * @returns {Object} Output GeoJSON FeatureCollection
     */
    create(geojson, weightField, options = {}) {
        return createDorlingCartogram(geojson, weightField, {
            ...this.options,
            ...options
        });
    }
    
    /**
     * Set shape type
     * @param {string} type - 'circle' | 'hexagon' | 'square' | 'rectangle'
     * @returns {DorlingCartogram} this for chaining
     */
    setShapeType(type) {
        this.options.shapeType = type;
        return this;
    }
    
    /**
     * Set scale factor
     * @param {number} k - Scale factor (% of bbox for largest shape)
     * @returns {DorlingCartogram} this for chaining
     */
    setScale(k) {
        this.options.k = k;
        return this;
    }
    
    /**
     * Enable/disable adjacency preservation
     * @param {boolean} preserve - Whether to preserve adjacency
     * @param {number} strength - Adjacency attraction strength
     * @returns {DorlingCartogram} this for chaining
     */
    setAdjacencyPreservation(preserve, strength = 0.05) {
        this.options.preserveAdjacency = preserve;
        this.options.adjacencyStrength = strength;
        return this;
    }
    
    /**
     * Set simulation iterations
     * @param {number} iterations - Number of force simulation iterations
     * @returns {DorlingCartogram} this for chaining
     */
    setIterations(iterations) {
        this.options.iterations = iterations;
        return this;
    }
}
