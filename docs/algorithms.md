# Parameter Estimation Algorithm

The `estimateParameters` function automatically determines the optimal grid configuration for a given set of geographic features. It uses spatial statistics and geometric analysis to recommend:

1.  **Grid Dimensions** (`rows`, `cols`)
2.  **Rotation Strategy** (`rotateByPCA`)
3.  **Compactness Factor** (`compactness`)

## 1. Feature Extraction

Before analysis, the algorithm extracts key spatial properties from the input GeoJSON:
*   **Centroid (x, y)**: The interior label point (pole-of-inaccessibility) computed using `polylabel`, falling back to a simple mean of vertices if unavailable.
*   **Bounding Box (width, height)**: The extent of the feature.
*   **Area**: The area of the feature's bounding box (used as a proxy for feature size).

## 2. PCA Rotation Decision

The algorithm decides whether to rotate the grid to align with the principal axis of the data distribution (e.g., for diagonal geographies like Japan or Italy).

*   **Method**: It computes the Principal Component Analysis (PCA) angle of the point cloud.
*   **Comparison**: It calculates the **Axis-Aligned Bounding Box (AABB)** vs. the **Oriented Bounding Box (OBB)** (the bounds after rotation):
    *   Areas: `aabbArea`, `obbArea`
    *   Aspect ratios: `aspectAabb`, `aspectObb`
*   **Decision Rule (simplified)**:
    *   If the overall shape is **strongly elongated** (`aspectAabb > 1.8`), always rotate.
    *   Otherwise, rotate only if PCA both slightly reduces area and clearly improves aspect ratio:
        *   `areaGain = aabbArea / obbArea > 1.03`
        *   `aspectObb < aspectAabb * 0.9`

```javascript
// 1. PCA Analysis & Rotation Decision
const angle = PCARotation.computeAngle(extractedData);

const aabb = calculateBounds(extractedData);
const aabbArea = aabb.width * aabb.height;

const rotatedPoints = PCARotation.rotate(extractedData, -angle);
const obb = calculateBounds(rotatedPoints);
const obbArea = obb.width * obb.height;

const aspectAabb = Math.max(aabb.width, aabb.height) / Math.max(1e-9, Math.min(aabb.width, aabb.height));
const aspectObb  = Math.max(obb.width,  obb.height)  / Math.max(1e-9, Math.min(obb.width,  obb.height));
const areaGain   = aabbArea / Math.max(obbArea, 1e-9);

const elongatedOverall = aspectAabb > 1.8;
const betterAligned   = areaGain > 1.03 && aspectObb < aspectAabb * 0.9;

const rotateByPCA = elongatedOverall || betterAligned;
```

## 3. Grid Dimension Calculation

Grid dimensions are calculated based on the aspect ratio of the *effective* bounding box (either AABB or OBB, depending on the rotation decision). This ensures the grid shape roughly matches the data while avoiding extreme, overly skinny grids.

```javascript
// 2. Grid Dimensions
const effectiveBounds = rotateByPCA ? obb : aabb;
const { rows, cols } = calculateAutoDimensions(extractedData.length, effectiveBounds);
```

## 4. Advanced Compactness Estimation

The `compactness` parameter controls the trade-off between preserving relative geographic positions (low compactness) and filling the grid tightly (high compactness). By default, the algorithm estimates this using two spatial metrics, with an optional third metric available as an advanced setting.

### A. Nearest Neighbor Index (NNI)
Measures the degree of clustering in the data.
*   **NNI < 1**: Clustered.
*   **NNI > 1**: Dispersed / Uniform.

**Logic**:
*   If data is **clustered** (NNI < 0.7), we slightly **increase compactness**. This helps the solver impose a regular grid structure on irregular clusters.
*   If data is **dispersed** (NNI > 1.2), we **decrease compactness**. Since the points are already well-separated, we prioritize preserving their exact relative positions.

### B. Coverage Ratio
Measures how much of the total map area is covered by the features themselves.
*   **High Coverage**: Features are large and packed tight. We **decrease compactness** to preserve their topological relationships (touching neighbors).
*   **Low Coverage**: Features are sparse islands. We **increase compactness** as there is more "empty space" to move features around without violating topology.

### C. Neighbourhood Connectivity (Adjacency Graph, Optional)
As an optional, advanced feature, we can build a simple adjacency graph between features based on their bounding boxes. Two features are treated as neighbours if their (slightly padded) bounding boxes overlap or touch.

