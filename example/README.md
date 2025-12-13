# GridMapper Examples

This directory contains example demonstrations of the GridMapper library.

## London Boroughs Demo

The `london-demo.html` file demonstrates the GridMapper API with London boroughs GeoJSON data.

### Features

- **Side-by-side visualization**: Shows the original map and grid cartogram side-by-side
- **Interactive controls**: Adjust configuration parameters and see instant updates:
  - Compactness (0-1): Controls how much to preserve geographic position vs. clustering
  - Grid Type: Rectangular or Hexagonal grids
  - Distance Metric: Euclidean or Manhattan distance
  - Grid Dimensions: Number of rows and columns
  - PCA Rotation: Option to align grid to principal axis

### Running the Demo

1. **No build required** — the demo imports the local `src/index.js` ES module. Run `npm install` first to install dependencies (e.g., polylabel), then serve the repository root to make local modules accessible to the browser. If you prefer not to run `npm install`, edit `example/index.html` importmap and map `polylabel` to the CDN: `https://cdn.jsdelivr.net/npm/polylabel@1.1.0/polylabel.js`.

2. **Serve the examples directory** with a web server (required for ES modules and CORS):
   
   Using Python:
   ```bash
   python -m http.server 8000
   ```
   
   Using Node.js (http-server):
   ```bash
   npx http-server -p 8000
   ```
   
   Using PHP:
   ```bash
   php -S localhost:8000
   ```

3. **Open in your browser**:
   ```
   http://localhost:8000/index.html
   ```

### Data

The demo uses `london.geojson`, which contains GeoJSON data for London boroughs. The demo automatically extracts interior centroids (pole-of-inaccessibility) from each borough polygon using `polylabel` (fallback to a simple mean) and allocates them to a grid.

### How It Works

1. Loads the London boroughs GeoJSON file
2. Extracts centroids from each borough polygon
3. Uses GridMapper's `allocate()` method to assign boroughs to grid cells
4. Visualizes both the original geographic map and the resulting grid cartogram
5. Updates the visualization when configuration parameters change

### Browser Compatibility

This example uses ES modules and requires a modern browser that supports:
- ES6 modules
- async/await
- Fetch API

Recommended browsers: Chrome, Firefox, Safari, Edge (latest versions)

