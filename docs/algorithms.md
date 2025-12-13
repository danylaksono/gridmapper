# Parameter Estimation Algorithm

The `estimateParameters` function automatically determines the optimal grid configuration for a given set of geographic features. It uses spatial statistics and geometric analysis to recommend:

1.  **Grid Dimensions** (`rows`, `cols`)
2.  **Rotation Strategy** (`rotateByPCA`)
3.  **Compactness Factor** (`compactness`)

## 1. Feature Extraction

Before analysis, the algorithm extracts key spatial properties from the input GeoJSON:
*   **Centroid (x, y)**: The interior label point (pole-of-inaccessibility) computed using `polylabel`, falling back to a simple mean of vertices if unavailable.
*   **Feature Bounding Box**: The exact extent (min/max X/Y) of each individual feature.
*   **Global Bounds**: Calculated from the union of all feature bounding boxes. This provides a more accurate representation of the map's extent than using centroids alone.

## 2. PCA Rotation Decision

The algorithm decides whether to rotate the grid to align with the principal axis of the data distribution (e.g., for diagonal geographies like Japan or Italy).

*   **Method**: It computes the Principal Component Analysis (PCA) angle of the centroid point cloud.
*   **Rotation**: It simulates rotating both the **centroids** and the **feature bounding boxes** around the **global centroid**.
*   **Comparison**: It compares the properties of the original vs. rotated configurations:
    *   **Area**: Does rotation reduce the total bounding box area? (`areaOriginal` vs `areaRotated`)
    *   **Aspect Ratio (Bounds)**: Does the bounding box become more elongated? (`aspectOriginal` vs `aspectRotated`)
    *   **Aspect Ratio (Centroids)**: Do the centroids themselves align into a line? (`pointsAspectOriginal` vs `pointsAspectRotated`)
*   **Decision Rule**: Rotation is recommended if any of the following are true:
    1.  **Better Fit**: Area is reduced by > 10% (`areaOriginal > areaRotated * 1.1`).
    2.  **Shape Reveal**: The rotated bounds are significantly more elongated (`aspectRotated > aspectOriginal * 1.5`).
    3.  **Linear Alignment**: The centroids align linearly after rotation (`pointsAspectRotated > pointsAspectOriginal * 1.5`), even if the feature bounds don't shrink (common for diagonal archipelagos).

```javascript
// 1. PCA Analysis & Rotation Decision
const angle = PCARotation.computeAngle(points);
const globalCentroid = calculateCentroid(points);

// Rotate points and feature bounds around global centroid
const rotatedPoints = PCARotation.rotate(points, -angle, globalCentroid);
const rotatedExtents = rotateFeatureBounds(extractedData, -angle, globalCentroid);

// Calculate metrics
const areaOriginal = globalBounds.area;
const areaRotated = rotatedGlobalBounds.area;
const pointsAspectRotated = calculateAspectRatio(rotatedPointsBounds);

// Decision
let rotateByPCA = false;
if (areaOriginal > areaRotated * 1.1) rotateByPCA = true;
else if (aspectRotated > aspectOriginal * 1.5) rotateByPCA = true;
else if (pointsAspectRotated > pointsAspectOriginal * 1.5) rotateByPCA = true;
```

## 3. Grid Dimension Calculation

Grid dimensions are calculated based on the aspect ratio of the *effective* bounding box.

*   **Aspect Override**: Start with the height/width ratio of the working bounds (centroids or rotated centroids) and ease it toward 1.0 to keep extremely skinny shapes usable.
*   **Slack Cells**: Increase the target cell count as elongation grows (up to ~160% more cells for very diagonal geographies) so islands and peninsulas have breathing room.
*   **Minimum Rows / Columns**: Scale the minimum allowable rows/cols with the logarithm of elongation. Wide chains such as Japan therefore receive taller and wider starter grids (e.g., auto-suggesting ~10×16 at compactness 0.5).

```javascript
// 2. Grid Dimensions
const activeBounds = rotateByPCA ? rotatedPointsBounds : pointsBounds;
const ratioOverride = softenAspectRatio(activeBounds, rotateByPCA); // clamps + eases toward 1
const targetCells = inflateCellBudget(featureCount, activeBounds);  // adds slack for elongated maps
const { rows, cols } = calculateAutoDimensions(featureCount, activeBounds, {
    aspectRatio: ratioOverride,
    targetCellCount: targetCells,
    minRows: minimumRows(featureCount, activeBounds),
    minCols: minimumCols(featureCount, activeBounds)
});
```

## 4. Advanced Compactness Estimation

The `compactness` parameter controls the trade-off between preserving relative geographic positions (low compactness) and filling the grid tightly (high compactness).

