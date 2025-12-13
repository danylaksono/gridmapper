import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * 
 * Inspired by Jo Wood's Grid Map Allocation
 * https://observablehq.com/@jwolondon/gridmap-allocation
 * 
 * (c) ${new Date().getFullYear()} ${pkg.author || 'Contributors'}
 * Released under the ${pkg.license} License
 */`;

export default [
  // Browser build (UMD)
  {
    input: 'src/index.js',
    output: {
      name: 'GridMapper',
      file: 'dist/gridmapper.umd.js',
      format: 'umd',
      banner,
      globals: {
        'glpk.js': 'glpk'
      }
    },
    external: ['glpk.js'],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      terser({
        compress: {
          drop_console: false
        }
      })
    ]
  },
  // ES module build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/gridmapper.esm.js',
      format: 'es',
      banner
    },
    external: ['glpk.js'],
    plugins: [
      resolve(),
      commonjs()
    ]
  },
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/gridmapper.cjs.js',
      format: 'cjs',
      banner,
      exports: 'named'
    },
    external: ['glpk.js'],
    plugins: [
      resolve(),
      commonjs()
    ]
  }
];

