#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeAdjacencyGraph } from '../src/utils/adjacency-graph.js';
import { embedGraph } from '../src/utils/graph-embed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoPath = path.resolve(__dirname, '../demo/london.geojson');
if (!fs.existsSync(demoPath)) {
    console.error('demo/london.geojson not found');
    process.exit(1);
}

const geo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
const adj = computeAdjacencyGraph(geo.features);
const embed = embedGraph(adj.nodes, adj.edges, { iterations: 300, width: 1, height: 1 });

const out = { nodes: adj.nodes.map(n => ({ id: n.id, props: n.properties })), edges: adj.edges, embedding: embed };
fs.writeFileSync(path.resolve(__dirname, '../demo/embedding-london.json'), JSON.stringify(out, null, 2));
console.log('Wrote demo/embedding-london.json — nodes:', adj.nodes.length, 'edges:', adj.edges.length);