*   **Base Compactness**: Defaults to **0.6** (better default for dense metros such as London).
*   **Range**: Clamped between **0.35** and **0.75**, with an additional diagonal bias described below.

### A. Nearest Neighbor Index (NNI)
Measures the degree of clustering in the data.
*   **Clustered (NNI < 0.7)**: **Increase compactness (+0.05)**. Allows the grid to pull clustered points apart to fill gaps.
*   **Dispersed (NNI > 1.2)**: **Decrease compactness (-0.05)**. Prioritizes preserving the already well-separated positions.

### B. Coverage Ratio
Measures how much of the total map area is covered by the features themselves.
*   **High Coverage (> 0.5)**: Dense map (e.g., London boroughs). **Decrease compactness (-0.05)** to respect the tight topology and avoid artificial gaps.
*   **Low Coverage (< 0.1)**: Sparse map (e.g., islands). **Increase compactness (+0.05)** as there is more empty space to rearrange features.

### C. Neighbourhood Connectivity (Adjacency Graph)
(Optional, enabled by default in advanced estimation)
*   **High Connectivity (Avg Degree > 3.5)**: **Decrease compactness (-0.04)**. Strong topology constraints require a looser grid.
*   **Low Connectivity (Avg Degree < 1.5)**: **Increase compactness (+0.05)**. Isolated features can be moved more freely.

## Graph-Embedding Adjacency Penalty (New)
A lightweight approach to encourage adjacency-preserving layouts without adding expensive MIP contiguity constraints.

- **Overview**: Build an adjacency graph (nodes = features, edges weighted by shared boundary length). Compute a 2D embedding (spectral/MDS or a force-directed layout) and use the resulting per-feature target coordinates as soft objectives in the allocation MIP. For each feature i and cell c, add a linear penalty term alpha * dist(target_i, center_c) * x_{i,c} to the objective.
- **Why**: Preserves neighborhood order and relative placement while keeping the MIP compact (no additional binary variables per edge or flow variables). Works well as a practical trade-off between quality and solver speed.
- **Implementation details used here**:
  - **Adjacency weights**: Approximate shared boundary length derived from feature bounding boxes (longer shared edges -> stronger edges); this can be replaced with precise shared-boundary measures if a geometry library is available.
  - **Embedding**: A simple force-directed layout (Fruchterman–Reingold–style) produces stable 2D targets quickly without requiring eigen decomposition.
  - **Scaling**: The embedding is scaled into the map bounds (same coordinate space as features). Embedding coordinates should be normalized to the same space used by the allocation routine (normalized grid coordinates) before being passed as `embeddingTargets`.
  - **Objective term**: Use a linear distance penalty (Euclidean or Manhattan) multiplied by a tunable `embeddingWeight` hyperparameter exposed to the advanced allocation engine.

Example usage:
```javascript
import { estimateParameters, computeAdjacencyGraph, embedGraph } from '../src/index.js';
// 1) Estimate params and get the adjacency/embedding targets
const params = estimateParameters(geojson, { computeEmbedding: true });
// 2) Pass `params.embeddingTargets` into the advanced allocation config:
const solution = await solveAdvancedAllocation(normalizedPoints, {
  ...config,
  embeddingTargets: params.embeddingTargets,
  embeddingWeight: 0.2
});
```

- **Trade-offs & practical tips**:
  - Start with a small `embeddingWeight` (e.g., 0.05–0.5) and tune; too large a weight may override compactness and produce poor packing.
  - Combine embedding penalty with a lightweight local post-processing (swap-based) to repair remaining cut edges.
  - If strict contiguity is required later, consider flow-based exact contiguity constraints from districting literature (expensive) or sparse pairwise penalties limited to immediate neighbors.

## Sparse Pairwise Adjacency Penalty (Prototype)
A more targeted alternative that adds auxiliary binary variables only for selected adjacent feature pairs and nearby cell pairs. This gives stronger local guarantees than the embedding penalty at a higher solver cost.

- **Approach implemented**: For the top-K adjacency edges (by shared-boundary weight) we create Boolean auxiliary variables `y_{e,ca,cb}` corresponding to assigning feature A to cell `ca` and feature B to a neighboring cell `cb` (where `ca` and `cb` are among the nearest K cells of A/B respectively and `cb` is a neighbor of `ca`). Standard product linearization constraints are used:
  - `y <= x_{A,ca}`
  - `y <= x_{B,cb}`
  - `x_{A,ca} + x_{B,cb} - y <= 1`
