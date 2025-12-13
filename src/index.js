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
