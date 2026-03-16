// Import GridMapper and GLPK solver from local `src/index.js` ES module
import { GridMapper, GLPKSolver, createGridGeoJson, estimateParameters, computePolygonCentroid, computeAdjacencyGraph } from '../src/index.js';
import glpk from 'https://cdn.jsdelivr.net/npm/glpk.js@4.0.2/dist/index.js';

// Initialize
let glpkInstance = null;
let londonData = null;
let originalBounds = null;
let currentResult = null;
let currentGridType = 'rect';
let currentGeoJson = null;
let currentSourceFileName = 'london.geojson';
let isUsingDefaultData = true;
let isUpdatingParameters = false; // Flag to prevent recursive updates

// Shared map interaction state so both maps stay synchronized.
let currentSharedTransform = d3.zoomIdentity;
let originalMapSyncApi = null;
let gridMapSyncApi = null;
let isSyncingMaps = false;
let linkedHoverKey = null;

// UI elements
const compactnessSlider = document.getElementById('compactness');
const compactnessValue = document.getElementById('compactness-value');
const gridTypeSelect = document.getElementById('grid-type');
const distanceMetricSelect = document.getElementById('distance-metric');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const rowsSlider = document.getElementById('rows-slider');
const colsSlider = document.getElementById('cols-slider');
const rotatePCAInput = document.getElementById('rotate-pca');
const statusText = document.getElementById('status-text');
const statFeatureCount = document.getElementById('stat-feature-count');
const statGridSize = document.getElementById('stat-grid-size');
const statScore = document.getElementById('stat-score');
const statMode = document.getElementById('stat-mode');
const errorContainer = document.getElementById('error-container');
const tooltip = document.getElementById('tooltip');
const exportButton = document.getElementById('export-geojson');
const fileUpload = document.getElementById('file-upload');
const fileInfo = document.getElementById('file-info');
const resetButton = document.getElementById('reset-data');
const editModeCheckbox = document.getElementById('edit-mode');
const resetEditsButton = document.getElementById('reset-edits');
const compactnessWeightInput = document.getElementById('compactness-weight');
const compactnessWeightValue = document.getElementById('compactness-weight-value');
const adjacencyWeightInput = document.getElementById('adjacency-weight');
const adjacencyWeightValue = document.getElementById('adjacency-weight-value');
const adjacencyDiagonalInput = document.getElementById('adjacency-diagonal');
const pairwiseEnabledInput = document.getElementById('pairwise-enabled');
const pairwiseEdgeLimitInput = document.getElementById('pairwise-edge-limit');
const pairwiseNearestCellsInput = document.getElementById('pairwise-nearest-cells');
const pairwiseWeightInput = document.getElementById('pairwise-weight');
const runPostProcessInput = document.getElementById('run-post-process');
const runSAInput = document.getElementById('run-sa');
const saIterInput = document.getElementById('sa-iter');

// Edit mode state
let editModeEnabled = false;
let originalAssignmentsSnapshot = null; // deep clone of assignments when allocation completes
let hasEdits = false;
let cachedAdjacencyGraph = null;

// Map dimensions - calculate dynamically to fit viewport
function calculateMapDimensions() {
    const mapsContainer = document.querySelector('.maps-container');
    if (!mapsContainer) return { width: 500, height: 500 };

    const containerRect = mapsContainer.getBoundingClientRect();
    const availableHeight = containerRect.height - 40; // Account for padding and header
    const availableWidth = (containerRect.width - 6) / 2; // Account for gap between maps

    // Use the smaller dimension to ensure square maps fit
    const size = Math.min(availableWidth, availableHeight);
    return {
        width: Math.max(300, Math.floor(size)),
        height: Math.max(300, Math.floor(size))
    };
}

let mapDimensions = calculateMapDimensions();

function getMapWidth() {
    return mapDimensions.width;
}

function getMapHeight() {
    return mapDimensions.height;
}

function applySharedTransform(svg, zoom) {
    isSyncingMaps = true;
    svg.call(zoom.transform, currentSharedTransform);
    isSyncingMaps = false;
}

function syncMapTransforms(sourceMap, transform) {
    if (isSyncingMaps) return;

    currentSharedTransform = transform;
    const target = sourceMap === 'original' ? gridMapSyncApi : originalMapSyncApi;
    if (!target) return;

    isSyncingMaps = true;
    target.svg.call(target.zoom.transform, transform);
    isSyncingMaps = false;
}

function getCartogramExportFileName(sourceFileName) {
    const fallback = 'exported';
    const safeName = (typeof sourceFileName === 'string' && sourceFileName.trim()) ? sourceFileName.trim() : fallback;
    const baseName = safeName
        .replace(/^.*[\\/]/, '')
        .replace(/\.geojson$/i, '')
        .replace(/\.[^/.]+$/, '');

    return `${baseName || fallback}_cartogram.geojson`;
}

function setMapState(containerId, message, tone = 'info') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let state = container.querySelector('.map-state');
    if (!state) {
        state = document.createElement('div');
        container.appendChild(state);
    }

    state.className = `map-state map-state-${tone}`;
    state.textContent = message;
}

function updateRunStats({ featureCount, gridSize, score, mode } = {}) {
    if (statFeatureCount && featureCount !== undefined) {
        statFeatureCount.textContent = featureCount;
    }
    if (statGridSize && gridSize !== undefined) {
        statGridSize.textContent = gridSize;
    }
    if (statScore && score !== undefined) {
        statScore.textContent = score;
    }
    if (statMode && mode !== undefined) {
        statMode.textContent = mode;
    }
}

function normalizeGridDimension(rawValue, minValue, maxValue, fallbackValue) {
    const parsed = parseInt(rawValue, 10);
    const min = Number.isFinite(minValue) ? minValue : 1;
    const max = Number.isFinite(maxValue) ? maxValue : 100;
    const fallback = Number.isFinite(fallbackValue) ? fallbackValue : min;
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, safe));
}

