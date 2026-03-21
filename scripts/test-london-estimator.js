import fs from 'fs';
import assert from 'assert';
import { estimateParameters } from '../src/utils/parameter-estimator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/london.geojson', import.meta.url)));
const out = estimateParameters(geo);
console.log('Estimator output:', out);

try {
  // Keep this test resilient to heuristic updates while preserving sane defaults.
  assert(out.rows >= 7 && out.rows <= 10, `Expected rows in [7,10], got ${out.rows}`);
  assert(out.cols >= 8 && out.cols <= 12, `Expected cols in [8,12], got ${out.cols}`);
  assert(out.compactness >= 0.5 && out.compactness <= 0.7, `Expected compactness in [0.5,0.7], got ${out.compactness}`);
  assert.strictEqual(out.rotateByPCA, false, `Expected rotateByPCA=false got ${out.rotateByPCA}`);
  console.log('London estimator test passed');
} catch (e) {
  console.error('London estimator test failed:', e.message);
  process.exit(1);
}