This adjacency-based adjustment is **disabled by default** and can be enabled by passing `useAdjacencyForCompactness: true` to `estimateParameters` or `estimateParametersFromData`.

*   **High average degree**: Many neighbours per feature → strong topology to preserve → we bias toward **lower compactness**.
*   **Low average degree**: Mostly isolated features → positions can move more freely → we bias toward **higher compactness**.
*   **Very high max degree**: Presence of hub-like features strongly connected to many neighbours → we further reduce compactness.

```javascript
function estimateCompactnessAdvanced(points, bounds, options = {}) {
    const { useAdjacency = false } = options;

    if (points.length < 2) return 0.45;

    const area = bounds.width * bounds.height || 1;

    // 1. Nearest Neighbour Index (NNI)
    const distances = [];
    for (let i = 0; i < points.length; i++) {
        let minDist = Infinity;
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue;
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
        }
        if (minDist < Infinity) distances.push(minDist);
    }

    const observedMeanNN =
        distances.length > 0
            ? distances.reduce((sum, d) => sum + d, 0) / distances.length
            : 0;

    const lambda = points.length / area; // intensity
    const expectedMeanNN = 0.5 / Math.sqrt(lambda || 1); // Poisson process
    const nni = expectedMeanNN > 0 ? observedMeanNN / expectedMeanNN : 1;

    // 2. Coverage ratio (using per-feature bounding boxes / areas)
    const totalFeatureArea = points.reduce((sum, p) => sum + (p.area || 0), 0);
    const coverageRatio = Math.min(1, totalFeatureArea / area);

    let compactness = 0.45;

    // Adjust based on NNI (clustering vs dispersion)
    if (nni < 0.7) {
        // clustered – allow grid to pull a bit tighter
        compactness += 0.05;
    } else if (nni > 1.2) {
        // dispersed/uniform – preserve positions more strongly
        compactness -= 0.1;
    }

    // Adjust based on coverage (how much of the area is filled by features)
    if (coverageRatio > 0.5) {
        // dense / urban – avoid over-compact grids that create artificial holes
        compactness -= 0.15;
    } else {
        // sparse / island-like – more freedom to cluster into the grid
        compactness += 0.05;
    }

    // 3. Optional neighbourhood connectivity (bbox-based adjacency graph)
    if (useAdjacency) {
        const { averageDegree, maxDegree } = computeAdjacencyStats(points, bounds);

        if (averageDegree > 4) {
            compactness -= 0.05;
        } else if (averageDegree < 2) {
            compactness += 0.05;
        }

        if (maxDegree > 8) {
            compactness -= 0.05;
        }
    }

    return Math.max(0.25, Math.min(0.7, compactness));
}

// Bbox-based adjacency stats used by the optional compactness heuristic
function computeAdjacencyStats(points, bounds) {
    const n = points.length;
    if (!n) {
        return { averageDegree: 0, maxDegree: 0 };
    }

    const degrees = new Array(n).fill(0);
    const padX = (bounds.width || 1) * 0.01;  // 1% of total width
    const padY = (bounds.height || 1) * 0.01; // 1% of total height

    for (let i = 0; i < n; i++) {
        const a = points[i];
        const aMinX = (a.minX !== undefined ? a.minX : a.x) - padX;
        const aMaxX = (a.maxX !== undefined ? a.maxX : a.x) + padX;
        const aMinY = (a.minY !== undefined ? aMinY : a.y) - padY;
        const aMaxY = (a.maxY !== undefined ? aMaxY : a.y) + padY;

        for (let j = i + 1; j < n; j++) {
            const b = points[j];
            const bMinX = (b.minX !== undefined ? b.minX : b.x) - padX;
            const bMaxX = (b.maxX !== undefined ? b.maxX : b.x) + padX;
            const bMinY = (b.minY !== undefined ? bMinY : b.y) - padY;
            const bMaxY = (b.maxY !== undefined ? bMaxY : b.y) + padY;

            const separated =
                aMaxX < bMinX ||
                aMinX > bMaxX ||
                aMaxY < bMinY ||
                aMinY > bMaxY;

            if (!separated) {
                degrees[i]++;
                degrees[j]++;
            }
        }
    }

    const totalDegree = degrees.reduce((sum, d) => sum + d, 0);
    const averageDegree = totalDegree / n;
    const maxDegree = degrees.reduce((m, d) => (d > m ? d : m), 0);

    return { averageDegree, maxDegree };
}
```
