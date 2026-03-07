/**
 * Demo script for Dorling Cartogram
 * 
 * Usage: node --experimental-modules demo/dorling-demo.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
    createDorlingCartogram, 
    createDemersCartogram,
    DorlingCartogram 
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load sample GeoJSON (US states or similar)
async function loadGeoJson(filename) {
    const filePath = path.join(__dirname, filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

async function main() {
    console.log('=== Dorling Cartogram Demo ===\n');
    
    try {
        // Load London boroughs data (has polygon geometry)
        const geojson = await loadGeoJson('london.geojson');
        console.log(`Loaded ${geojson.features?.length || 0} features`);
        
        if (geojson.features && geojson.features.length > 0) {
            // Add fake population data for demo
            geojson.features.forEach((f, i) => {
                // Simulate different population sizes
                f.properties.population = Math.pow(i + 1, 1.5) * 10000 + Math.random() * 50000;
            });
            
            const weightField = 'population';
            console.log(`Using "${weightField}" as weight field`);
            
            // Create Dorling cartogram (circles)
            console.log('\n--- Creating Dorling Cartogram (circles) ---');
            const dorlingResult = createDorlingCartogram(geojson, weightField, {
                shapeType: 'circle',
                k: 15,
                iterations: 2000,
                onProgress: (p) => {
                    if (p % 0.25 < 0.01) {
                        process.stdout.write(`Progress: ${Math.round(p * 100)}%\r`);
                    }
                }
            });
            console.log(`\nCreated ${dorlingResult.features.length} circle features`);
            console.log('Has overlaps:', dorlingResult.metadata.hasOverlaps);
            
            // Save output
            const outputPath = path.join(__dirname, 'dorling-output.json');
            fs.writeFileSync(outputPath, JSON.stringify(dorlingResult, null, 2));
            console.log(`Saved to: ${outputPath}`);
            
            // Create hexagon version
            console.log('\n--- Creating Hexagon Cartogram ---');
            const hexResult = createDorlingCartogram(geojson, weightField, {
                shapeType: 'hexagon',
                k: 15,
                iterations: 2000
            });
            console.log('Has overlaps:', hexResult.metadata.hasOverlaps);
            const hexOutputPath = path.join(__dirname, 'hexagon-output.json');
            fs.writeFileSync(hexOutputPath, JSON.stringify(hexResult, null, 2));
            console.log(`Saved hexagon cartogram to: ${hexOutputPath}`);
            
            // Create Demers cartogram (squares with adjacency)
            console.log('\n--- Creating Demers Cartogram (squares) ---');
            const demersResult = createDemersCartogram(geojson, weightField, {
                k: 15,
                iterations: 2000
            });
            console.log('Has overlaps:', demersResult.metadata.hasOverlaps);
            const demersOutputPath = path.join(__dirname, 'demers-output.json');
            fs.writeFileSync(demersOutputPath, JSON.stringify(demersResult, null, 2));
            console.log(`Saved Demers cartogram to: ${demersOutputPath}`);
            
            // Using class-based API
            console.log('\n--- Using DorlingCartogram class ---');
            const cartogram = new DorlingCartogram({ k: 10, iterations: 300 });
            const classResult = cartogram
                .setShapeType('circle')
                .setAdjacencyPreservation(true, 0.08)
                .create(geojson, weightField);
            console.log(`Class-based result: ${classResult.features.length} features`);
            
            console.log('\n=== Demo Complete ===');
        }
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
    }
}

main();
