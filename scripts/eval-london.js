import fs from 'fs';
import { estimateParameters } from '../src/utils/parameter-estimator.js';

const geo = JSON.parse(fs.readFileSync(new URL('../demo/london.geojson', import.meta.url)));
const result = estimateParameters(geo);
console.log(JSON.stringify(result, null, 2));
