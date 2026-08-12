# Nested / Hierarchical Grid Cartograms — Exploration & Plan

Status: exploratory. Covers the two use cases raised for Indonesia's 4-level
administrative hierarchy (provinsi → kab_kota → kecamatan → kel_desa), the
scalability limits of the current engine (measured), the relevant research
landscape, and a concrete design proposal.

---

## 1. The data

Source folder: `D:\personal\github\kopdes\geo\geojson`

| Level     | # features | File size | Parent linkage (in properties)                     |
| --------- | ---------: | --------: | -------------------------------------------------- |
| provinsi  |         38 |    4.5 MB | —                                                  |
| kab_kota  |        514 |    9.3 MB | `provinsi_code`                                    |
| kecamatan |      7,275 |     34 MB | `provinsi_code`, `kab_kota_code`                   |
| kel_desa  |     83,518 |    166 MB | `provinsi_code`, `kab_kota_code`, `kecamatan_code` |

Each child feature already carries its ancestor codes, so building the tree is
trivial (group by `kecamatan_code`, then by `kab_kota_code`, then by
`provinsi_code`). Branching factors are healthy:

- provinsi → kab_kota: ~13.5 children/parent
- kab_kota → kecamatan: ~14.2 children/parent
- kecamatan → kel_desa: ~11.5 children/parent

That means **a hierarchical solver only ever needs to place ~10–15 children
inside a single parent** — a tiny problem at every level. This is the key to
scaling (Section 4).

---

## 2. Baseline: what breaks today

`scripts/probe-indonesia.js` (added for this exploration) measured the current
engine on real data. The MIP engine (GLPK.js, WASM) and the Dorling force
simulation (O(n²) per iteration):

| Level     | #feat | MIP grid allocation                      | Dorling (400 iter) |
| --------- | ----: | ---------------------------------------- | ------------------ |
| provinsi  |    38 | **61 ms** ✅                             | 24 ms ✅           |
| kab_kota  |   514 | **~65 s** ⚠️                             | 0.9 s ✅           |
| kecamatan | 2,000 | **GLPK crash: "no memory available"** ❌ | 13 s ⚠️            |
| kel_desa  | 2,000 | **GLPK crash** ❌                        | 12.5 s ⚠️          |

Diagnosis:

- **MIP blows up in both time and WASM memory.** The formulation creates
  `n_points × n_cells` binary variables. For 7,275 kecamatan on an ~85×85 grid
  that is ~52M binaries — far beyond GLPK.js's WASM heap. It already becomes
  impractical (~65 s) at just 514 points, i.e. roughly >500–1,000 features.
- **Dorling is O(n²) per iteration.** 2,000 features ≈ 2M pairs/iter ≈ 13 s for
  400 iters. Extrapolating: 7,275 kecamatan ≈ 26M pairs/iter (minutes), and
  83,518 villages ≈ 3.5B pairs/iter (intractable).
- **Even reading 166 MB of village GeoJSON as one JSON.parse is heavy.** The
  cartogram only needs centroids/bbox + parent codes, so the geometry payload
  can be dropped before allocation.

Conclusion: the current architecture cannot scale to 83k (or even 7k) features,
but **a hierarchical decomposition turns every subproblem into a few-dozen-item
allocation that the existing engine handles in milliseconds.** This is the
single most important architectural change, and it is also exactly what the
nested-layout use case needs.

---

## 3. Research landscape (prior art)

There is substantial prior work. The most directly relevant:

### 3.1 Grid / mosaic cartograms (what this repo already is)

- **Jo Wood, "Grid Map Allocation"** (Observable notebook, 2022) — the MIP-based
  grid-map allocation this repo is built on. Tile/mosaic cartograms: every
  region becomes an equal-size tile (square/hexagon) arranged to approximate
  geography.
- Tile grid maps are also called _gridded cartograms_, _mosaic cartograms_.
  Automatic layout preserving topology is an active topic (e.g. Eurostat,
  Japanese prefecture tile maps); most published layouts are still hand-tuned.

### 3.2 Rectangular cartograms (the "mosaic" parent level)

- **van Dijk, van Kreveld, Speckmann & Wolff, "RecMap: Rectangular Map
  Approximations"** (CGTA) — approximates each region by a rectangle in a
  mosaic, area ∝ value, preserving adjacencies. Implemented in the R `recmap`
  package (Panse, 2018, JSS).
