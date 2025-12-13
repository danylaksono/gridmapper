import fs from 'fs';
import { computePolygonCentroid } from '../src/utils/polygon-centroid.js';
import { PCARotation } from '../src/features/pca-rotation.js';
import { calculateBounds } from '../src/normalization/bounds-calculator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/london.geojson', import.meta.url)));

const extracted = geo.features.map((feature) => {
    const geometry = feature.geometry;
    let x, y;
    if (geometry.type === 'Point') {
        x = geometry.coordinates[0];
        y = geometry.coordinates[1];
    } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        const c = computePolygonCentroid(geometry);
        if (c) { x = c.x; y = c.y; }
        else {
            const coords = geometry.coordinates[0];
            const sum = coords.reduce((acc, [lon, lat]) => ({ x: acc.x + lon, y: acc.y + lat }), { x: 0, y: 0 });
            x = sum.x / coords.length; y = sum.y / coords.length;
        }
    }
    const bounds = (() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const traverse = (coords) => {
            if (!Array.isArray(coords)) return;
            const first = coords[0];
            if (Array.isArray(first) && first.length > 0 && typeof first[0] !== 'number') { coords.forEach(traverse); return; }
            if (Array.isArray(first) && typeof first[0] === 'number') { coords.forEach(c => { if (c[0]<minX) minX=c[0]; if (c[0]>maxX) maxX=c[0]; if (c[1]<minY) minY=c[1]; if (c[1]>maxY) maxY=c[1]; }); return; }
            if (typeof coords[0] === 'number') { if (coords[0]<minX) minX=coords[0]; if (coords[0]>maxX) maxX=coords[0]; if (coords[1]<minY) minY=coords[1]; if (coords[1]>maxY) maxY=coords[1]; }
        };
        traverse(feature.geometry.coordinates);
        return { minX, maxX, minY, maxY, width: maxX-minX, height: maxY-minY, area: (maxX-minX)*(maxY-minY) };
    })();
    return { x, y, bounds };
});

const points = extracted.map(d => ({ x: d.x, y: d.y }));
const globalBounds = { minX: Math.min(...extracted.map(d=>d.bounds.minX)), maxX: Math.max(...extracted.map(d=>d.bounds.maxX)), minY: Math.min(...extracted.map(d=>d.bounds.minY)), maxY: Math.max(...extracted.map(d=>d.bounds.maxY)) };
globalBounds.width = globalBounds.maxX - globalBounds.minX; globalBounds.height = globalBounds.maxY - globalBounds.minY;

const pcaAngle = PCARotation.computeAngle(points);
const globalCentroid = { x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length };
const rotatedPoints = PCARotation.rotate(points, -pcaAngle, globalCentroid);
const rotatedPointsBounds = calculateBounds(rotatedPoints);
const pointsBounds = calculateBounds(points);

console.log('points:', points.length);
console.log('globalBounds:', globalBounds);
console.log('pointsBounds:', pointsBounds);
console.log('rotatedPointsBounds:', rotatedPointsBounds);

const areaOriginal = globalBounds.width * globalBounds.height;

const rotatedExtents = extracted.map(d => {
    const corners = [ {x:d.bounds.minX,y:d.bounds.minY}, {x:d.bounds.maxX,y:d.bounds.minY}, {x:d.bounds.maxY,y:d.bounds.maxY}, {x:d.bounds.minX,y:d.bounds.maxY} ];
    const rotatedCorners = PCARotation.rotate(corners, -pcaAngle, globalCentroid);
    return calculateBounds(rotatedCorners);
});
const rotatedGlobalBounds = { minX: Math.min(...rotatedExtents.map(d=>d.minX)), maxX: Math.max(...rotatedExtents.map(d=>d.maxX)), minY: Math.min(...rotatedExtents.map(d=>d.minY)), maxY: Math.max(...rotatedExtents.map(d=>d.maxY)) };
rotatedGlobalBounds.width = rotatedGlobalBounds.maxX - rotatedGlobalBounds.minX; rotatedGlobalBounds.height = rotatedGlobalBounds.maxY - rotatedGlobalBounds.minY;
console.log('rotatedGlobalBounds:', rotatedGlobalBounds);

const rawRatio = (rotatedPointsBounds.height / Math.max(rotatedPointsBounds.width, 1e-9));
console.log('rawRatio:', rawRatio);