function parseFloatOr(value, fallbackValue) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseIntOr(value, fallbackValue) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function updateAdvancedValueDisplays() {
    if (compactnessWeightInput && compactnessWeightValue) {
        compactnessWeightValue.textContent = parseFloatOr(compactnessWeightInput.value, 1).toFixed(1);
    }
    if (adjacencyWeightInput && adjacencyWeightValue) {
        adjacencyWeightValue.textContent = parseFloatOr(adjacencyWeightInput.value, 0).toFixed(2);
    }
}

function getFeatureKey(feature, index) {
    if (feature?.id !== undefined && feature?.id !== null) {
        return String(feature.id);
    }
    return `feature_${index}`;
}

function escapeAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function clearLinkedHover() {
    linkedHoverKey = null;
    d3.selectAll('.linked-highlight').classed('linked-highlight', false);
}

function setLinkedHover(featureKey) {
    if (featureKey === undefined || featureKey === null) {
        clearLinkedHover();
        return;
    }

    const key = String(featureKey);
    clearLinkedHover();
    linkedHoverKey = key;
    const escapedKey = escapeAttributeValue(key);
    d3.selectAll(`[data-feature-key="${escapedKey}"]`).classed('linked-highlight', true);
}

// Update compactness display
compactnessSlider.addEventListener('input', (e) => {
    compactnessValue.textContent = e.target.value;
});

// Fix GeoJSON winding order
// GeoJSON spec: exterior rings must be counter-clockwise, interior rings (holes) must be clockwise
function fixGeoJsonWinding(geojson) {
    // Calculate signed area of a ring (shoelace formula)
    function ringArea(ring) {
        let area = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        }
        return area / 2;
    }

    // Reverse a ring if needed
    function fixRing(ring, shouldBeCounterClockwise) {
        const area = ringArea(ring);
        const isCounterClockwise = area < 0;

        if (shouldBeCounterClockwise && !isCounterClockwise) {
            return ring.slice().reverse();
        } else if (!shouldBeCounterClockwise && isCounterClockwise) {
            return ring.slice().reverse();
        }
        return ring;
    }

    // Deep clone the GeoJSON
    const fixed = JSON.parse(JSON.stringify(geojson));

    fixed.features = fixed.features.map(feature => {
        const geometry = feature.geometry;

        if (geometry.type === 'Polygon') {
            // First ring is exterior (should be counter-clockwise)
            // Subsequent rings are holes (should be clockwise)
            geometry.coordinates[0] = fixRing(geometry.coordinates[0], true);
            for (let i = 1; i < geometry.coordinates.length; i++) {
                geometry.coordinates[i] = fixRing(geometry.coordinates[i], false);
            }
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates = geometry.coordinates.map(polygon => {
                // First ring is exterior (should be counter-clockwise)
                polygon[0] = fixRing(polygon[0], true);
                // Subsequent rings are holes (should be clockwise)
                for (let i = 1; i < polygon.length; i++) {
                    polygon[i] = fixRing(polygon[i], false);
                }
                return polygon;
            });
        }

        return feature;
    });

    return fixed;
}

// Process GeoJSON data
function processGeoJson(geojson, fileName = 'london.geojson') {
    if (!geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error('GeoJSON must contain a features array with at least one feature');
    }

    // Extract centroids from each feature
    const processedData = geojson.features.map((feature, i) => {
        const geometry = feature.geometry;
        let centroid;

        if (geometry.type === 'Point') {
            // Use point coordinates directly
            centroid = {
                lon: geometry.coordinates[0],
                lat: geometry.coordinates[1]
            };
        } else if (geometry.type === 'Polygon') {
            // Use polylabel-based interior label point if available, fallback to arithmetic mean
            let c = null;
            try {
                c = computePolygonCentroid(geometry);
            } catch (err) {
                c = null;
            }
            if (c) {
                centroid = { lon: c.x, lat: c.y };
            } else {
                const coords = geometry.coordinates[0];
                const sum = coords.reduce((acc, [lon, lat]) => ({
                    lon: acc.lon + lon,
                    lat: acc.lat + lat
                }), { lon: 0, lat: 0 });
                centroid = {
                    lon: sum.lon / coords.length,
                    lat: sum.lat / coords.length
                };
            }
        } else if (geometry.type === 'MultiPolygon') {
            // Use polylabel-based centroid of largest polygon when available, fallback to first polygon mean
            let c = null;
            try {
                c = computePolygonCentroid(geometry);
            } catch (err) {
                c = null;
            }
            if (c) {
                centroid = { lon: c.x, lat: c.y };
            } else {
                const coords = geometry.coordinates[0][0];
                const sum = coords.reduce((acc, [lon, lat]) => ({
                    lon: acc.lon + lon,
                    lat: acc.lat + lat
                }), { lon: 0, lat: 0 });
                centroid = {
                    lon: sum.lon / coords.length,
                    lat: sum.lat / coords.length
                };
            }
        } else {
            throw new Error(`Unsupported geometry type: ${geometry.type}. Supported types: Point, Polygon, MultiPolygon`);
        }

        // Extract name from properties or use id/index
        const name = feature.properties?.name ||
            feature.properties?.NAME ||
            feature.properties?.id ||
            feature.id ||
            `Feature ${i + 1}`;

        return {
            id: feature.id || `feature_${i}`,
            name: name,
            lon: centroid.lon,
            lat: centroid.lat,
            originalFeature: feature
        };
    });

    // Calculate bounds
    const lons = processedData.map(d => d.lon);
    const lats = processedData.map(d => d.lat);
    const bounds = {
        minX: Math.min(...lons),
        maxX: Math.max(...lons),
        minY: Math.min(...lats),
        maxY: Math.max(...lats)
    };

    return { processedData, bounds };
}

