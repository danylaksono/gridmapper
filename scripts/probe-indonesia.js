#!/usr/bin/env node
/**
 * Scale probe: Indonesia administrative hierarchy (4 levels).
 * Measures grid allocation + Dorling timings at each level to expose
 * where the current library breaks down.
 *
 * Run: node scripts/probe-indonesia.js
 */
import fs from 'fs';
import glpkImport from 'glpk.js';
import { GridMapper } from '../src/index.js';
import { GLPKSolver } from '../src/solvers/glpk-solver.js';
import { createDorlingCartogram } from '../src/cartogram/dorling-cartogram.js';

const GEO = 'D:/personal/github/kopdes/geo/geojson';
const LEVELS = ['provinsi', 'kab_kota', 'kecamatan', 'kel_desa'];

function load(name) {
    const raw = fs.readFileSync(`${GEO}/${name}.geojson`, 'utf8');
    return JSON.parse(raw);
}

function centroid(feature) {
    // cheap polygon centroid (first ring mean) — good enough for probe
    const coords = feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates.flat(2)
        : feature.geometry.coordinates.flat(1);
    let x = 0, y = 0;
    for (const [px, py] of coords) { x += px; y += py; }
    const n = coords.length;
    return [x / n, y / n];
}

async function main() {
    const glpk = await glpkImport();
    const mapper = new GridMapper();
    const cap = process.argv[2] ? Number(process.argv[2]) : Infinity; // optional n cap

    console.log('level\tfeatures\tdims\tsolveTime(ms)\tgridType\tstatus');
    for (const level of LEVELS) {
        const geo = load(level);
        let features = geo.features;
        if (features.length > cap) features = features.slice(0, cap);

        const data = features.map((f, i) => {
            const [x, y] = centroid(f);
            return { id: i, name: f.properties.name, x, y };
        });

        // ---- Grid allocation (MIP) ----
        let gridResult = null;
        try {
            const t0 = performance.now();
            gridResult = await mapper.allocate(data, {
                xAccessor: d => d.x,
                yAccessor: d => d.y,
                compactness: 0.5,
                mip: () => new GLPKSolver(glpk),
                gridType: 'rect'
            });
            const dt = Math.round(performance.now() - t0);
            console.log(`${level}\t${data.length}\t${gridResult.meta.rows}x${gridResult.meta.cols}\t${dt}\trect\t${gridResult.meta.isFeasible ? 'optimal' : 'infeasible'}`);
        } catch (e) {
            console.log(`${level}\t${data.length}\t-\tERR\t-\t${e.message.slice(0, 80)}`);
        }

        // ---- Dorling (force sim, O(n^2) per iter) ----
        if (data.length <= 3000) {
            try {
                const geoWithW = { type: 'FeatureCollection', features: features.map((f, i) => ({ ...f, properties: { ...f.properties, __w: i + 1 } })) };
                const t1 = performance.now();
                const dorl = createDorlingCartogram(geoWithW, '__w', {
                    shapeType: 'circle', iterations: 400, k: 12, refineOverlaps: false, seed: 1
                });
                const dt = Math.round(performance.now() - t1);
                console.log(`  dorling\t${data.length}\t-\t${dt}\tcircle\tfeatures=${dorl.features.length}`);
            } catch (e) {
                console.log(`  dorling\t${data.length}\t-\tERR\t-\t${e.message.slice(0, 80)}`);
            }
        } else {
            console.log(`  dorling\t${data.length}\t-\tskip\t-\t(O(n^2) too slow above ~3k)`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