- **Demers mosaic cartograms** — already implemented in this repo
  (`createDemersCartogram`).
- **de Berg, Mumford & Speckmann, "On rectilinear duals for vertex-weighted
  plane graphs"** (GD 2006 / CGTA) — better topology guarantees for rectangular
  layouts.
- **Wang et al., "A New Construction Method for Rectangular Cartograms"
  (ISPRS IJGI, 2025)** — survey + new construction method.

### 3.3 Nested / hierarchical cartograms (the core of this exploration)

- **Buchin, Speckmann & Verdonschot, "Adjacency-Preserving Spatial Treemaps"
  (CGTA 2013)** — the theoretical anchor. Rectangular layouts with a _hierarchical
  structure_: children nested inside parents while (when possible) preserving
  adjacency between siblings. Closely related to rectangular cartograms. This is
  precisely "village rectangles inside a kecamatan rectangle, kecamatan inside a
  kabupaten rectangle".
- **Wang et al., "Hierarchical Data Visualization Based on Rectangular
  Cartograms" (ISPRS IJGI 14(6):215, 2025)** — the closest direct match to your
  Case B: (1) build a rectangular cartogram (mosaic) of the top level, then
  (2) run a _treemap layout inside each rectangle_ to encode the child hierarchy.
- **Balzer, Deussen & Lewerentz, "Voronoi Treemaps" (SoftVis 2005)** — recursive
  subdivision of **any convex container** (circle, hexagon, polygon) into child
  cells, area ∝ weight. Ideal for "villages inside a hexagon-shaped kecamatan"
  when the parent mosaic uses non-rectangular tiles.
- **Auber et al., "GosperMap" (TVCG 2013)** — nested irregular shapes from a
  space-filling curve; each region contains its children, tree structure
  preserved. Interesting alternative aesthetic.
- **Dorling (1996), "Area Cartograms"** — the proportional-symbol parent idea
  (already implemented).

### 3.4 Large-N scalability (for the force-sim side)

- **Barnes & Hut, "A hierarchical O(N log N) force-calculation algorithm"
  (Nature 1986)** — quadtree-based n-body approximation. The standard way to take
  Dorling/force layouts from O(n²) to O(n log n); d3-force and most graph-drawing
  engines use it.
- **Multi-level force-directed layouts** (graph drawing literature: Hadany &
  Harel; Quigley & Eades; Hu) — coarsen → layout → refine. Same divide-and-conquer
  philosophy as hierarchical cartograms.
- d3-force-reuse (Two Six Tech) reuses the quadtree across iterations for further
  speedup.

### 3.5 Takeaway

The exact combination you describe — **"village cells inside kecamatan cells
where the kecamatan layer is itself a mosaic"** — is a known-but-still-active
research topic. The clean formulation is:

> **Strategy 1 (grid-in-grid / nested tile grid map):** parents are _blocks of
> equal unit cells_; children are packed inside the parent's block (treemap-style
> or local MIP). Every level stays on the same regular grid.
>
> **Strategy 2 (cartogram + treemap):** parents are _variable-size mosaic
> shapes_ (rectangles from RecMap/Demers, or circles/hexagons from Dorling);
> children are laid out inside each parent shape (treemap for rectangles, Voronoi
> treemap for arbitrary shapes).

Both reduce to one shared primitive: **pack children inside a parent footprint**.

---

## 4. Proposed design

### 4.1 Core primitive: pack children into a parent footprint

Given a parent footprint (a grid-cell block, a rectangle, or a convex polygon)
and its child features, produce child cells/shapes that:

1. **strictly lie inside the footprint** (containment constraint), and
2. **respect the children's relative geography** where possible, and
3. **do not overlap.**

Implementation options for a rectangular/rect-grid footprint:

- **Local grid + translation (recommended, reuses existing MIP):**
  - Normalize the children's geographic coordinates into a _local_ grid whose
    extent is the parent footprint (using the existing
    `normalizePointsToGrid` + bounds, but with the output domain = footprint).
  - Run the existing `allocate`/`solveAdvancedAllocation` on the local grid.
  - Map local cells back to global coordinates (`global = footprint.offset +
local`). Containment is guaranteed by construction because the local grid is
    inscribed in the footprint.
- **Squarified treemap** (Bruls et al. 2000) for rectangular footprints when the
  child weight (e.g. population) should control child cell area — produces
  variable-size rectangles instead of unit cells.
