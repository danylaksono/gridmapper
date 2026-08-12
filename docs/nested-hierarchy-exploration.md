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
- **Geography retention:** the treemap mosaic is only approximately
  geographic (ordered by centroid). A "spatially ordered treemap" or anchor
  placement would preserve relative positions better.
- **Per-level value scaling:** today leaves are one-unit cells; making cell area
  ∝ population (treemap at the leaf level) is a natural extension.
