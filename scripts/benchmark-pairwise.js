import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import glpk from 'glpk.js';
import { GLPKSolver } from '../src/solvers/glpk-solver.js';
import { GridMapper } from '../src/core/grid-mapper.js';
import { computeAdjacencyGraph } from '../src/utils/adjacency-graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoPath = path.resolve(__dirname, '../demo/london.geojson');
if (!fs.existsSync(demoPath)) {
    console.error('demo/london.geojson not found');
    process.exit(1);
}

const geo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
const mapper = new GridMapper();

(async () => {
    const data = geo.features.map((f, i) => ({ id: f.id ?? i, x: (f.properties?.lon ?? f.properties?.longitude) || 0, y: (f.properties?.lat ?? f.properties?.latitude) || 0 }));

    // Use GridMapper's processing by calling allocate with small options
    // But we need to measure invocation of solveAdvancedAllocation indirectly; we will call allocate with a custom mip factory

    const adjGraph = computeAdjacencyGraph(geo.features);

    const glpkInstance = await glpk();
    const mipFactory = () => new GLPKSolver(glpkInstance);

    // Baseline run without pairwise adjacency
    const t0 = Date.now();
    const resA = await mapper.allocate(geo.features.map((f,i) => ({ id: i, lon: (f.properties?.lon ?? f.properties?.longitude) || 0, lat: (f.properties?.lat ?? f.properties?.latitude) || 0 })), {
        xAccessor: d => d.lon,
        yAccessor: d => d.lat,
        mip: () => new GLPKSolver(glpkInstance),
        runPostProcess: false
    });
    const t1 = Date.now();

    // Run with sparse pairwise adjacency
    const resB = await mapper.allocate(geo.features.map((f,i) => ({ id: i, lon: (f.properties?.lon ?? f.properties?.longitude) || 0, lat: (f.properties?.lat ?? f.properties?.latitude) || 0 })), {
        xAccessor: d => d.lon,
        yAccessor: d => d.lat,
        mip: () => new GLPKSolver(glpkInstance),
        runPostProcess: false,
        // Pass adjacency graph and pairwise options
        adjacencyWeight: 0,
        pairwiseAdjacency: { enabled: true, weight: 0.5, edgeLimit: 200, nearestCells: 6 },
        adjacencyGraph: adjGraph
    });
    const t2 = Date.now();

    console.log('Baseline time (ms):', t1 - t0);
    console.log('Pairwise time (ms):', t2 - t1);

    // Attempt to capture pairwise var counts if present
    const pairwiseStats = {
        baselinePairwiseVars: resA?.pairwiseVarCount || 0,
        baselinePairwiseConstraints: resA?.pairwiseConstraintCount || 0,
        pairwiseVars: resB?.pairwiseVarCount || 0,
        pairwiseConstraints: resB?.pairwiseConstraintCount || 0
    };

    // Write summaries
    fs.writeFileSync(path.resolve(__dirname, '../demo/benchmark-pairwise.json'), JSON.stringify({ baselineTime: t1 - t0, pairwiseTime: t2 - t1, baselineScore: resA.meta.score, pairwiseScore: resB.meta.score, pairwiseStats }, null, 2));

    console.log('Wrote demo/benchmark-pairwise.json');
})();