- **Voronoi treemap** for non-rectangular footprints (hexagon/circle/Dorling
  tiles).

### 4.2 Top level must be area-encoded by child count

A kecamatan with 60 villages needs a bigger footprint than one with 2. Therefore
the parent-level allocation must be **weighted by the number of descendants**
(or by a chosen value), i.e. the parent layer is a proper cartogram:

- Strategy 1: parent weight → number of unit cells in the block. Use a
  rectangular-cartogram/treemap pass so block shapes/areas ∝ weight, then tile
  the block.
- Strategy 2: parent area ∝ weight directly (RecMap/Demers/Dorling).

### 4.3 The two public modes

- **`mode: 'grid-in-grid'`** — Case A. One global grid; parents get blocks of
  cells; children are local-grid-allocated inside each parent block. Result:
  "village cells strictly inside kecamatan blocks which are strictly inside
  kabupaten blocks" — a perfectly regular tile grid at every level.
- **`mode: 'mosaic-treemap'`** — Case B. Top level is a mosaic cartogram
  (rectangles or Dorling shapes); each child level is treemap/Voronoi-laid inside
  its parent's shape. Result: the "kecamatan as mosaic, villages inside" look.

A parameter can also mix them (rect-grid parents + Dorling children, etc.).

### 4.4 Scalability plan

1. **Hierarchical decomposition (the main lever).** One giant MIP/O(n²) problem
   becomes thousands of tiny ones (~10–15 children per parent). Estimated cost
   for full Indonesia at kel_desa level: ~7,275 kecamatan subproblems × a few ms
   each → seconds, all independent (parallelizable via `Promise.all` /
   Web Workers).
2. **Spatial indexing for force sim.** Replace the O(n²) `applyPairwiseRepulsion`
   with a quadtree/Barnes-Hut pass (switch automatically above a node threshold).
   Keeps Dorling/Demers usable into the tens of thousands.
3. **Lightweight inputs.** Precompute per-level centroid/bbox + parent-code
   tables (strip geometry) so 166 MB of villages becomes a few MB. Allocation
   never needs the full polygons; they are only needed for final rendering.
4. **GLPK.js mitigation (band-aid, not the fix):** raising the WASM heap helps a
   little, but the real fix is decomposition so no single solve exceeds ~1–2k
   points.

---

## 5. Proposed module layout & API sketch

New `src/hierarchy/` module:

```
src/hierarchy/
  hierarchy-tree.js        // build parent→children tree from parent-code fields
  hierarchical-allocator.js// allocateHierarchical(data, options) — recursive driver
  footprint-packer.js      // pack children inside a footprint (local-grid MIP /
                           //   treemap / voronoi) — the shared primitive
  mosaic-cartogram.js      // top-level mosaic: rectangles (RecMap-style) or
                           //   reuse Demers/Dorling
  layout-mapper.js         // map local child cells back to global coords
```

API sketch:

```js
const result = await mapper.allocateHierarchical(data, {
  // tree shape
  idAccessor: (d) => d.code,
  parentAccessor: (d) => d.kecamatan_code, // omit for root level
  // per-level strategy
  levels: [
    { field: "provinsi_code", mode: "grid-in-grid" },
    { field: "kab_kota_code", mode: "grid-in-grid" },
    { field: "kecamatan_code", mode: "grid-in-grid" }, // or 'mosaic-treemap'
  ],
  weightAccessor: (d) => d.population, // drives parent area-encoding
  valueAccessor: (d) => d.population, // drives child cell size (optional)
  mip: () => new GLPKSolver(glpk),
  // output: every feature gets global cell/center + full ancestor cell path
});

// result.hierarchy = tree with per-node footprint + per-feature final cell
```

Containment is **hard-guaranteed by construction** (children are solved inside a
local grid inscribed in the parent footprint), so no post-hoc overlap repair is
needed between levels — only within a footprint, which existing post-processing
already handles.

---

## 6. Milestones

- **M1 — Proof of concept (grid-in-grid).** Tree builder + footprint packer
  reusing the existing MIP allocation locally. Target: full kecamatan layer
  (7,275) and full kel_desa layer (83,518) allocated in seconds, with village
  cells provably inside kecamatan blocks. Validate with a probe script +
  `createGridGeoJson` export.
