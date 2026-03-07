/**
 * Adjacency Graph Utilities
 * Computes adjacency edges and approximate shared boundary weights from GeoJSON features
 */

export function computeFeatureBBox(feature) {
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

        if (typeof coords[0] === 'number') expand(coords);
    }

    traverse(feature.geometry.coordinates);

    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, area: (maxX - minX) * (maxY - minY) };
}

export function computeAdjacencyGraph(features, options = {}) {
    const { bufferFraction = 0.02 } = options;

    const n = features.length;
    const nodes = [];
    const bboxes = new Array(n);

    for (let i = 0; i < n; i++) {
        const f = features[i];
        const id = f.id ?? f.properties?.id ?? String(i);
        nodes.push({ id, index: i, properties: f.properties ?? {} });
        bboxes[i] = computeFeatureBBox(f);
    }

    // Estimate a global buffer to allow slight gaps tolerance
    const avgWidth = bboxes.reduce((s, b) => s + (b.width || 0), 0) / Math.max(1, n);
    const buffer = Math.max(1e-9, avgWidth * bufferFraction);

    const edges = [];

    for (let i = 0; i < n; i++) {
        const a = bboxes[i];
        for (let j = i + 1; j < n; j++) {
            const b = bboxes[j];

            // Check if boxes are close enough to be adjacent (allowing buffer)
            const separated = (
                a.maxX + buffer < b.minX - buffer ||
                a.minX - buffer > b.maxX + buffer ||
                a.maxY + buffer < b.minY - buffer ||
                a.minY - buffer > b.maxY + buffer
            );
            if (separated) continue;

            // Compute approximate shared boundary length as overlap on X or Y
            const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
            const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

            // If they overlap in area, take a larger of overlaps; otherwise if they only touch side, overlap will be >0 on one axis
            let shared = Math.max(overlapX, overlapY);

            // Fallback: if tiny overlap but boxes are nearly touching, set small positive weight
            if (shared <= 0) shared = buffer;

            edges.push({ source: nodes[i].id, target: nodes[j].id, weight: shared, i, j });
        }
    }

    return { nodes, edges, bboxes };
}
