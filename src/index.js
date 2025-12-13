/**
 * GridMapper - Main entry point
 * 
 * Exports the main GridMapper class and related utilities
 */

export { GridMapper } from './core/grid-mapper.js';
export { GLPKSolver } from './solvers/glpk-solver.js';
export { PCARotation } from './features/pca-rotation.js';
export { SpacerUtils } from './features/spacer-utils.js';
export { createGridGeoJson, createPointsGeoJson, projectGeoJson } from './utils/geojson-utils.js';