// Update UI controls with estimated parameters
function updateUIControls(params) {
    isUpdatingParameters = true;

    // Update rows and cols inputs
    const rowsMin = parseInt(rowsInput.min, 10) || 1;
    const rowsMax = parseInt(rowsInput.max, 10) || 100;
    const colsMin = parseInt(colsInput.min, 10) || 1;
    const colsMax = parseInt(colsInput.max, 10) || 100;

    const safeRows = normalizeGridDimension(params.rows, rowsMin, rowsMax, rowsMin);
    const safeCols = normalizeGridDimension(params.cols, colsMin, colsMax, colsMin);

    rowsInput.value = safeRows;
    colsInput.value = safeCols;
    if (rowsSlider) rowsSlider.value = safeRows;
    if (colsSlider) colsSlider.value = safeCols;

    // Update compactness slider
    const compactnessValue = parseFloat(params.compactness.toFixed(2));
    compactnessSlider.value = compactnessValue;
    document.getElementById('compactness-value').textContent = compactnessValue.toFixed(1);

    // Update PCA rotation checkbox
    rotatePCAInput.checked = params.rotateByPCA || false;

    isUpdatingParameters = false;
}

// Load and process data
async function loadData(geojson, fileName = 'london.geojson') {
    // Fix winding order before processing
    const fixedGeoJson = fixGeoJsonWinding(geojson);

    // Reset shared map transform when loading a new source dataset
    currentSharedTransform = d3.zoomIdentity;

    const { processedData, bounds } = processGeoJson(fixedGeoJson, fileName);

    londonData = processedData;
    originalBounds = bounds;
    currentGeoJson = fixedGeoJson;
    currentSourceFileName = fileName;
    cachedAdjacencyGraph = null;

    updateRunStats({
        featureCount: processedData.length,
        gridSize: '--',
        score: '--',
        mode: 'Auto'
    });

    setMapState('grid-map', 'Computing cartogram allocation...', 'info');

    // Auto-estimate parameters from GeoJSON (use fixed GeoJSON)
    try {
        const estimatedParams = estimateParameters(fixedGeoJson, {
            xAccessor: d => d.lon,
            yAccessor: d => d.lat
        });

        // Update UI controls with estimated parameters
        updateUIControls(estimatedParams);

        statusText.textContent = `Auto-estimated: ${estimatedParams.rows}x${estimatedParams.cols} grid, compactness: ${estimatedParams.compactness.toFixed(2)}`;
    } catch (error) {
        console.warn('Failed to estimate parameters:', error);
        // Continue with default values if estimation fails
    }

    // Draw original map (use fixed GeoJSON)
    drawOriginalMap(currentGeoJson);

    // Initial allocation
    await allocateAndDraw();
}

// Load GLPK and initialize
async function init() {
    try {
        setMapState('original-map', 'Loading geographic source map...', 'info');
        setMapState('grid-map', 'Cartogram will appear after allocation.', 'muted');

        statusText.textContent = 'Loading GLPK solver...';
        updateRunStats({
            featureCount: '--',
            gridSize: '--',
            score: '--',
            mode: 'Initializing'
        });
        glpkInstance = await glpk();

        // Wait for DOM to be fully laid out, then recalculate map dimensions
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    mapDimensions = calculateMapDimensions();
                    resolve();
                });
            });
        });

        statusText.textContent = 'Loading London boroughs data...';

        // Load London GeoJSON
        const response = await fetch('london.geojson');
        const geojson = await response.json();

        await loadData(geojson, 'london.geojson');

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        showError('Failed to initialize: ' + error.message);
        setMapState('original-map', 'Failed to load source map.', 'error');
        setMapState('grid-map', 'Initialization failed. Check inputs and reload.', 'error');
        console.error(error);
    }
}

