/**
 * Shape Generator for Dorling Cartograms
 * Creates GeoJSON geometry for circles, hexagons, and rectangles
 */

/**
 * Generate circle coordinates
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Circle radius
 * @param {number} segments - Number of segments (default 32)
 * @returns {Array} Array of [x, y] coordinates forming a closed polygon
 */
export function createCircleCoordinates(cx, cy, radius, segments = 32) {
    const coords = [];
    
    for (let i = 0; i <= segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        coords.push([
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle)
        ]);
    }
    
    return coords;
}

/**
 * Generate flat-top hexagon coordinates
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Hexagon radius (center to vertex)
 * @returns {Array} Array of [x, y] coordinates forming a closed polygon
 */
export function createHexagonCoordinates(cx, cy, radius) {
    const coords = [];
    
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6; // Start at -30° for flat-top
        coords.push([
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle)
        ]);
    }
    
    // Close the polygon
    coords.push(coords[0].slice());
    
    return coords;
}

/**
 * Generate rectangle coordinates
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @returns {Array} Array of [x, y] coordinates forming a closed polygon
 */
export function createRectangleCoordinates(cx, cy, width, height) {
    const halfW = width / 2;
    const halfH = height / 2;
    
    return [
        [cx - halfW, cy - halfH],
        [cx + halfW, cy - halfH],
        [cx + halfW, cy + halfH],
        [cx - halfW, cy + halfH],
        [cx - halfW, cy - halfH] // Close polygon
    ];
}

/**
 * Generate square coordinates (convenience wrapper)
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} size - Square side length
 * @returns {Array} Array of [x, y] coordinates forming a closed polygon
 */
export function createSquareCoordinates(cx, cy, size) {
    return createRectangleCoordinates(cx, cy, size, size);
}

/**
 * Create a GeoJSON Feature from node data
 * @param {Object} node - Node object with position and size data
 * @param {string} shapeType - 'circle' | 'hexagon' | 'rectangle' | 'square'
 * @returns {Object} GeoJSON Feature
 */
export function createFeatureFromNode(node, shapeType = 'circle') {
    let coordinates;
    
    switch (shapeType) {
        case 'circle':
            coordinates = createCircleCoordinates(node.x, node.y, node.radius);
            break;
        case 'hexagon':
            coordinates = createHexagonCoordinates(node.x, node.y, node.radius);
            break;
        case 'square':
            // For squares, convert radius to side length (same area as circle)
            const squareSide = node.radius * Math.sqrt(Math.PI);
            coordinates = createSquareCoordinates(node.x, node.y, squareSide);
            break;
        case 'rectangle':
            coordinates = createRectangleCoordinates(
                node.x, node.y, 
                node.width || node.radius * 2, 
                node.height || node.radius * 2
            );
            break;
        default:
            coordinates = createCircleCoordinates(node.x, node.y, node.radius);
    }
    
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        properties: {
            ...node.properties,
            _cartogram: {
                originalX: node.originalX,
                originalY: node.originalY,
                x: node.x,
                y: node.y,
                radius: node.radius,
                weight: node.weight,
                shapeType: shapeType
            }
        }
    };
}

/**
 * Create GeoJSON FeatureCollection from nodes
 * @param {Array} nodes - Array of node objects
 * @param {string} shapeType - 'circle' | 'hexagon' | 'rectangle' | 'square'
 * @returns {Object} GeoJSON FeatureCollection
 */
export function createFeatureCollection(nodes, shapeType = 'circle') {
    return {
        type: 'FeatureCollection',
        features: nodes.map(node => createFeatureFromNode(node, shapeType))
    };
}

/**
 * Calculate the radius needed to represent a weight value
 * Area-proportional scaling: Area = π * r², so r = sqrt(Area / π)
 * @param {number} weight - The weight value
 * @param {number} scaleFactor - Scaling factor for the weight
 * @returns {number} The radius
 */
export function weightToRadius(weight, scaleFactor = 1) {
    // Area-proportional: radius = sqrt(weight * scaleFactor / π)
    return Math.sqrt(Math.abs(weight) * scaleFactor / Math.PI);
}

/**
 * Calculate scale factor based on bounding box and desired fill ratio
 * @param {Object} bounds - { minX, maxX, minY, maxY }
 * @param {number} maxWeight - Maximum weight value
 * @param {number} k - Fill ratio (percentage of bounding box filled by largest circle)
 * @returns {number} Scale factor
 */
export function calculateScaleFactor(bounds, maxWeight, k = 5) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const area = width * height;
    
    // k% of bounding box area should equal the largest circle's area
    // maxArea = area * k / 100
    // maxWeight * scaleFactor = maxArea
    // scaleFactor = area * k / (100 * maxWeight)
    return (area * k) / (100 * maxWeight);
}