- **M2 — Mosaic parent level.** Demers/RecMap-style rectangular mosaic (or reuse
  existing Dorling) so kecamatan "shapes as mosaic"; children treemap-packed
  inside. This is the "shaped as mosaic" Case B.
- **M3 — Scalability hardening.** Quadtree/Barnes-Hut repulsion for the force
  sim; lightweight centroid/bbox preprocessing of inputs; parallel subproblem
  solving; docs + README + demo integration.

## 7. Open questions (worth deciding before building)

1. **Cell geometry per level** — do you want unit-cell blocks at every level
   (Strategy 1, keeps one global grid) or variable-size shapes per level
   (Strategy 2, more "cartogram-like")?
2. **What encodes area at the parent level** — descendant count, population,
   or a per-level value you pick?
3. **Inter-level alignment** — must child grids be axis-aligned inside the
   parent block (easy), or should parent blocks themselves be rotatable to fit
   child grids better?
4. **Which is more important to you first:** correctness of the nested
   containment (research-y, interesting) or raw throughput on 83k villages
   (engineering-heavy)?

---

## 8. Prototype status (M1 — grid-in-grid) ✅

A working prototype was built and validated on the real Indonesia data.

### What was built

New module `src/hierarchy/` (exported from `src/index.js`):

| File                        | Purpose                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hierarchy-tree.js`         | Builds the parent→children tree from per-level parent-code fields (`buildHierarchy`).                                                                                                              |
| `grid-treemap.js`           | Exact integer-cell, guillotine/binary-split treemap (`gridTreemap`). Variable-size rectangular blocks, area ∝ weight, each block ≥ its minimum.                                                    |
| `footprint-packer.js`       | Packs leaf features one-per-cell inside a parent block, reusing the existing MIP engine on a local grid (`packLeavesIntoBlock`); greedy for tiny blocks; sub-grid fallback for under-sized blocks. |
| `hierarchical-allocator.js` | Recursive driver `allocateHierarchical`: treemap the coarsest level on the global grid, then each level subdivides its parent's block, leaves are MIP-packed. Containment by construction.         |

API:

```js
const result = await mapper.allocateHierarchical(villages, {
  levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"], // coarse → fine
  xAccessor: (d) => d.x,
  yAccessor: (d) => d.y,
  mip: () => new GLPKSolver(glpk),
  compactness: 0.5,
});
// result.assignments[i] = { ...village, gridX, gridY, _path: [provId, kabId, kecId], _block }
// result.hierarchy   = tree of nodes each with a `_block` rect
```

Validation scripts: `scripts/probe-hierarchy.js` (timing + containment),
`scripts/render-hierarchy-svg.js` (visual), `scripts/probe-indonesia.js`
(baseline of the old engine).

### Measured results (real data)

| Level                 | # features |          Hierarchical allocator |  Old engine |
| --------------------- | ---------: | ------------------------------: | ----------: |
| provinsi              |         38 |                          ~60 ms |       61 ms |
| kab_kota              |        514 | — (same engine, ~65 s baseline) |       ~65 s |
| kecamatan (as leaves) |      7,275 |                   **~1.7 s** ✅ |  GLPK crash |
| kel_desa (villages)   |     83,518 |                  **~15.3 s** ✅ | intractable |

- **Containment: 100%** — every village cell lies inside its kecamatan block,
  which lies inside its kabupaten block, inside its province block (validated
  programmatically on the full 83,518 run).
- **Deterministic:** identical input → identical output (verified at 20k).
- **No duplicate cells** across the whole grid.
- Sub-grid fallback triggered on only **241 / 7,275 kecamatan (0.3%)** in the
  full run (pathological treemap shapes); all still strictly inside their blocks.

### Design decisions (learned while building)

1. **Mins = leaf count at every level; slack flows down proportionally.**
   Applying a per-level `minFactor` to children _breaks_ the invariant
   `sum(child mins) ≤ parent block` (ceil inflation compounds). Instead the
   top-level grid carries the slack (default 1.35×) and each treemap level
   distributes its leftover proportionally, so every level gets ~1.35× headroom.
2. **Integer-rectangle treemaps cannot always satisfy minima.** A parent block
   like 6×3 with child minima summing to 17 is mathematically unsplittable into
   integer sub-rects meeting the minima. No treemap avoids this. Two mitigations
   used:
   - `gridTreemap` degrades gracefully (best-effort splits, never throws).
   - `packLeavesIntoBlock` **subdivides** an under-sized leaf-parent's interior
     into finer sub-cells so the leaf MIP always has capacity — guaranteed
     contained, no overlap, no repair cascade.
3. **The leaf MIP is the only expensive step** (~7,275 tiny solves in the full
   run) — already fast, and trivially parallelizable via Web Workers.

### Known limitations / next steps

- **M2 — mosaic parent level (your Case B):** currently every level is a
  treemap of rectangles. A "kecamatan as mosaic / villages inside" look needs a
  rectangular-cartogram (RecMap/Demers) or Dorling top level with children
  treemap-packed inside each shape (Voronoi treemap for non-rect shapes). The
  `footprint-packer` primitive is reusable.
- **M3 — scaling hardening:** quadtree/Barnes–Hut for the force-sim side
  (O(n²) today), parallel leaf MIPs, lightweight centroid/bbox input
  preprocessing (skip 166 MB polygon payloads), streaming GeoJSON.
- **Geography retention (implemented, see §9):** a data-adaptive spatial
  ordering is now the default (`order: 'spatial'`). The one-axis-vs-balance
  trade-off is inherent to guillotine area-balance treemaps; a proper
  path-following Hilbert layout (Wood & Dykes 2008) is the main remaining
  improvement and a candidate for future work.
- **Per-level value scaling:** today leaves are one-unit cells; making cell area
  ∝ population (treemap at the leaf level) is a natural extension.

---

## 9. Geography retention (implemented)

### What was added

- `src/hierarchy/spatial-order.js` — `hilbertIndex`, `orderByMorton` (Z-order),
  and `orderByHilbert` helpers.
- `gridTreemap` now accepts `positionOf`, `orderMode`, `dirPolicy`, and `extent`:
  - **orderMode** — `'input' | 'hilbert' | 'z' | 'xy' | 'xyDesc' | 'yx' | 'yxDesc'`
    (sort items before the area-balance layout).
  - **dirPolicy** — `'aspect' | 'spread' | 'spreadNorm' | 'orderKey'` (how each
    split direction is chosen).
- `allocateHierarchical` accepts `order: 'spatial' | 'input'` (default
  `'spatial'`) with advanced overrides `orderMode` / `dirPolicy`.

### Default (data-adaptive)

Wider-than-tall maps (like Indonesia) → `orderMode: 'xy'`, `dirPolicy:
'spreadNorm'` (east–west first, then north–south within each region).
Taller-than-wide maps → `orderMode: 'yxDesc'`, `dirPolicy: 'spreadNorm'`
(north–south first).

### Measured improvement (Spearman geo↔cell, north=top)

| Layer             | `input` mean | `spatial` mean | X / Y (spatial) |
| ----------------- | -----------: | -------------: | --------------: |
| kecamatan (7,275) |        0.361 |      **0.495** |   0.764 / 0.227 |
| kel_desa (15,000) |        0.177 |      **0.552** |   0.766 / 0.338 |

Containment and determinism are unaffected; the full 83,518-village run still
passes 100% containment in ~16.7 s (and the spatial ordering reduced the number
of sub-divided leaf blocks from 241 to 153).

### Known trade-off

A guillotine **area-balance** treemap can make **one axis near-perfect** (`xy`
→ X≈0.997; `yxDesc` → Y≈0.978) but cannot preserve both axes strongly, because
a single global sort can't be consistent with adaptive two-axis guillotine cuts.
`spreadNorm` gives the best balance (both axes positive) and is the default.
Z-order + `spreadNorm` is the most even (X≈0.43, Y≈0.36) and can be selected via
`orderMode: 'z'`. A path-following Hilbert layout would be the principled fix
but is deferred.

Visuals: `demo/hierarchy-render-spatial.svg` / `-input.svg` (same grid size,
directly comparable) and `-zoom` variants. Metric: `scripts/measure-geography.js`.

---

## 10. Mosaic parent level — Case B (implemented)

### What was added

- `src/hierarchy/mosaic-allocator.js` — `allocateMosaicHierarchical(features,
options)`. The parent level (e.g. kecamatan) is laid out as a value-scaled
  mosaic and the finest features (villages) are packed inside each shape.
  - **`shapeType: 'rect'`** — rectangular mosaic via the exact-cell treemap
    (area ∝ value, geography-aware). Default.
  - **`shapeType: 'circle' | 'hex'`** — Dorling-style shapes via the existing
    force simulation (`runForceSimulation`, `weightToRadius`,
    `calculateScaleFactor`).
  - Children are packed one-per-cell inside each shape: rect blocks reuse
    `packLeavesIntoBlock`; circle/hex use a local grid inscribed in the shape's
    bounding box with hard spacers outside the polygon (reuses
    `SpacerUtils.autoCompute` + `solveAdvancedAllocation`).
  - Area scaling: shape area ∝ `weightOf(feature)` summed over descendants,
    floored by descendant count so every shape can hold its children.
- Exported from `src/index.js`.

### Measured results

| shapeType | leaves | shapes |    time |     containment |
| --------- | -----: | -----: | ------: | --------------: |
| rect      | 83,518 |  7,276 | ~16.9 s | 83,518/83,518 ✓ |
| circle    | 10,000 |  1,237 | ~11.5 s | 10,000/10,000 ✓ |
| hex       | 10,000 |  1,237 | ~11.2 s | 10,000/10,000 ✓ |

Containment is guaranteed by construction (local grid inscribed in each shape,
or the shape mask excludes out-of-polygon cells) and validated point-in-polygon.

### Notes / limitations

- Dorling force simulation is O(n²) per iteration, so `circle`/`hex` at the
  full 7,275-kecamatan scale is slow (a few minutes). This is exactly the
  Barnes–Hut work planned under **M3**. The rect mosaic scales to 83k in ~17 s.
- The mosaic is currently at the leaf-parent level (kecamatan); "mosaic nested
  inside a coarser treemap block" (hybrid) is a future extension.
- API sketch:

```js
const result = await allocateMosaicHierarchical(villages, {
  levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
  shapeType: "circle", // 'rect' | 'circle' | 'hex'
  weightOf: (d) => d.population, // scale shape area by population
  xAccessor: (d) => d.x,
  yAccessor: (d) => d.y,
  mip: () => new GLPKSolver(glpk),
  seed: 1,
});
// result.shapes: mosaic shapes { id, type, bbox, shapeRows, shapeCols, polygon, weight }
// result.assignments[i]: { ...village, _shapeId, _shape, gridX, gridY (shape-local) }
```

Visuals: `demo/mosaic-rect.svg` (full 83k), `demo/mosaic-circle.svg`,
`demo/mosaic-hex.svg` (+ `.png`). Probe: `scripts/probe-mosaic.js
[cap] [shapeType] [--render]`.

---

## 11. Island separation (archipelago preservation)

### The problem

The initial layouts did **not** preserve inter-island separation for an
archipelago like Indonesia:

- the **rect/treemap** mosaic _tiles the grid completely_, so two islands (e.g.
  Java and Sumatra) became adjacent rectangles sharing a hard edge — no "sea";
- the **Dorling** layout only pushed circles apart until they _touched_
  (non-overlapping but tangent) — again no water gap.

### What was added

- `src/hierarchy/islands.js` — `detectIslands(nodes, { positionOf,
islandAccessor?, seaGapKm? })`. Explicit island ids via `islandAccessor`, or
  automatic union-find over nodes whose geodesic distance < `seaGapKm`
  (spatial-binned, near-linear). Narrow straits will merge unless `seaGapKm`
  is small or an explicit accessor is supplied.
- `force-simulation.js` — `applyPairwiseRepulsion` / `runForceSimulation`
  accept `islandOf` + `islandGap` (fractional extra separation between
  different islands). Backward compatible (no islands → same behavior).
- `allocateMosaicHierarchical` new options:
  - `islandAccessor`, `seaGapKm` (default 30 km) — detect islands.
  - `islandGap` (default 0.25) — circle/hex: sea gap between island shapes.
  - `seaGutter` (default 1) — rect: cells of gap between island blocks, via a
    two-level layout (islands → members) with gutter headroom so blocks never
    underfill.

### Measured effect (6,000 villages, auto-detected 4 islands)

| shapeType | metric                            | OFF   | ON        |
| --------- | --------------------------------- | ----- | --------- |
| circle    | overlapping cross-island pairs    | 188   | **0**     |
| circle    | min center-dist / Σr              | 0.971 | **1.369** |
| rect      | edge-adjacent cross-island blocks | 62    | **0**     |

Full 83,518-village rect mosaic: **100% containment, 0 underfilled shapes,
~17 s** (the gutter headroom fix also removed the earlier sub-grid underfills).

### Notes

- Automatic island detection is a heuristic (`seaGapKm`); for accurate island
  grouping supply an explicit `islandAccessor` (e.g. an island property, or a
  derived province→island map).
- The sea gutter only applies between _different_ islands — regions within the
  same island stay contiguous.
- Visuals: `demo/islands-circle.svg`, `demo/islands-rect.svg` (+ `.png`, islands
  color-coded). Probe: `scripts/probe-islands.js [cap] [--render]`.

---

## 12. M3 — scaling hardening (Barnes–Hut force simulation)

### The problem

The Dorling force simulation is O(n²) per iteration (`applyPairwiseRepulsion`),
which made the full-scale circle/hex mosaic (7,275 kecamatan) take minutes and
was the main blocker left from M2.

### What was added (`force-simulation.js`)

- **`applyBarnesHutRepulsion`** — a quadtree-accelerated repulsion pass. The
  interaction is strictly local (only pairs within `r_i + r_j` are pushed), so
  instead of an approximate n-body force it uses the quadtree purely for
  **exact pruning**: any subtree whose bounding circle provably cannot reach a
  node is skipped. Per-pair pushes are computed identically, so the result
  matches the O(n²) pass (only the pair-processing order differs → tiny float
  divergence, same convergence). Deterministic.
  - Safe island-gap pruning: prune iff
    `dist(i, cell) > (r_i + cell.br) · (1 + islandGap)` (never skips a
    cross-island overlap).
- **`hasOverlapsFast`** — exact quadtree-pruned overlap existence check;
  `hasOverlaps` auto-delegates to it for > 200 circle/hexagon nodes.
- **`runForceSimulation`** accepts `method: 'auto' | 'pairwise' | 'barneshut'`
  (default `auto` → Barnes–Hut for > 1500 nodes).
- `allocateMosaicHierarchical` accepts `dorlingMethod` passthrough and
  **auto-scales Dorling iterations** for large layouts (800 → ~110 at 7,275
  kecamatan), since overlap reduction is asymptotic.

### Measured (real data)

| case                                   | pairwise              | barneshut                                    |
| -------------------------------------- | --------------------- | -------------------------------------------- |
| circle, 2,734 kecamatan (200 iters)    | ~56 s                 | **~39 s** (1.4×)                             |
| full 83,518 villages / 7,276 kecamatan | ~7 min (extrapolated) | **~2 min** (100% containment, 0 underfilled) |

Correctness: both methods reduce overlaps to ~the same level and are
deterministic; the quadtree version resolves overlaps as well or better than
the O(n²) pass. Synthetic dense stress-tests show larger speedups (up to ~3.4×
at n=6000) because pruning is most effective for well-separated layouts.

### Remaining M3 items

- ~~**Parallel leaf MIPs**~~ — **done, see §13**.
- ~~**Centroid-only inputs**~~ — **done, see §14**.
- **Streaming GeoJSON** for the raw input read (the centroid table already
  makes this unnecessary for allocation; still useful if a layer has no
  precomputed table).

Benchmark: `scripts/benchmark-barneshut.js`. Probe: `scripts/probe-mosaic.js
[cap] [shapeType] [--render]`.

---

## 13. M3 — parallel leaf packing (worker_threads)

The 7,276 kecamatan packing solves are independent, but `glpk.js`'s `solve()`
is **synchronous**, so a JS-side concurrency pool would give no real speedup.
Real parallelism uses **worker_threads** — each worker has its own V8 isolate
and its own GLPK.js WASM instance.

### What was added

- `src/utils/parallel.js` — `runWorkerPool(tasks, workerUrl, { concurrency })`.
  Dynamic `import("worker_threads")` so the browser bundle is unaffected;
  callers fall back to sequential when workers are unavailable.
- `src/hierarchy/pack-worker.js` — worker entry that packs leaves into a
  block (`packLeavesIntoBlock`) or a shape (`packIntoShape`) with its own GLPK.
- Both allocators now run the independent leaf-packing solves through the pool:
  - `allocateHierarchical` — two-phase: (A) assign blocks to every node via the
    treemap, then (B) pack all leaf-parents in parallel.
  - `allocateMosaicHierarchical` — parallel per-shape packing (rect + circle/hex).
  - `concurrency` option (default 0 = auto `min(8, cpuCount-1)` in Node;
    `1` forces sequential; browser always sequential).

### Measured

| case                             | sequential | parallel (4) |  speedup | output identical |
| -------------------------------- | ---------: | -----------: | -------: | :--------------: |
| hierarchical, 12,000 villages    |   5,794 ms |     2,208 ms | **2.6×** |        ✓         |
| mosaic rect, 12,000 villages     |   5,571 ms |     2,172 ms | **2.6×** |        ✓         |
| mosaic circle, 10,000 (200 iter) |  14,376 ms |    11,876 ms | **1.2×** |        ✓         |
| full rect mosaic, 83,518         |   ~17–50 s |  **~12.7 s** |   1.4–4× |        ✓         |

Output is **deterministically identical** to the sequential path (task order
and per-parent child order are preserved).

---

## 14. M3 — centroid-only inputs (precomputed centroid table)

The allocators never touch polygon geometry — per leaf feature they only need
an id, a centroid, a weight and the parent-code fields. Yet the kel_desa layer
is a 166 MB GeoJSON with 83,518 MultiPolygons, and every allocation run used to
`JSON.parse` all of it just to throw the geometry away. Centroid-only input
fixes that: the heavy payload is never read by the allocator path.

### What was added

- `src/hierarchy/centroid-table.js`:
  - `extractCentroidRecords(features, { idAccessor, coordsOf, weightOf,
levelKeys, extra, includeBBox })` — copies out only `{ id, x, y, weight,
...parentCodes, ...extra }`; accepts full GeoJSON features **or** already
    light records, tolerating `.properties` nesting.
  - `loadCentroidRecords(path)` / `saveCentroidRecords(path, records)` —
    `.json` (array) or `.jsonl` (NDJSON). NDJSON is streamed line-by-line via
    `readline`, so even a huge table never lives as one giant string/array.
  - `mergeAssignmentsToFeatures(features, assignments, { idAccessor,
assignmentIdOf, inPlace })` — attaches `gridX/gridY/_path/_shape/...` back
    onto the **full** features by id, so rendering still has the geometry.
  - `centroidOfFeature(geometry)` — fast mean-of-vertices centroid (matches the
    probe scripts' arithmetic mean → cell-for-cell identical output).
  - Node I/O is dynamically imported (`node:fs`, `node:readline`), so the
    browser bundle is unaffected; extract/merge are pure and work everywhere.
- `scripts/build-centroid-table.js` — one-time precompute; writes
  `kel_desa.centroids.jsonl` (14 MB for 83,518 records).
- `scripts/probe-centroid.js [cap] [--merge]` — end-to-end: build-if-missing →
  stream-load centroids → allocate hierarchical + mosaic rect → validate
  containment; `--merge` also loads the full GeoJSON and attaches the grid back.
- Exported from `src/index.js`.

### Measured

| step                      | full 83,518 villages                                         |
| ------------------------- | ------------------------------------------------------------ |
| table load (14 MB NDJSON) | **271 ms** (vs ~2–3 s + ~700 MB to parse the 166 MB GeoJSON) |
| hierarchical allocation   | ~8 s (100% containment)                                      |
| mosaic rect allocation    | ~13.7 s (100% containment)                                   |
| merge-back (20,000, opt)  | 20,000/20,000 features got grid fields, geometry preserved   |

Disk: **14 MB** table vs **166 MB** GeoJSON (~12× smaller). Memory: the
allocation path now holds only lightweight records, not 83,518 parsed
MultiPolygons.

### Usage

```js
import { loadCentroidRecords, allocateHierarchical } from "gridmapper";

const data = await loadCentroidRecords("kel_desa.centroids.jsonl"); // never touches geometry
const res = await allocateHierarchical(data, {
  levels: ["provinsi_code", "kab_kota_code", "kecamatan_code"],
  xAccessor: (d) => d.x,
  yAccessor: (d) => d.y,
  idAccessor: (d) => d.id,
  mip, // GLPKSolver
});
// later, for rendering with real geometry:
const enriched = mergeAssignmentsToFeatures(
  fullGeoJsonFeatures,
  res.assignments,
  { idAccessor: (d) => d.properties.code, assignmentIdOf: (a) => a.id },
);
```