function setupEventListeners() {
    const inputs = [
        compactnessSlider,
        gridTypeSelect,
        distanceMetricSelect,
        rotatePCAInput,
        compactnessWeightInput,
        adjacencyWeightInput,
        adjacencyDiagonalInput,
        pairwiseEnabledInput,
        pairwiseEdgeLimitInput,
        pairwiseNearestCellsInput,
        pairwiseWeightInput,
        runPostProcessInput,
        runSAInput,
        saIterInput
    ];

    let allocationTimeout = null;
    const scheduleAllocation = (delayMs = 200) => {
        clearTimeout(allocationTimeout);
        allocationTimeout = setTimeout(() => {
            allocateAndDraw();
        }, delayMs);
    };

    const bindDimensionControls = (numberInput, sliderInput) => {
        const minValue = parseInt(numberInput.min, 10) || 1;
        const maxValue = parseInt(numberInput.max, 10) || 100;

        const syncAndUpdate = (sourceInput, commitImmediately = false) => {
            if (isUpdatingParameters) return;

            const otherInput = sourceInput === numberInput ? sliderInput : numberInput;
            const fallbackValue = parseInt(otherInput.value, 10) || minValue;
            const safeValue = normalizeGridDimension(sourceInput.value, minValue, maxValue, fallbackValue);

            numberInput.value = safeValue;
            sliderInput.value = safeValue;

            if (commitImmediately) {
                allocateAndDraw();
            } else {
                scheduleAllocation(180);
            }
        };

        numberInput.addEventListener('input', () => syncAndUpdate(numberInput, false));
        numberInput.addEventListener('change', () => syncAndUpdate(numberInput, true));
        sliderInput.addEventListener('input', () => syncAndUpdate(sliderInput, false));
        sliderInput.addEventListener('change', () => syncAndUpdate(sliderInput, true));
    };

    if (rowsSlider) {
        bindDimensionControls(rowsInput, rowsSlider);
    }
    if (colsSlider) {
        bindDimensionControls(colsInput, colsSlider);
    }

    inputs.forEach(input => {
        if (!input) return;
        input.addEventListener('change', () => {
            // Skip if we're updating parameters programmatically
            if (!isUpdatingParameters) {
                allocateAndDraw();
            }
        });
        input.addEventListener('input', () => {
            // Skip if we're updating parameters programmatically
            if (isUpdatingParameters) return;

            if (input === compactnessSlider) {
                compactnessValue.textContent = compactnessSlider.value;
            }
            if (input === compactnessWeightInput || input === adjacencyWeightInput) {
                updateAdvancedValueDisplays();
            }
            if (input === compactnessSlider || input === compactnessWeightInput || input === adjacencyWeightInput) {
                scheduleAllocation(120);
            }
        });
    });

    updateAdvancedValueDisplays();

    // File upload handler
    fileUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            statusText.textContent = `Loading ${file.name}...`;
            updateRunStats({ mode: 'Loading' });
            errorContainer.innerHTML = '';

            const text = await file.text();
            const geojson = JSON.parse(text);

            // Validate GeoJSON structure
            if (!geojson.type || geojson.type !== 'FeatureCollection') {
                throw new Error('GeoJSON must be a FeatureCollection');
            }

            await loadData(geojson, file.name);

            fileInfo.textContent = `Loaded: ${file.name} (${geojson.features.length} features)`;
            isUsingDefaultData = false;
            resetButton.disabled = false;
            statusText.textContent = `Loaded ${geojson.features.length} features from ${file.name}`;

        } catch (error) {
            showError('Failed to load file: ' + error.message);
            console.error(error);
            statusText.textContent = 'Error loading file';
            updateRunStats({ mode: 'Error' });
            setMapState('original-map', 'Unable to render uploaded source map.', 'error');
            setMapState('grid-map', 'Upload failed. Please provide valid GeoJSON.', 'error');
            fileUpload.value = ''; // Reset file input
        }
    });

    // Reset button handler
    resetButton.addEventListener('click', async () => {
        try {
            statusText.textContent = 'Loading default data...';
            updateRunStats({ mode: 'Resetting' });
            errorContainer.innerHTML = '';

            const response = await fetch('london.geojson');
            const geojson = await response.json();

            await loadData(geojson, 'london.geojson');

            fileInfo.textContent = 'Using default: london.geojson';
            isUsingDefaultData = true;
            resetButton.disabled = true;
            fileUpload.value = ''; // Reset file input
            statusText.textContent = 'Reset to default data';

        } catch (error) {
            showError('Failed to reset: ' + error.message);
            updateRunStats({ mode: 'Error' });
            console.error(error);
        }
    });

    // Edit mode toggle
    editModeCheckbox.addEventListener('change', (e) => {
        editModeEnabled = !!e.target.checked;
        statusText.textContent = editModeEnabled ? 'Edit mode enabled' : 'Edit mode disabled';
        updateRunStats({ mode: editModeEnabled ? 'Manual Edit' : 'Auto' });
        // Redraw grid so interactive handlers are attached/detached
        if (currentResult) {
            drawGridCartogram(currentResult, currentGridType);
        }
    });

    // Reset edits handler
    resetEditsButton.addEventListener('click', () => {
        if (!originalAssignmentsSnapshot || !currentResult) return;
        currentResult.assignments = JSON.parse(JSON.stringify(originalAssignmentsSnapshot));
        hasEdits = false;
        resetEditsButton.disabled = true;
        statusText.textContent = 'Edits reset to original allocation';
        updateRunStats({ mode: 'Auto' });
        drawGridCartogram(currentResult, currentGridType);
    });
}

async function allocateAndDraw() {
    try {
        statusText.textContent = 'Computing allocation...';
        updateRunStats({ mode: hasEdits ? 'Manual Edit' : 'Computing' });
        setMapState('grid-map', 'Computing cartogram allocation...', 'info');
        errorContainer.innerHTML = '';

        const mapper = new GridMapper();

        const config = {
            xAccessor: d => d.lon,
            yAccessor: d => d.lat,
            rows: parseInt(rowsInput.value),
            cols: parseInt(colsInput.value),
            compactness: parseFloat(compactnessSlider.value),
            gridType: gridTypeSelect.value,
            distanceMetric: distanceMetricSelect.value,
            rotateByPCA: rotatePCAInput.checked,
            compactnessWeight: parseFloatOr(compactnessWeightInput?.value, 1),
            adjacencyWeight: parseFloatOr(adjacencyWeightInput?.value, 0),
            adjacencyDiagonal: Boolean(adjacencyDiagonalInput?.checked),
            runPostProcess: Boolean(runPostProcessInput?.checked),
            runSA: Boolean(runSAInput?.checked),
            saIter: parseIntOr(saIterInput?.value, 2000),
            mip: () => new GLPKSolver(glpkInstance)
        };

        const pairwiseEnabled = Boolean(pairwiseEnabledInput?.checked);
        if (pairwiseEnabled) {
            if (!cachedAdjacencyGraph && currentGeoJson?.features) {
                cachedAdjacencyGraph = computeAdjacencyGraph(currentGeoJson.features);
            }
            config.pairwiseAdjacency = {
                enabled: true,
                edgeLimit: parseIntOr(pairwiseEdgeLimitInput?.value, 150),
                nearestCells: parseIntOr(pairwiseNearestCellsInput?.value, 6),
                weight: parseFloatOr(pairwiseWeightInput?.value, 0.5)
            };
            config.adjacencyGraph = cachedAdjacencyGraph;
        }

        const result = await mapper.allocate(londonData, config);
        currentResult = result;
        currentGridType = config.gridType;

        // Snapshot assignments so we can reset edits later
        try {
            originalAssignmentsSnapshot = JSON.parse(JSON.stringify(result.assignments));
            hasEdits = false;
            resetEditsButton.disabled = true;
        } catch (e) {
            originalAssignmentsSnapshot = null;
        }

        // Draw grid cartogram
        drawGridCartogram(result, config.gridType);

        // Enable export button
        exportButton.disabled = false;

        updateRunStats({
            featureCount: result.assignments.length,
            gridSize: `${result.meta.cols} x ${result.meta.rows}`,
            score: result.meta.score.toFixed(2),
            mode: hasEdits ? 'Manual Edit' : 'Auto'
        });

        statusText.textContent = `Allocated ${result.assignments.length} features to ${result.meta.cols}x${result.meta.rows} grid. Score: ${result.meta.score.toFixed(2)}`;

    } catch (error) {
        showError('Allocation failed: ' + error.message);
        console.error(error);
        statusText.textContent = 'Error: ' + error.message;
        updateRunStats({ mode: 'Error' });
        setMapState('grid-map', 'Allocation failed. Try different grid settings.', 'error');
    }
}