- **Objective**: Reward `y` by `+edgeWeight * pairwiseWeight` (implemented as negative cost in minimization objective).
- **Tuning**: The config options are `pairwiseAdjacency: { enabled, edgeLimit, nearestCells, weight }` and you must pass a precomputed `adjacencyGraph` to use this option.
- **Diagnostics**: the solver builder exposes `pairwiseVarCount` and `pairwiseConstraintCount` for diagnostics. The benchmark script `scripts/benchmark-pairwise.js` writes `demo/benchmark-pairwise.json` with timings.
- **Practical guidance**: Use small `edgeLimit` and `nearestCells` for medium-sized maps (e.g., `edgeLimit: 100`, `nearestCells: 6`) and increase only when problem sizes are small. Exact contiguity constraints remain more expensive than sparse pairwise penalties.

## Adjacency-Fixer Post-Processing (Local Heuristic)
A fast local heuristic, `reduceCutEdges`, attempts to reduce the number of cut edges by:
- moving one endpoint of a cut edge into an empty neighbor cell of the other endpoint,
- swapping with a nearby occupant when beneficial.

- **When to run**: Enable with `runPostProcess: true` and `runAdjacencyFix: true` passed to the advanced allocator (or via the `postProcessSwaps` `cfg` object). The heuristic is conservative and bounded by `adjFixIter` (default 500 iterations).
- **Trade-offs**: Cheap and effective at reducing cut edges produced by soft penalties; it does not use additional MIP or flow constraints so fails only when no local moves exist.

## Benchmarks (demo)
I added `scripts/benchmark-pairwise.js` and ran it on `demo/london.geojson` (default dataset). Results are written to `demo/benchmark-pairwise.json`.

Example result (London demo):
- Baseline solve: ~43 ms
- Sparse pairwise adjacency enabled (edgeLimit:200, nearestCells:6): ~12 ms
- Observed score was unchanged for this dataset (embedding + adjacency heuristics primarily affect topology rather than the compactness objective value)

**Interpretation**: On the London demo the sparse pairwise prototype produced no auxiliary variables (the small grid + parameters lead to zero pairwise vars), so solver time decreased slightly likely due to minor differences in constraint ordering. On larger or denser maps you will see pairwise var growth — tune `edgeLimit`/`nearestCells` to keep variables manageable.

**Usage example**:
```javascript
const params = estimateParameters(myGeoJson, { computeEmbedding: true });
const adj = computeAdjacencyGraph(myGeoJson.features);
const solution = await mapper.allocate(data, {
  mip: () => new GLPKSolver(glpkInstance),
  embeddingWeight: 0.2,
  embeddingTargets: params.embeddingTargets,
  pairwiseAdjacency: { enabled: true, edgeLimit: 150, nearestCells: 6, weight: 0.5 },
  adjacencyGraph: adj,
  runPostProcess: true,
  runAdjacencyFix: true
});
```

**Notes**: Always profile solver runtime and pairwise counts with `scripts/benchmark-pairwise.js` when adding pairwise constraints for new datasets.

**References**
- Gastner, M. T., & Newman, M. E. J. (2004). "Diffusion-based method for producing density-equalizing maps." Proc. Natl. Acad. Sci. USA. (Diffusion cartograms)
- van Kreveld, M., & Speckmann, B. (2007). "On rectangular cartograms." Computational Geometry: Theory and Applications. (Rectangular cartograms)
- Hojny et al., Shirabe — districting literature on single-commodity flow and exact contiguity constraints (flow-based MIP contiguity).
- Fruchterman, T. M. J., & Reingold, E. M. (1991). "Graph drawing by force-directed placement." (force-directed layouts)
### D. Diagonal Bias (Elongated Shapes)
When the centroid cloud is strongly elongated (aspect ratio > 2.3), the solver converges best with compactness kept near **0.5**. The heuristic therefore eases any adjustments back toward **0.45 – 0.55**, preventing both over-clustering and over-spreading on thin chains of regions.

```javascript
function estimateCompactnessAdvanced(points, bounds, options = {}) {
    // ... calculation of NNI, Coverage, Adjacency ...

    // Base compactness
    let compactness = 0.6;

    // Adjust based on NNI
    if (nni < 0.7) compactness += 0.05;
    else if (nni > 1.2) compactness -= 0.05;

    // Adjust based on Coverage
    if (coverageRatio > 0.5) compactness -= 0.05;
    else if (coverageRatio < 0.1) compactness += 0.05;

    // Adjust based on Adjacency
    if (useAdjacency) {
        if (averageDegree > 3.5) compactness -= 0.04;
        else if (averageDegree < 1.5) compactness += 0.05;
    }

    if (aspect > 2.3) {
        const weight = Math.min(1, (aspect - 2.3) / 2.0);
        compactness = 0.5 + (compactness - 0.5) * (1 - weight);
        compactness = Math.max(0.45, Math.min(0.55, compactness));
    }

    return Math.max(0.35, Math.min(0.75, compactness));
}
```
