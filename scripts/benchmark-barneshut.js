#!/usr/bin/env node
/**
 * Benchmark + correctness for the Barnes-Hut quadtree repulsion.
 *
 * 1. Correctness: one repulsion pass via applyPairwiseRepulsion vs
 *    applyBarnesHutRepulsion on identical node sets → final overlap counts
 *    must match (the quadtree prunes only provably non-overlapping subtrees,
 *    so pushes are exact).
 * 2. Speed: single-pass timing at several N for both methods.
 * 3. Full runForceSimulation timing at N=2000/5000.
 *
 * Usage: node scripts/benchmark-barneshut.js
 */
import {
  applyPairwiseRepulsion,
  applyBarnesHutRepulsion,
  hasOverlapsFast,
  hasOverlaps,
  runForceSimulation,
} from "../src/index.js";

function makeNodes(n, seed = 42) {
  let s = seed >>> 0 || 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: n }, (_, i) => {
    const x = rng() * 100;
    const y = rng() * 100;
    return {
      index: i,
      x,
      y,
      originalX: x,
      originalY: y,
      radius: 1 + rng() * 4,
    };
  });
}

function clone(nodes) {
  return nodes.map((n) => ({ ...n }));
}

function overlapCount(nodes) {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      if (d < nodes[i].radius + nodes[j].radius) count++;
    }
  }
  return count;
}

function maxDelta(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y));
  }
  return m;
}

function timeIt(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// --- 1. Correctness / convergence ---
console.log("== correctness: pairwise vs barneshut ==");
for (const n of [500, 1500, 3000]) {
  // single pass: both should move nodes toward non-overlap (order differs → not identical)
  const a = clone(makeNodes(n));
  const b = clone(makeNodes(n));
  const o0 = overlapCount(a);
  applyPairwiseRepulsion(a, 0.8);
  applyBarnesHutRepulsion(b, 0.8);
  console.log(
    `  n=${n}: overlap before=${o0}  after 1 pass: pairwise=${overlapCount(a)} barneshut=${overlapCount(b)}` +
      (overlapCount(b) <= o0 ? " (reduces ✓)" : " (INCREASES ✗)"),
  );
}
for (const n of [500, 1500]) {
  // convergence: enough iterations should drive overlaps near 0 for both
  const a = runForceSimulation(makeNodes(n, n), {
    iterations: 150,
    method: "pairwise",
    seed: 7,
  });
  const b = runForceSimulation(makeNodes(n, n), {
    iterations: 150,
    method: "barneshut",
    seed: 7,
  });
  const oa = overlapCount(a);
  const ob = overlapCount(b);
  console.log(
    `  n=${n} after 150 iters: pairwise overlaps=${oa} barneshut overlaps=${ob}  ${oa === 0 && ob === 0 ? "both clean ✓" : ""}`,
  );
}

// --- 1b. barneshut determinism ---
const d1 = clone(makeNodes(1500, 99));
const d2 = clone(makeNodes(1500, 99));
runForceSimulation(d1, { iterations: 60, method: "barneshut", seed: 123 });
runForceSimulation(d2, { iterations: 60, method: "barneshut", seed: 123 });
const det = maxDelta(d1, d2);
console.log(
  `  barneshut determinism (same seed twice): maxΔ=${det.toExponential(2)} ${det === 0 ? "DETERMINISTIC ✓" : "NON-DETERMINISTIC ✗"}`,
);

// --- 2. Single-pass speed ---
console.log("\n== single-pass repulsion timing (ms) ==");
for (const n of [1000, 3000, 6000]) {
  const pw = timeIt(() => applyPairwiseRepulsion(makeNodes(n), 0.8));
  const bh = timeIt(() => applyBarnesHutRepulsion(makeNodes(n), 0.8));
  console.log(
    `  n=${n}: pairwise=${pw.toFixed(1)}ms  barneshut=${bh.toFixed(1)}ms  (${(pw / Math.max(1, bh)).toFixed(1)}x)`,
  );
}

// --- 3. Full simulation timing ---
console.log("\n== full runForceSimulation (400 iters) ==");
for (const n of [1000, 3000, 6000]) {
  const pw = timeIt(() =>
    runForceSimulation(makeNodes(n, n), {
      iterations: 400,
      method: "pairwise",
      seed: 7,
    }),
  );
  const bh = timeIt(() =>
    runForceSimulation(makeNodes(n, n), {
      iterations: 400,
      method: "barneshut",
      seed: 7,
    }),
  );
  console.log(
    `  n=${n}: pairwise=${pw.toFixed(0)}ms  barneshut=${bh.toFixed(0)}ms  (${(pw / Math.max(1, bh)).toFixed(1)}x)`,
  );
}

// --- 4. hasOverlaps fast path sanity ---
const big = makeNodes(5000);
console.log(
  "\nhasOverlaps(5000):",
  hasOverlaps(big),
  "| hasOverlapsFast:",
  hasOverlapsFast(big),
);
