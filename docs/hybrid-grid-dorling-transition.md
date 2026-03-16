# Hybrid Grid-to-Dorling Transition Plan

## Summary

This document proposes a hybrid cartogram mode that starts from the existing grid allocation result and progressively relaxes into a collision-free proportional-symbol layout. The goal is to create a controllable transition between:

- discrete, topology-aware grid assignment (current strength of this library), and
- continuous, overlap-resolved symbol placement (Dorling-like behavior).

This approach intentionally reuses existing components in the codebase instead of introducing a separate graph-based method.

## Why this is useful

The current library has two strong but separate pathways:

- Grid allocation: strong control, strong interpretability, discrete placement.
- Dorling/Demers: flexible shape movement, continuous collision resolution.

A hybrid transition gives users a continuous slider between those worlds. This makes it easier to:

1. Preserve recognizability from a grid map while reducing overlap for value-scaled symbols.
2. Explore map readability trade-offs without switching algorithms.
3. Reuse existing allocation outputs in downstream cartogram workflows.
4. Add novelty that is still clearly grounded in this repository's primary contribution.

## Conceptual distinction

This hybrid is not "pure Dorling".

- Pure Dorling: free continuous positions from geographic centroids.
- Hybrid mode: starts from allocated grid positions, then relaxes with controlled freedom.

That distinction is important for both algorithm description and publication claims.

## Core idea

Given an allocated grid output (assignments with gridX, gridY):

1. Convert each assigned cell center into an initial circle center.
2. Set circle radius from a value attribute (area-proportional scaling).
3. Run collision relaxation with two opposing forces:
   - repulsion to remove overlaps,
   - anchor pull back to assigned grid centers.
4. Control the balance with a transition parameter t in [0, 1].

Interpretation:

- t = 0: strict grid appearance (almost no drift from cell centers).
- t = 1: Dorling-like freedom (weak grid anchoring, stronger overlap resolution).

## Proposed API

Add a new optional config object to advanced allocation:

- hybridCartogram.enabled: boolean
- hybridCartogram.valueField: string
- hybridCartogram.transition: number (0 to 1)
- hybridCartogram.iterations: number
- hybridCartogram.anchorStrength: number
- hybridCartogram.circleScaleK: number
- hybridCartogram.seed: number | null
- hybridCartogram.strictNoOverlap: boolean

When hybridCartogram.enabled is false (default), behavior remains unchanged.

## Reuse map (existing code)

This plan is intentionally implementation-first and reuse-heavy.

1. Grid assignment source:
   - src/core/grid-mapper.js
2. Grid cell center logic:
   - src/grid/grid-factory.js
3. Circle size and geometry utilities:
   - src/cartogram/shape-generator.js
4. Collision and relaxation engine:
   - src/cartogram/force-simulation.js
5. Existing seeded behavior and overlap diagnostics:
   - src/cartogram/force-simulation.js

## Algorithm sketch

1. Run normal allocate() to get assignments.
2. Build hybrid nodes:
   - x, y from assigned grid center
   - originalX, originalY set to same grid center (anchor target)
   - radius from valueField using area-proportional scaling
3. Compute dynamic force weights from transition t:
   - repulsionWeight = lerp(low, high, t)
   - anchorWeight = lerp(high, low, t)
4. Run iterative relaxation (fixed iterations):
   - apply pairwise overlap repulsion
   - apply anchor force to grid centers
   - optional final strict cleanup if overlaps remain
5. Export as feature collection with hybrid metadata.

## Output and metadata

Hybrid output should include:

- features with circle polygons and per-feature _cartogram fields
- metadata:
  - mode: hybrid
  - transition
  - iterations
  - hasOverlaps
  - overlapRatio
  - meanDisplacementFromGrid
  - maxDisplacementFromGrid
  - seed

This allows quality tracking and future benchmarking.

## Demo integration plan

Add hybrid controls under Advanced panel in the demo:

1. Enable Hybrid toggle
2. Value Field input
3. Transition slider
4. Iterations input
5. Strict no-overlap toggle

Visual behavior in demo:

- keep current grid mode untouched,
- when hybrid enabled, render circles at relaxed positions,
- keep hover linking and export workflow consistent.

## Validation plan

Add a dedicated script, for example scripts/test-hybrid.js, with checks:

1. Determinism:
   - same seed + same data => identical output.
2. Transition continuity:
   - small increase in t should not produce extreme jumps.
3. Overlap behavior:
   - overlap ratio should decrease with more iterations or stricter cleanup.
4. Backward compatibility:
   - with hybrid disabled, allocation results remain unchanged.

## Milestones

### M1 - Core algorithm

- Build node conversion from assignments.
- Implement anchored relaxation with transition weighting.
- Return hybrid metadata.

### M2 - Demo support

- Add advanced controls.
- Add circle rendering path.
- Keep existing simple interface unchanged.

### M3 - Validation and docs

- Add test script and baseline assertions.
- Add README section and examples.
- Add notes on when to use hybrid vs pure grid vs pure Dorling.

## Risks and mitigations

1. Large circles can dominate layout.
   - Mitigation: cap scale, expose circleScaleK, add warning when overlap remains high.

2. Runtime growth with many features.
   - Mitigation: iteration cap, early stopping, optional strict cleanup only when needed.

3. User confusion between methods.
   - Mitigation: clear labels in docs and UI: "Grid", "Hybrid", "Dorling" are distinct modes.

## Novelty framing

The novelty is not reimplementing Dorling. The novelty is a controlled interpolation between discrete assignment and continuous relaxation, grounded in a robust allocation baseline.

That gives a practical and defensible contribution:

- preserves grid semantics when desired,
- reduces overlap when needed,
- exposes the trade-off continuously via one transition parameter.
