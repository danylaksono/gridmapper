#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDorlingCartogram } from '../src/cartogram/dorling-cartogram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const geoPath = path.resolve(__dirname, '../demo/london.geojson');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function nearlyEqual(a, b, eps = 1e-10) {
    return Math.abs(a - b) <= eps;
}

function getFirstCenters(result, count = 8) {
    return result.features.slice(0, count).map((f) => {
        const c = f.properties?._cartogram;
        return { x: c?.x, y: c?.y, r: c?.radius };
    });
}

function compareCenters(a, b, eps = 1e-10) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!nearlyEqual(a[i].x, b[i].x, eps)) return false;
        if (!nearlyEqual(a[i].y, b[i].y, eps)) return false;
        if (!nearlyEqual(a[i].r, b[i].r, eps)) return false;
    }
    return true;
}

function main() {
    if (!fs.existsSync(geoPath)) {
        throw new Error('demo/london.geojson not found');
    }

    const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
    assert(Array.isArray(geo.features) && geo.features.length > 0, 'Invalid demo GeoJSON');

    // Deterministic synthetic weight field for reproducible checks.
    geo.features.forEach((f, i) => {
        f.properties = f.properties || {};
        f.properties.__dorlingWeight = (i + 1) * (i + 2);
    });

    const common = {
        shapeType: 'circle',
        iterations: 900,
        k: 12,
        refineOverlaps: true,
        refinementIterations: 800,
        preserveAdjacency: true,
        adjacencyStrength: 0.06,
        anchorStrength: 0.01
    };

    const r1 = createDorlingCartogram(geo, '__dorlingWeight', { ...common, seed: 12345 });
    const r2 = createDorlingCartogram(geo, '__dorlingWeight', { ...common, seed: 12345 });

    assert(r1.metadata?.featureCount === geo.features.length, 'Unexpected feature count in metadata');
    assert(r1.features.length === geo.features.length, 'Output feature count mismatch');
    assert(typeof r1.metadata?.hasOverlaps === 'boolean', 'Missing hasOverlaps metadata');

    const c1 = getFirstCenters(r1);
    const c2 = getFirstCenters(r2);
    assert(compareCenters(c1, c2), 'Deterministic run failed: same seed produced different output');

    // Basic schema check for cartogram metadata on features.
    const sample = r1.features[0]?.properties?._cartogram;
    assert(sample && Number.isFinite(sample.x) && Number.isFinite(sample.y), 'Missing _cartogram center metadata');
    assert(Number.isFinite(sample.radius) && sample.radius > 0, 'Invalid cartogram radius metadata');

    console.log('[test-dorling] PASS');
    console.log('[test-dorling] features:', r1.features.length, 'hasOverlaps:', r1.metadata.hasOverlaps, 'refinementApplied:', r1.metadata.refinementApplied);
}

try {
    main();
} catch (error) {
    console.error('[test-dorling] FAIL:', error.message);
    process.exit(1);
}
