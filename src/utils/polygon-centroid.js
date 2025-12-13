import polylabel from 'polylabel';

/**
 * Compute an interior centroid (pole of inaccessibility) for polygonal geometries.
 * Falls back to a simple arithmetic mean of outer ring coords if polylabel fails.
 *
 * @param {Object} geometry - GeoJSON geometry object (Point, Polygon, MultiPolygon)
 * @param {Object} options - Optional: { precision }
 * @returns {Object|null} { x, y } or null if not computable
 */
export function computePolygonCentroid(geometry, options = {}) {
  const precision = options.precision ?? 1.0;

  if (!geometry || !geometry.coordinates) return null;

  if (geometry.type === 'Point') {
    return { x: geometry.coordinates[0], y: geometry.coordinates[1] };
  }

  function averageRing(ring) {
    const sum = ring.reduce(
      (acc, [lon, lat]) => ({ x: acc.x + lon, y: acc.y + lat }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }

  function tryPolylabelForRingCoords(rings) {
    try {
      // `polylabel` expects [ [x,y], ... ] rings (outer ring first, holes follow)
      const pt = polylabel(rings, precision);
      return { x: pt[0], y: pt[1] };
    } catch (err) {
      return null;
    }
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map(r => r.map(([lon, lat]) => [lon, lat]));
    const res = tryPolylabelForRingCoords(rings);
    if (res) return res;
    return averageRing(geometry.coordinates[0]);
  }

  if (geometry.type === 'MultiPolygon') {
    // Pick largest polygon by area (outer ring area) and compute polylabel on that polygon
    let maxArea = -Infinity;
    let bestPoly = null;

    for (const poly of geometry.coordinates) {
      const outer = poly[0];
      const area = Math.abs(polygonArea(outer));
      if (area > maxArea) {
        maxArea = area;
        bestPoly = poly;
      }
    }

    if (bestPoly) {
      const rings = bestPoly.map(r => r.map(([lon, lat]) => [lon, lat]));
      const res = tryPolylabelForRingCoords(rings);
      if (res) return res;
      return averageRing(bestPoly[0]);
    }
  }

  return null;
}

// Compute polygon signed area using shoelace formula
function polygonArea(coords) {
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    area += xj * yi - xi * yj;
  }
  return area / 2;
}