function drawOriginalMap(geojson) {
    const container = d3.select('#original-map');
    container.selectAll('*').remove();

    // Get container dimensions - use a reasonable default if not available yet
    const containerNode = container.node();
    let mapWidth, mapHeight;

    if (containerNode) {
        const containerRect = containerNode.getBoundingClientRect();
        mapWidth = containerRect.width || getMapWidth();
        mapHeight = containerRect.height || getMapHeight();
    } else {
        mapWidth = getMapWidth();
        mapHeight = getMapHeight();
    }

    const svg = container.append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    // Create projection with error handling
    let projection;
    try {
        // Calculate bounds from GeoJSON
        const bounds = d3.geoBounds(geojson);

        // Check if bounds are valid
        if (!bounds || !isFinite(bounds[0][0]) || !isFinite(bounds[0][1]) ||
            !isFinite(bounds[1][0]) || !isFinite(bounds[1][1])) {
            throw new Error('Invalid GeoJSON bounds');
        }

        const padding = 20;
        projection = d3.geoMercator()
            .fitExtent([[padding, padding], [mapWidth - padding, mapHeight - padding]], geojson);

        // Fallback if fitExtent fails
        if (!projection.scale() || !isFinite(projection.scale())) {
            // Use fitSize as fallback
            projection = d3.geoMercator()
                .fitSize([mapWidth - 2 * padding, mapHeight - 2 * padding], geojson);
        }
    } catch (error) {
        console.warn('Error setting up projection, using default:', error);
        // Fallback to a basic projection centered on the data
        const bounds = d3.geoBounds(geojson);
        const center = [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2
        ];
        projection = d3.geoMercator()
            .center(center)
            .scale(Math.min(mapWidth, mapHeight) / Math.PI)
            .translate([mapWidth / 2, mapHeight / 2]);
    }

    const path = d3.geoPath().projection(projection);

    // Create a group for zoomable content
    const g = svg.append('g').attr('class', 'zoomable-content');

    // Draw boroughs with error handling
    g.selectAll('.borough')
        .data(geojson.features)
        .enter()
        .append('path')
        .attr('class', 'borough')
        .attr('data-feature-key', (d, i) => getFeatureKey(d, i))
        .attr('d', d => {
            try {
                return path(d) || '';
            } catch (error) {
                console.warn('Error rendering feature:', d.id || d.properties?.name, error);
                return '';
            }
        })
        .filter(d => {
            // Filter out features that couldn't be rendered
            const pathData = path(d);
            return pathData && pathData.length > 0;
        })
        .on('mouseover', function (event, d) {
            d3.select(this).attr('fill', '#357abd');
            setLinkedHover(getFeatureKey(d, geojson.features.indexOf(d)));
            const name = d.properties?.name || d.properties?.PROVINSI || d.id || 'Feature';
            showTooltip(event, name);
        })
        .on('mouseout', function (event, d) {
            d3.select(this).attr('fill', '#4a90e2');
            clearLinkedHover();
            hideTooltip();
        });

    // Draw centroids
    if (londonData && londonData.length > 0) {
        g.selectAll('.centroid')
            .data(londonData)
            .enter()
            .append('circle')
            .attr('class', 'centroid')
            .attr('cx', d => {
                try {
                    const projected = projection([d.lon, d.lat]);
                    return projected ? projected[0] : 0;
                } catch (error) {
                    return 0;
                }
            })
            .attr('cy', d => {
                try {
                    const projected = projection([d.lon, d.lat]);
                    return projected ? projected[1] : 0;
                } catch (error) {
                    return 0;
                }
            })
            .on('mouseover', function (event, d) {
                showTooltip(event, d.name);
            })
            .on('mouseout', hideTooltip);
    }

    // Add zoom controls
    const zoomControls = container.append('div')
        .attr('class', 'zoom-controls');

    // Setup zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);

            if (!isSyncingMaps) {
                syncMapTransforms('original', event.transform);
            }
        });

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('+')
        .on('click', () => {
            svg.transition().duration(200).call(zoom.scaleBy, 1.5);
        });

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('−')
        .on('click', () => {
            svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.5);
        });

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('⌂')
        .attr('title', 'Reset zoom')
        .on('click', () => {
            svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
        });

    svg.call(zoom);
    originalMapSyncApi = { svg, zoom };
    applySharedTransform(svg, zoom);
}

