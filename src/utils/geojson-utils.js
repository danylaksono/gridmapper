/**
 * GeoJSON Utilities
 * Functions for creating and transforming GeoJSON data
 */

/**
 * Create GeoJSON for grid polygons from assignments
 * @param {Array} assignments - Array of assignment objects with gridX, gridY, gridCols, gridRows
 * @param {Object} bounds - Bounds object with minX, maxX, minY, maxY
 * @param {string|Object} gridTypeOrMeta - Grid type: 'rect' | 'hex' (default: 'rect'), or result.meta object
 * @returns {Object} GeoJSON FeatureCollection
 */
export function createGridGeoJson(assignments, bounds, gridTypeOrMeta = 'rect') {
  // Support passing result.meta object for convenience
  let gridType = 'rect';
  if (typeof gridTypeOrMeta === 'object' && gridTypeOrMeta !== null) {
    gridType = gridTypeOrMeta.gridType || 'rect';
  } else {
    gridType = gridTypeOrMeta || 'rect';
  }
  const { minX, maxX, minY, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  const gridCols = assignments[0].gridCols;
  const gridRows = assignments[0].gridRows;

  const features = [];

  // Group assignments by grid cell
  const cellMap = {};
  assignments.forEach(state => {
    const key = `${state.gridX},${state.gridY}`;
    if (!cellMap[key]) cellMap[key] = [];
    // Try to get name from various possible properties
    const name = state.name || state.id || state.properties?.name || '';
    if (name) cellMap[key].push(name);
  });

  if (gridType === 'hex') {
    // Hexagonal grid
    const hexYSpacing = 0.8660254037844386; // sqrt(3)/2
    
    // Calculate scale factors to fit in bounds
    const scaleX = width / (gridCols - 1 + 0.5);
    const scaleY = height / ((gridRows - 1) * hexYSpacing);
    const scale = Math.min(scaleX, scaleY);
    
    // Hexagon radius (width = 2*radius, so radius = scale/2)
    const hexRadius = scale / 2;
    
    // Calculate total space used and offset
    const totalHexWidth = (gridCols - 1 + 0.5) * scale;
    const totalHexHeight = (gridRows - 1) * hexYSpacing * scale;
    const offsetX = minX + (width - totalHexWidth) / 2;
    const offsetY = minY + (height - totalHexHeight) / 2;

    // Function to generate flat-top hexagon coordinates
    function hexagonCoords(cx, cy, radius) {
      const coords = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6; // Start at -30° (top)
        coords.push([
          cx + radius * Math.cos(angle),
          cy + radius * Math.sin(angle)
        ]);
      }
      // Close the polygon
      coords.push(coords[0]);
      return coords;
    }

    for (const key in cellMap) {
      const [c, r] = key.split(',').map(Number);
      
      // Calculate hexagon center (matching getGridCellCenter logic)
      const xOffset = (r % 2) ? 0.5 : 0;
      const cx = offsetX + (c + xOffset) * scale;
      const cy = offsetY + r * hexYSpacing * scale;
      
      const polygon = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [hexagonCoords(cx, cy, hexRadius)]
        },
        properties: {
          names: cellMap[key],
          gridX: c,
          gridY: r
        }
      };
      features.push(polygon);
    }
  } else {
    // Rectangular grid
    const colW = width / gridCols;
    const rowH = height / gridRows;

    for (const key in cellMap) {
      const [c, r] = key.split(',').map(Number);
      const polygon = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [minX + c * colW, minY + r * rowH],
            [minX + (c + 1) * colW, minY + r * rowH],
            [minX + (c + 1) * colW, minY + (r + 1) * rowH],
            [minX + c * colW, minY + (r + 1) * rowH],
            [minX + c * colW, minY + r * rowH]
          ]]
        },
        properties: {
          names: cellMap[key],
          gridX: c,
          gridY: r
        }
      };
      features.push(polygon);
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * Create GeoJSON for input points
 * @param {Array} data - Array of data objects with lon, lat, name properties
 * @returns {Object} GeoJSON FeatureCollection
 */
export function createPointsGeoJson(data) {
  const features = data.map(d => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [d.lon, d.lat]
    },
    properties: {
      name: d.name
    }
  }));

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * Project GeoJSON coordinates using a projection function
 * @param {Object} geojson - GeoJSON object
 * @param {Function} projection - Function that accepts [lon, lat] and returns [x, y]
 * @returns {Object} Projected GeoJSON
 */
export function projectGeoJson(geojson, projection) {
  function projectCoords(coords) {
    // coords can be nested arrays for Polygon/MultiPolygon
    if (typeof coords[0] === 'number') {
      return projection(coords);
    }
    return coords.map(projectCoords);
  }

  const out = JSON.parse(JSON.stringify(geojson));
  out.features = geojson.features.map(f => {
    const g = JSON.parse(JSON.stringify(f));
    g.geometry.coordinates = projectCoords(f.geometry.coordinates);
    return g;
  });

  return out;
}

