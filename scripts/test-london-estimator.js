import fs from 'fs';
import assert from 'assert';
import { estimateParameters } from '../src/utils/parameter-estimator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/london.geojson', import.meta.url)));
const out = estimateParameters(geo);
console.log('Estimator output:', out);

try {
  assert.strictEqual(out.rows, 8, `Expected rows=8 got ${out.rows}`);
  assert.strictEqual(out.cols, 9, `Expected cols=9 got ${out.cols}`);
  // Allow small floating tolerance for compactness
  assert(Math.abs(out.compactness - 0.6) < 1e-9, `Expected compactness=0.6 got ${out.compactness}`);
  console.log('London estimator test passed');
} catch (e) {
  console.error('London estimator test failed:', e.message);
  process.exit(1);
}