function drawGridCartogram(result, gridType = 'rect') {
    const container = d3.select('#grid-map');
    container.selectAll('*').remove();

    // Get container dimensions - use a reasonable default if not available yet
    const containerNode = container.node();
    let mapWidth, mapHeight;

    if (containerNode) {
        const containerRect = containerNode.getBoundingClientRect();
        mapWidth = containerRect.width || getMapWidth();
        mapHeight = containerRect.height || getMapHeight();
    } else {
        mapWidth = getMapWidth();
        mapHeight = getMapHeight();
    }

    const svg = container.append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    setupGridCartogramZoom(svg, container, result, gridType);
}

function setupGridCartogramZoom(svg, container, result, gridType) {
    // Create a group for zoomable content
    const g = svg.append('g').attr('class', 'zoomable-content');

    const { assignments, meta } = result;
    const { cols, rows } = meta;

    // Calculate cell size - get from viewBox or container dimensions
    const viewBox = svg.attr('viewBox');
    let mapWidth, mapHeight;
    if (viewBox) {
        const vb = viewBox.split(' ').map(Number);
        mapWidth = vb[2] || getMapWidth();
        mapHeight = vb[3] || getMapHeight();
    } else {
        const svgNode = svg.node();
        const svgRect = svgNode ? svgNode.getBoundingClientRect() : null;
        mapWidth = svgRect?.width || parseInt(svg.attr('width')) || getMapWidth();
        mapHeight = svgRect?.height || parseInt(svg.attr('height')) || getMapHeight();
    }
    const padding = 20;
    const availableWidth = mapWidth - 2 * padding;
    const availableHeight = mapHeight - 2 * padding;

    // Preserve geometry proportions based on grid layout (not lon/lat bounds)
    // to avoid perceived horizontal/vertical stretching.
    const hexYSpacing = 0.8660254037844386; // sqrt(3)/2
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const targetAspect = gridType === 'hex'
        ? ((safeCols - 1 + 1.5) / (Math.max(1e-9, (safeRows - 1) * hexYSpacing + 1)))
        : (safeCols / safeRows);

    let plotWidth = availableWidth;
    let plotHeight = availableHeight;
    if (plotWidth / plotHeight > targetAspect) {
        plotWidth = plotHeight * targetAspect;
    } else {
        plotHeight = plotWidth / targetAspect;
    }

    const plotOffsetX = padding + (availableWidth - plotWidth) / 2;
    const plotOffsetY = padding + (availableHeight - plotHeight) / 2;

    // Create color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    if (gridType === 'hex') {
        // Hexagonal grid
        // getGridCellCenter returns: x = col + offset, y = row * 0.8660254037844386
        // where 0.8660254037844386 = sqrt(3)/2
        // In grid units: horizontal spacing = 1, vertical spacing = sqrt(3)/2
        // With staggering, effective width = (cols - 1 + 0.5)

        // Calculate scale factors to fit in available space
        const scaleX = plotWidth / Math.max(1e-9, (cols - 1 + 0.5));
        const scaleY = plotHeight / Math.max(1e-9, (rows - 1) * hexYSpacing);
        const scale = Math.min(scaleX, scaleY);

        // Hexagon radius (width = 2*radius, so radius = scale/2)
        const hexRadius = scale / 2;

        // Calculate total space used and center
        const totalHexWidth = (cols - 1 + 0.5) * scale;
        const totalHexHeight = (rows - 1) * hexYSpacing * scale;
        const offsetX = plotOffsetX + (plotWidth - totalHexWidth) / 2;
        const offsetY = plotOffsetY + (plotHeight - totalHexHeight) / 2;

        // Function to generate flat-top hexagon path
        function hexagonPath(cx, cy, radius) {
            // For flat-top hexagons, vertices are at 30° intervals starting from top
            const points = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6; // Start at -30° (top)
                points.push([
                    cx + radius * Math.cos(angle),
                    cy + radius * Math.sin(angle)
                ]);
            }
            return 'M' + points.map(p => p.join(',')).join('L') + 'Z';
        }

        // Draw hexagon cells
        assignments.forEach((assignment, i) => {
            const row = assignment.gridY;
            const col = assignment.gridX;

            // Calculate hexagon center (matching getGridCellCenter logic)
            const xOffset = (row % 2) ? 0.5 : 0;
            const cx = offsetX + (col + xOffset) * scale;
            // Flip Y-axis: SVG Y increases downward, but normalization treats Y as increasing upward
            const flippedRow = rows - 1 - row;
            const cy = offsetY + flippedRow * hexYSpacing * scale;

            const cell = g.append('path')
                .attr('class', 'grid-cell')
                .attr('data-feature-key', String(assignment.id))
                .attr('d', hexagonPath(cx, cy, hexRadius))
                .attr('fill', colorScale(i % 10))
                .attr('stroke', 'white')
                .attr('stroke-width', 1.5)
                .on('mouseover', function (event) {
                    d3.select(this).attr('opacity', 0.7);
                    setLinkedHover(assignment.id);
                    showTooltip(event, assignment.name);
                })
                .on('mouseout', function (event) {
                    d3.select(this).attr('opacity', 1);
                    clearLinkedHover();
                    hideTooltip();
                });

            // Add edit drag handlers when edit mode is enabled
            if (editModeEnabled) {
                cell.classed('editable', true)
                    .on('mousedown', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        startDragHex(assignment, event);
                    });
            }

            // Add label
            g.append('text')
                .attr('class', 'grid-label')
                .attr('x', cx)
                .attr('y', cy)
                .text(assignment.name.length > 10 ? assignment.name.substring(0, 10) + '...' : assignment.name);
        });

        // --- Hex drag handlers ---
        let draggingHex = null;
        let ghostHex = null;
        function startDragHex(assignment, startEvent) {
            draggingHex = assignment;
            const svgNode = svg.node();
            svgNode.style.cursor = 'grabbing';

            // Initial center of dragged hex
            const initXOff = (assignment.gridY % 2) ? 0.5 : 0;
            const initCx = offsetX + (assignment.gridX + initXOff) * scale;
            const initFlipped = rows - 1 - assignment.gridY;
            const initCy = offsetY + initFlipped * hexYSpacing * scale;

            // Create ghost hex
            ghostHex = g.append('path').attr('class', 'ghost').attr('d', hexagonPath(initCx, initCy, hexRadius)).attr('fill', '#ffffff');

            function onMove(e) {
                const [px, py] = d3.pointer(e, svg.node());
                // Find nearest cell
                let minDist = Infinity;
                let target = null;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const xOff = (r % 2) ? 0.5 : 0;
                        const ccx = offsetX + (c + xOff) * scale;
                        const flippedRow = rows - 1 - r;
                        const ccy = offsetY + flippedRow * hexYSpacing * scale;
                        const d2 = (px - ccx) * (px - ccx) + (py - ccy) * (py - ccy);
                        if (d2 < minDist) {
                            minDist = d2;
                            target = { gx: c, gy: r, cx: ccx, cy: ccy };
                        }
                    }
                }
                if (target && ghostHex) {
                    ghostHex.attr('d', hexagonPath(target.cx, target.cy, hexRadius));
                    ghostHex.datum(target);
                }
            }

            function onUp(e) {
                const target = ghostHex ? ghostHex.datum() : null;
                if (target) {
                    // perform swap if needed
                    const other = assignments.find(a => a.gridX === target.gx && a.gridY === target.gy);
                    if (other && other !== draggingHex) {
                        const oldX = draggingHex.gridX;
                        const oldY = draggingHex.gridY;
                        draggingHex.gridX = other.gridX;
                        draggingHex.gridY = other.gridY;
                        other.gridX = oldX;
                        other.gridY = oldY;
                    } else if (!other) {
                        draggingHex.gridX = target.gx;
                        draggingHex.gridY = target.gy;
                    }
                    hasEdits = true;
                    resetEditsButton.disabled = false;
                    statusText.textContent = 'Edited: manual reposition applied';
                    updateRunStats({ mode: 'Manual Edit' });
                    // redraw
                    drawGridCartogram(currentResult, currentGridType);
                }
                cleanup();
            }

            function onKey(e) {
                if (e.key === 'Escape') {
                    cleanup();
                    statusText.textContent = 'Edit cancelled';
                    updateRunStats({ mode: hasEdits ? 'Manual Edit' : 'Auto' });
                }
            }

            function cleanup() {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('keydown', onKey);
                if (ghostHex) ghostHex.remove();
                ghostHex = null;
                draggingHex = null;
                svg.node().style.cursor = null;
            }

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('keydown', onKey);
        }
    } else {
        // Rectangular grid
        const cellWidth = plotWidth / cols;
        const cellHeight = plotHeight / rows;

        // Draw grid cells
        assignments.forEach((assignment, i) => {
            const x = plotOffsetX + assignment.gridX * cellWidth;
            // Flip Y-axis: SVG Y increases downward, but normalization treats Y as increasing upward
            const y = plotOffsetY + (rows - 1 - assignment.gridY) * cellHeight;

            const cell = g.append('rect')
                .attr('class', 'grid-cell')
                .attr('data-feature-key', String(assignment.id))
                .attr('x', x)
                .attr('y', y)
                .attr('width', cellWidth)
                .attr('height', cellHeight)
                .attr('fill', colorScale(i % 10))
                .on('mouseover', function (event) {
                    d3.select(this).attr('opacity', 0.7);
                    setLinkedHover(assignment.id);
                    showTooltip(event, assignment.name);
                })
                .on('mouseout', function (event) {
                    d3.select(this).attr('opacity', 1);
                    clearLinkedHover();
                    hideTooltip();
                });

            // Editable drag handlers for rect cells
            if (editModeEnabled) {
                cell.classed('editable', true)
                    .on('mousedown', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        startDragRect(assignment, event);
                    });
            }

            // Add label
            g.append('text')
                .attr('class', 'grid-label')
                .attr('x', x + cellWidth / 2)
                .attr('y', y + cellHeight / 2)
                .text(assignment.name.length > 10 ? assignment.name.substring(0, 10) + '...' : assignment.name);
        });

        // Draw grid lines
        for (let i = 0; i <= cols; i++) {
            g.append('line')
                .attr('x1', plotOffsetX + i * cellWidth)
                .attr('y1', plotOffsetY)
                .attr('x2', plotOffsetX + i * cellWidth)
                .attr('y2', plotOffsetY + rows * cellHeight)
                .attr('stroke', '#ddd')
                .attr('stroke-width', 0.5);
        }
        for (let i = 0; i <= rows; i++) {
            g.append('line')
                .attr('x1', plotOffsetX)
                .attr('y1', plotOffsetY + i * cellHeight)
                .attr('x2', plotOffsetX + cols * cellWidth)
                .attr('y2', plotOffsetY + i * cellHeight)
                .attr('stroke', '#ddd')
                .attr('stroke-width', 0.5);
        }
        // --- Rect drag handlers ---
        let draggingRect = null;
        let ghostRect = null;
        function startDragRect(assignment, startEvent) {
            draggingRect = assignment;
            const svgNode = svg.node();
            svgNode.style.cursor = 'grabbing';

            // Create ghost rect at initial center
            const initX = plotOffsetX + assignment.gridX * cellWidth;
            const initY = plotOffsetY + (rows - 1 - assignment.gridY) * cellHeight;
            ghostRect = g.append('rect').attr('class', 'ghost').attr('x', initX).attr('y', initY).attr('width', cellWidth).attr('height', cellHeight).attr('fill', '#ffffff');

            function onMove(e) {
                const [px, py] = d3.pointer(e, svg.node());
                // Find nearest cell
                let minDist = Infinity;
                let target = null;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const ccx = plotOffsetX + c * cellWidth + cellWidth / 2;
                        const ccy = plotOffsetY + (rows - 1 - r) * cellHeight + cellHeight / 2;
                        const d2 = (px - ccx) * (px - ccx) + (py - ccy) * (py - ccy);
                        if (d2 < minDist) {
                            minDist = d2;
                            target = { gx: c, gy: r, x: ccx - cellWidth / 2, y: ccy - cellHeight / 2 };
                        }
                    }
                }
                if (target && ghostRect) {
                    ghostRect.attr('x', target.x).attr('y', target.y);
                    ghostRect.datum(target);
                }
            }

            function onUp(e) {
                const target = ghostRect ? ghostRect.datum() : null;
                if (target) {
                    const other = assignments.find(a => a.gridX === target.gx && a.gridY === target.gy);
                    if (other && other !== draggingRect) {
                        const oldX = draggingRect.gridX;
                        const oldY = draggingRect.gridY;
                        draggingRect.gridX = other.gridX;
                        draggingRect.gridY = other.gridY;
                        other.gridX = oldX;
                        other.gridY = oldY;
                    } else if (!other) {
                        draggingRect.gridX = target.gx;
                        draggingRect.gridY = target.gy;
                    }
                    hasEdits = true;
                    resetEditsButton.disabled = false;
                    statusText.textContent = 'Edited: manual reposition applied';
                    updateRunStats({ mode: 'Manual Edit' });
                    drawGridCartogram(currentResult, currentGridType);
                }
                cleanup();
            }

            function onKey(e) {
                if (e.key === 'Escape') {
                    cleanup();
                    statusText.textContent = 'Edit cancelled';
                    updateRunStats({ mode: hasEdits ? 'Manual Edit' : 'Auto' });
                }
            }

            function cleanup() {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('keydown', onKey);
                if (ghostRect) ghostRect.remove();
                ghostRect = null;
                draggingRect = null;
                svg.node().style.cursor = null;
            }

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('keydown', onKey);
        }
        // Note: Grid lines don't need flipping as they're drawn at fixed positions
    }

    // Add zoom controls
    const zoomControls = container.append('div')
        .attr('class', 'zoom-controls');

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('+')
        .on('click', () => {
            svg.transition().call(zoom.scaleBy, 1.5);
        });

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('−')
        .on('click', () => {
            svg.transition().call(zoom.scaleBy, 1 / 1.5);
        });

    zoomControls.append('button')
        .attr('class', 'zoom-button')
        .text('⌂')
        .attr('title', 'Reset zoom')
        .on('click', () => {
            svg.transition().call(zoom.transform, d3.zoomIdentity);
        });

    // Setup zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);

            if (!isSyncingMaps) {
                syncMapTransforms('grid', event.transform);
            }
        });

    svg.call(zoom);
    gridMapSyncApi = { svg, zoom };
    applySharedTransform(svg, zoom);
}

