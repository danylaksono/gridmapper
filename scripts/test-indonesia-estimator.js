import fs from 'fs';
import assert from 'assert';
import { estimateParameters } from '../src/utils/parameter-estimator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/indonesia_provinces.json', import.meta.url)));
const out = estimateParameters(geo);
console.log('Estimator output:', out);

try {
  // Indonesia-like sparse archipelago should avoid over-compact square defaults.
  assert(out.cols >= out.rows + 3, `Expected elongated layout, got ${out.rows}x${out.cols}`);
  assert(out.rows / out.cols < 0.7, `Expected rows/cols < 0.7, got ${out.rows / out.cols}`);
  assert(out.compactness >= 0.4 && out.compactness <= 0.65, `Expected compactness in [0.4,0.65], got ${out.compactness}`);
  console.log('Indonesia estimator test passed');
} catch (e) {
  console.error('Indonesia estimator test failed:', e.message);
  process.exit(1);
}
