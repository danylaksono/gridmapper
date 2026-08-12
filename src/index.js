/**
 * GridMapper - Main entry point
 * 
 * Exports the main GridMapper class and related utilities
 */

export { GridMapper } from './core/grid-mapper.js';
export { GLPKSolver } from './solvers/glpk-solver.js';
export { PCARotation } from './features/pca-rotation.js';
export { SpacerUtils } from './features/spacer-utils.js';
export { calculateAutoDimensions } from './features/auto-dimensions.js';
export { estimateParameters, estimateParametersFromData } from './utils/parameter-estimator.js';
export { computePolygonCentroid } from './utils/polygon-centroid.js';
export { createGridGeoJson, createPointsGeoJson, projectGeoJson } from './utils/geojson-utils.js';
export { computeAdjacencyGraph } from './utils/adjacency-graph.js';
export { embedGraph } from './utils/graph-embed.js';

// Hierarchical / nested allocation (grid-in-grid)
export { allocateHierarchical } from './hierarchy/hierarchical-allocator.js';
export { buildHierarchy, flattenLeaves, subtreeLeafCount } from './hierarchy/hierarchy-tree.js';
export { gridTreemap, rectArea } from './hierarchy/grid-treemap.js';
export { packLeavesIntoBlock } from './hierarchy/footprint-packer.js';

// Dorling/Demers Cartogram exports
export { 
    createDorlingCartogram, 
    createDemersCartogram, 
    DorlingCartogram 
} from './cartogram/dorling-cartogram.js';
export { 
    runForceSimulation, 
    applyPairwiseRepulsion,
    applyPositionAnchor,
    applyAdjacencyAttraction 
} from './cartogram/force-simulation.js';
export {
    createCircleCoordinates,
    createHexagonCoordinates,
    createRectangleCoordinates,
    createSquareCoordinates,
    weightToRadius,
    calculateScaleFactor
} from './cartogram/shape-generator.js';