function showTooltip(event, text) {
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
}

function hideTooltip() {
    tooltip.classList.remove('visible');
}

function showError(message) {
    errorContainer.innerHTML = `<div class="error">${message}</div>`;
}

function exportGeoJSON() {
    if (!currentResult) {
        showError('No allocation result available to export');
        return;
    }

    try {
        // Create GeoJSON using the utility function
        const gridGeoJson = createGridGeoJson(
            currentResult.assignments,
            currentResult.meta.bounds,
            currentResult.meta  // Automatically uses gridType from meta
        );

        // Keep all original user-provided attributes in exported cartogram features.
        const assignmentByCell = new Map(
            currentResult.assignments.map(assignment => [`${assignment.gridX},${assignment.gridY}`, assignment])
        );

        gridGeoJson.features = gridGeoJson.features.map(feature => {
            const key = `${feature.properties?.gridX},${feature.properties?.gridY}`;
            const assignment = assignmentByCell.get(key);
            if (!assignment) return feature;

            const originalProperties = assignment.originalFeature?.properties || {};
            const mergedProperties = {
                ...originalProperties,
                ...feature.properties,
                name: assignment.name
            };

            const featureId = assignment.originalFeature?.id ?? assignment.id;

            return {
                ...feature,
                ...(featureId !== undefined ? { id: featureId } : {}),
                properties: mergedProperties
            };
        });

        // Convert to JSON string
        const jsonString = JSON.stringify(gridGeoJson, null, 2);

        // Create a blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getCartogramExportFileName(currentSourceFileName);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.textContent = `GeoJSON exported successfully!`;
        updateRunStats({ mode: hasEdits ? 'Manual Edit' : 'Exported' });
        setTimeout(() => {
            if (currentResult) {
                statusText.textContent = `Allocated ${currentResult.assignments.length} boroughs to ${currentResult.meta.cols}x${currentResult.meta.rows} grid. Score: ${currentResult.meta.score.toFixed(2)}`;
                updateRunStats({ mode: hasEdits ? 'Manual Edit' : 'Auto' });
            }
        }, 2000);
    } catch (error) {
        showError('Failed to export GeoJSON: ' + error.message);
        console.error(error);
    }
}

// Setup export button
exportButton.addEventListener('click', exportGeoJSON);

// Recalculate map dimensions on resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const oldDims = { ...mapDimensions };
        mapDimensions = calculateMapDimensions();
        if (oldDims.width !== mapDimensions.width || oldDims.height !== mapDimensions.height) {
            // Redraw maps with new dimensions
            if (currentGeoJson) {
                drawOriginalMap(currentGeoJson);
            }
            if (currentResult) {
                drawGridCartogram(currentResult, currentGridType);
            }
        }
    }, 250);
});

// Initialize on load
init();