const activeBounds = rotatedPointsBounds;
const rawRatio2 = activeBounds.height / Math.max(activeBounds.width, 1e-9);
console.log('activeBounds.w,h:', activeBounds.width, activeBounds.height);

const elongation = Math.max(activeBounds.width, activeBounds.height) / Math.max(1e-9, Math.min(activeBounds.width, activeBounds.height));
console.log('elongation:', elongation);

const slackBase = 0.35; const maxSlack = 1.0; const slack = Math.min(maxSlack, Math.max(0, (elongation - 1.3) * slackBase));
console.log('slack:', slack);

const mapArea = Math.max(globalBounds.width * globalBounds.height, 1e-9);
const totalFeatureArea = extracted.reduce((sum,d)=>sum+d.bounds.area,0);
const coverageRatio = Math.min(1, totalFeatureArea / mapArea);
console.log('coverageRatio:', coverageRatio);

console.log('first extracted bounds area sample:', extracted[0].bounds);

const adjacencyStats = (()=>{
  const n=extracted.length; const degrees=new Array(n).fill(0); const avgWidth = extracted.reduce((s,d)=>s+d.bounds.width,0)/n; const buffer = avgWidth*0.05;
  for(let i=0;i<n;i++){const a=extracted[i].bounds; for(let j=i+1;j<n;j++){const b=extracted[j].bounds; const overlap = !(a.maxX+buffer < b.minX-buffer || a.minX-buffer > b.maxX+buffer || a.maxY+buffer < b.minY-buffer || a.minY-buffer > b.maxY+buffer); if(overlap){degrees[i]++; degrees[j]++;}}}
  return { averageDegree: degrees.reduce((s,d)=>s+d,0)/n, maxDegree: Math.max(...degrees) };
})();
console.log('adjacencyStats:', adjacencyStats);

const coverageBoost = Math.max(0, coverageRatio - 0.35);
const adjacencyBoost = Math.max(0, (adjacencyStats.averageDegree || 0) - 2.5) * 0.15;
const densityBoost = coverageBoost + adjacencyBoost;
console.log('coverageBoost, adjacencyBoost, densityBoost:', coverageBoost, adjacencyBoost, densityBoost);

const pointsLen = points.length; const targetCells = Math.ceil(pointsLen * (1 + slack + densityBoost * 0.45));
console.log('pointsLen, targetCells:', pointsLen, targetCells);

import { calculateAutoDimensions } from '../src/features/auto-dimensions.js';
const rawRatio3 = activeBounds.height / Math.max(activeBounds.width, 1e-9);
let ratioOverride = rawRatio3;
ratioOverride = Math.min(2.4, Math.max(0.45, ratioOverride));
// bias for small, well-covered datasets
if (points.length < 50 && coverageBoost > 0.25) ratioOverride = ratioOverride * 0.5 + 0.5 * 0.85;
const sqrtN = Math.sqrt(pointsLen);
const elongationBoost = Math.max(0, Math.log2(Math.max(elongation, 1)));
const minRows = Math.max(1, Math.ceil(sqrtN * (1 + 0.10 * elongationBoost + densityBoost * 0.18)));
let minCols = Math.max(1, Math.ceil(sqrtN * (1 + (ratioOverride < 1 ? 0.18 : 0.35) * elongationBoost + densityBoost * 0.2)));
const maxColsCap = Math.max(3, Math.ceil(sqrtN * 3));
minCols = Math.min(minCols, maxColsCap);
console.log('sqrtN, elongationBoost, minRows, minCols, maxColsCap:', sqrtN, elongationBoost, minRows, minCols, maxColsCap);
console.log('ratioOverride:', ratioOverride);
// replicate calculateAutoDimensions initial steps for visibility
const safeAspect = ratioOverride > 0 ? ratioOverride : 1;
let colsInit = Math.round(Math.sqrt(targetCells / safeAspect)); if (colsInit < 1) colsInit = 1;
let rowsInit = Math.ceil(targetCells / colsInit);
console.log('initial colsInit, rowsInit:', colsInit, rowsInit);
console.log('calculateAutoDimensions ->', calculateAutoDimensions(pointsLen, activeBounds, { aspectRatio: ratioOverride, targetCellCount: targetCells, minRows, minCols }));
