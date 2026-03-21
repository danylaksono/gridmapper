import fs from 'fs';
import assert from 'assert';
import { estimateParameters } from '../src/utils/parameter-estimator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/japan.geojson', import.meta.url)));
const out = estimateParameters(geo);
console.log('Estimator output:', out);

try {
  // Japan is an elongated chain; a robust estimator should keep a clearly wide grid.
  assert.strictEqual(out.rotateByPCA, true, `Expected rotateByPCA=true got ${out.rotateByPCA}`);
  assert(out.cols >= out.rows + 6, `Expected cols to significantly exceed rows, got ${out.rows}x${out.cols}`);
  assert(out.rows / out.cols < 0.6, `Expected aspect ratio rows/cols < 0.6, got ${out.rows / out.cols}`);
  assert(out.compactness >= 0.45 && out.compactness <= 0.75, `Expected compactness in [0.45,0.75], got ${out.compactness}`);
  console.log('Japan estimator test passed');
} catch (e) {
  console.error('Japan estimator test failed:', e.message);
  process.exit(1);
}
