import define1 from "./7978f0c1524e3972@720.js";
import define2 from "./62d26743f59aac51@6115.js";

function _1(md){return(
md`# Grid map allocation

This page explores how map units can be allocated to regular grids in order to [support visualization](https://www.gicentre.net/featuredpapers#/woodballotmaps2011). 

Given a set of geographic point locations and a grid of given number of rows and columns, the allocation algorithm attempts to place each location in a grid cell such that the total of squared distances between geographic and grid locations is minimised (for details on how this is implemented, see [Hello Linear Programming](https://observablehq.com/@jwolondon/hello-linear-programming)).

If the number of grid cells is greater than the number of points to allocate, the algorithm chooses where to place the gaps. The approach here uses a much reduced set of options as detailed in [Meulemans, 2017](https://openaccess.city.ac.uk/id/eprint/15167/). Here we restrict placement to a single parameter *compactness*.  A value of 0.5 attempts to place each point at its relative geographic position scaled within the bounds of the grid. A value of 1 attempts to place each point as close to the centre of the grid as possible while as compactness tends towards 0, cells are allocated increasingly towards the edge of the grid.

The effect of compactness will depend on how many 'spare' cells are available – the more spaces, the greater freedom of movement of cells. For grid visualization we tend to want cells grouped together without internal gaps so a compactness closer to 1 is usually desired. Exceptions might include maps with outlying islands (see Scotland example below) and regions with a 'hole' in the interior (see Leicestershire example). Setting compactness to 0 can be used to create layouts related to [Necklace Maps](https://research.tue.nl/en/publications/necklace-maps).

Additionally, explicitly identified cells can be protected from any points being allocated to them. This is useful if more direct control is required over placement (see London example).`
)}

function _2(md){return(
md`## London Boroughs`
)}

async function _london(d3,topojson){return(
await d3
  .json("https://gicentre.github.io/data/geoTutorials/londonBoroughs.json")
  .then((feats) => topojson.feature(feats, feats.objects.boroughs))
)}

function _4(md){return(
md`Try changing the dimensions of the grid and the compactness to see the effect on allocation.`
)}

function _londonRows(Inputs){return(
Inputs.range([3, 12], {
  value: 8,
  step: 1,
  label: "Rows"
})
)}

function _londonCols(Inputs){return(
Inputs.range([3, 12], {
  value: 8,
  step: 1,
  label: "Columns"
})
)}

function _londonCompactness(Inputs){return(
Inputs.range([0, 1], {
  value: 0.6,
  step: 0.01,
  label: "Compactness"
})
)}

async function _8(london,getCentroid,pointsToGrid,londonRows,londonCols,londonCompactness,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = london.features.map((borough) => [
    borough.id.split(" ")[0],
    ...getCentroid(borough)
  ]);

  // Grid allocation
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(
    pts,
    londonRows,
    londonCols,
    londonCompactness
  );

  // Draw the output
  const r = new Renderer(900, 350).push().translate(-220, 0);
  drawMap(r, london, d3.geoTransverseMercator().rotate([2, 0]), centroids);
  r.pop().translate(500, -20);
  drawGrid(r, grid, centroids);
  return r.render();
}


function _9(md){return(
md`### With explicit spacers

Here certain grid cells are labelled as 'spacers' (light grey) and cannot have points allocated to them. Note how we do not need spacers everywhere – just sufficient to constrain the distribution:`
)}

async function _10(london,getCentroid,pointsToGrid,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = london.features.map((borough) => [
    borough.id.split(" ")[0],
    ...getCentroid(borough)
  ]);

  const spacers = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 5],
    [0, 6],
    [1, 0],
    [1, 1],
    [1, 6],
    [1, 7],
    [4, 0],
    [5, 1],
    [5, 6],
    [6, 2],
    [6, 4],
    [6, 5]
  ];

  // Grid allocation
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(pts, 7, 8, 1, spacers);

  // Draw the output
  const r = new Renderer(900, 350).push().translate(-220, 0);
  drawMap(r, london, d3.geoTransverseMercator().rotate([2, 0]), centroids);
  r.pop().translate(500, -20);
  drawGrid(r, grid, centroids, spacers);
  return r.render();
}


function _11(md){return(
md`## Scottish Health Boards`
)}

async function _scotHB(d3,topojson){return(
await d3
  .json(
    "https://raw.githubusercontent.com/gicentre/scrc/main/data/geo/scotHBs2019.json"
  )
  .then((feats) => topojson.feature(feats, feats.objects.healthBoards))
)}

function _13(md){return(
md`Here we have a big variation in density between the central belt (Lothian-Greater Glasgow) and the outlying islands. Keeping some geographic placement (compactness value closer to 0.5) allows the islands to remain less connected to the mainland group.`
)}

function _scotCompactness(Inputs){return(
Inputs.range([0, 1], {
  value: 0.6,
  step: 0.01,
  label: "Compactness"
})
)}

async function _15(scotHB,getCentroid,pointsToGrid,scotCompactness,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = scotHB.features.map((hb) => [
    hb.properties.HBName.split(" ")[0],
    ...getCentroid(hb)
  ]);

  // Grid allocation
  const [nRows, nCols] = [5, 5];
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(pts, nRows, nCols, scotCompactness);
  // Draw the output
  const r = new Renderer(900, 350).push().translate(-300, 0);
  drawMap(r, scotHB, d3.geoIdentity().reflectY(true), centroids);
  r.pop().translate(500, -20);
  drawGrid(r, grid, centroids);
  return r.render();
}


function _16(md){return(
md`## US States`
)}

async function _usStates(d3,topojson){return(
await d3
  .json("https://gicentre.github.io/data/us/usStates.json")
  .then((feats) => topojson.feature(feats, feats.objects.states))
)}

function _18(md){return(
md`Including Alaska and Hawaii in the grid of US states presents a challenge in that they are both distant to the conterminous states.`
)}

function _usRows(Inputs){return(
Inputs.range([3, 12], {
  value: 7,
  step: 1,
  label: "Rows"
})
)}

function _usCols(Inputs){return(
Inputs.range([3, 12], {
  value: 12,
  step: 1,
  label: "Columns"
})
)}

function _usCompactness(Inputs){return(
Inputs.range([0, 1], {
  value: 0.8,
  step: 0.01,
  label: "Compactness"
})
)}

async function _22(usStates,getCentroid,pointsToGrid,usRows,usCols,usCompactness,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = usStates.features.map((state) => [
    state.properties.postal,
    ...getCentroid(state)
  ]);

  // Grid allocation
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(pts, usRows, usCols, usCompactness);

  // Draw the output
  const r = new Renderer(900, 300).push().translate(-200, 0);
  drawMap(r, usStates, d3.geoAlbersUsa(), centroids);
  r.pop().translate(500, -100);
  drawGrid(r, grid, centroids);
  return r.render();
}


function _23(md){return(
md`One solution is to insert a few spacers to separate the non-conterminous states from AK and HI.`
)}

async function _24(usStates,getCentroid,pointsToGrid,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = usStates.features.map((state) => [
    state.properties.postal,
    ...getCentroid(state)
  ]);

  // Grid allocation
  const spacers = [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1]
  ];
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(pts, 6, 11, 0.7, spacers);

  // Draw the output
  const r = new Renderer(900, 300).push().translate(-200, 0);
  drawMap(r, usStates, d3.geoAlbersUsa(), centroids);
  r.pop().translate(500, -100);
  drawGrid(r, grid, centroids, spacers);
  return r.render();
}


function _25(md){return(
md`## Leicestershire Wards`
)}

async function _leicsWards(d3,topojson){return(
await d3
  .json(
    "https://gicentre.github.io/data/leicestershire/leicestershireWards.json"
  )
  .then((feats) => topojson.feature(feats, feats.objects.wards))
)}

function _27(md){return(
md`Geographies with 'holes' provide particular challenges to grid layouts. By setting the compactness to zero, allocations are pushed to the edge of the grid, preserving the internal space containing the separate City of Leicester.`
)}

async function _28(leicsWards,getCentroid,pointsToGrid,Renderer,drawMap,d3,drawGrid)
{
  // Find the centroid locations and names directly from the topoJSON.
  const centroids = leicsWards.features.map((ward) => [
    ward.properties.name.substring(0, 3),
    ...getCentroid(ward)
  ]);

  // Grid allocation
  const pts = centroids.map((b) => b.slice(1, 3));
  const grid = await pointsToGrid(pts, 14, 14, 0);

  // Draw the output
  const r = new Renderer(900, 400).push().translate(-250, 0);
  drawMap(r, leicsWards, d3.geoTransverseMercator().rotate([2, 0]), centroids);
  r.pop().translate(500, 0);
  drawGrid(r, grid, centroids);
  return r.render();
}


function _29(md){return(
md`## Using the gridmap allocator

To use the gridmap allocation function in an Observable page:

\`import { pointsToGrid } from "@jwolondon/gridmap-allocation"\`

Then call the allocation function:

**pointsToGrid(_pts_, _nRows_, _nCols_, _[compactness]_, _[spacers]_ )**

where

* **pts** is an array of geographic points \`[[x0,y0],[x1,y1],...]\` that are to be allocated to a grid.
* **nRows** and **nCols** are the maximum number of rows and columns defining a grid. There must be at least as many grid cells as there are points to allocate.
* **compactness** Optional parameter between 0 and 1 where 0 allocates towards edges, 0.5 preserves scaled geographic location and 1 allocates towards centre of grid. Default is 1 (compact cluster).
* **spacers** Optional array of grid cell locations \`[[r0,c0],[r1,c1],...]\` defining grid location of fixed spacers which cannot be allocated points. Coordinates are in [row, column] order with origin top-left. Default is an empty array.

The result is an array of grid coordinates in the same order as the original array of input points.`
)}

function _30(md){return(
md`---

## Appendix`
)}

function _31(md){return(
md`*The main function to call when converting a set of point locations to gridded ones:*`
)}

function _pointsToGrid(gridLocations,solveLP){return(
async function pointsToGrid(pts, nRows, nCols, compactness = 1, spacers = []) {
  const grid = gridLocations(nRows, nCols, spacers);
  if (pts.length > grid.cells.length) {
    console.log(
      "Cannot allocate " +
        pts.length +
        " points to a grid with only " +
        grid.cells.length +
        " cells."
    );
    return { nRows: nRows, nCols: nCols, cells: null };
  }

  const solution = await solveLP(pts, grid, compactness);
  const gPos = Object.entries(solution.vars)
    .filter((v) => v[1] === 1) // Select true variables
    .map((v) => Number(v[0].slice(1))) // The x-number corresponds to grid allocation.
    .sort((a, b) => a - b); // Keep grid positions in original point order
  return {
    nRows: nRows,
    nCols: nCols,
    cells: gPos.map((v) => grid.cells[v % gPos.length])
  };
}
)}

function _33(md){return(
md`### LP Support functions`
)}

function _34(md){return(
md`*For the LP solver and algebraic parser, noting the GPL licence for the glpk backend:*`
)}

function _36(md){return(
md`*For creating an array of grid locations with possible spacers:*`
)}

function _gridLocations(){return(
function gridLocations(nRows, nCols, spacers = []) {
  const isSpacer = (r, c) => {
    let matched = false;
    spacers.forEach(([sr, sc]) => {
      if (sr === r && sc === c) matched = true;
    });
    return matched;
  };

  const grd = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      if (!isSpacer(nRows - 1 - row, col)) {
        grd.push([row, col]);
      }
    }
  }
  return { nRows: nRows, nCols: nCols, cells: grd };
}
)}

function _38(md){return(
md`*LP objective function and constraints generators:*`
)}

function _objective(d3){return(
function objective(pts, grd, compactness = 1) {
  // Scale points to unit square
  const xDomain = d3.extent(pts.map((p) => p[0]));
  const yDomain = d3.extent(pts.map((p) => p[1]));

  // Scale to rectangle centred at middle of gird.
  // Size of grid inversely proportional to compactness
  const cc = (grd.nCols - 1) / 2;
  const cr = (grd.nRows - 1) / 2;
  const rWidth = (1 / (compactness + 0.001) - 1) * (grd.nCols - 1) + 1;
  const rHeight = (1 / (compactness + 0.001) - 1) * (grd.nRows - 1) + 1;

  const xNorm = d3
    .scaleLinear()
    .domain(xDomain)
    .range([cc - rWidth / 2, cc + rWidth / 2]);
  const yNorm = d3
    .scaleLinear()
    .domain(yDomain)
    .range([cc - rHeight / 2, cc + rHeight / 2]);
  const ptsNorm = pts.map(([x, y]) => [xNorm(x), yNorm(y)]);

  // This is how costly it is to move from point (x,y) to grid position (r,c)
  const cost = ([x, y], [r, c]) => (x - c) * (x - c) + (y - r) * (y - r);

  // Build the expression from the coefficients
  const vars = [];
  let i = 0;
  const n = grd.cells.length;

  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a < pts.length) {
        const coeff = cost(ptsNorm[a], grd.cells[b]);
        if (coeff != 0) {
          vars.push((coeff === 1 ? "" : coeff) + "x" + i);
        }
      }
      i++;
    }
  }
  return vars.join("+");
}
)}

function _pointToOneCell(){return(
function pointToOneCell(n) {
  const constraint = (a) =>
    Array.from(Array(n))
      .map((_, i) => "x" + (a + i))
      .join(" + ") + " == 1";
  return Array.from(Array(n)).map((_, i) => constraint(i * n));
}
)}

function _cellMaxOnePoint(){return(
function cellMaxOnePoint(n) {
  const constraint = (a) =>
    Array.from(Array(n))
      .map((_, i) => "x" + (a + i * n))
      .join(" + ") + " <= 1";
  return Array.from(Array(n)).map((_, i) => constraint(i));
}
)}

function _vars(){return(
function vars(n) {
  return Array.from(Array(n * n)).map((_, i) => "x" + i);
}
)}

function _43(md){return(
md`*For generating and solving the grid allocation LP:*`
)}

function _solveLP(mip,objective,pointToOneCell,cellMaxOnePoint,vars){return(
function solveLP(pts, grid, compactness) {
  const n = grid.cells.length;
  const lp = mip().objective(Math.min, objective(pts, grid, compactness));
  pointToOneCell(n).forEach((expr) => lp.subjectTo(expr));
  cellMaxOnePoint(n).forEach((expr) => lp.subjectTo(expr));
  vars(n).forEach((expr) => lp.var(expr, Boolean));
  return lp.solve();
}
)}

function _45(md){return(
md`### Map data processing and rendering`
)}

function _46(md){return(
md`*For the rendering:*`
)}

function _48(md){return(
md`*For reading and converting topoJSON files:*`
)}

function _topojson(require){return(
require("topojson-client@3")
)}

function _50(md){return(
md`*For automatic calculation of centroids from areas in a topoJSON file. For multipolygons (e.g. Western Isles), will calculate the centroid of the polygon with the largest area.*`
)}

function _getCentroid(d3){return(
function getCentroid(feat) {
  if (feat.geometry.type === "MultiPolygon") {
    const maxPoly = ([aMax, coords], cs) => {
      const area = d3.polygonArea(cs.flat());
      return area > aMax ? [area, cs] : [aMax, coords];
    };
    const [area, coords] = feat.geometry.coordinates.reduce(maxPoly, [0, []]);
    return d3.polygonCentroid(coords.flat());
  } else {
    return d3.polygonCentroid(feat.geometry.coordinates.flat());
  }
}
)}

function _52(md){return(
md`*Draw a given geoJSON with labelled centroids:*`
)}

function _drawMap(){return(
function drawMap(r, geoJson, proj, centroids) {
  r.push()
    // Draw the map
    .fill("rgba(220,140,95,0.3")
    .stroke("white")
    .strokeWidth(1)
    .setProjection(proj)
    .geoShape(geoJson);
  // Map labels
  r.fill("rgb(75,25,17)")
    .textAlign("middle")
    .textBaseline("middle")
    .textSize(6)
    .stroke();
  centroids.forEach((feat) => r.text(...feat));
  r.pop();
  return r;
}
)}

function _54(md){return(
md`*Draw grid cells as text labels:*`
)}

function _drawGrid(){return(
function drawGrid(r, grid, pts, spacers = []) {
  const isSpacer = (r, c) => {
    let matched = false;
    spacers.forEach(([sr, sc]) => {
      if (sr === r && sc === c) matched = true;
    });
    return matched;
  };

  if (grid.cells === null) {
    r.push()
      .fit([
        [0, 0],
        [1, 1]
      ])
      .stroke()
      .fill("rgb(75,25,17)")
      .textSize(12)
      .textAlign("middle")
      .text(
        "Too many points for " + grid.nRows + "x" + grid.nCols + " grid",
        0.5,
        0.5
      )
      .pop();
    return r;
  }
  r.push()
    .fit([
      [0 - 0.5, -0.5],
      [
        Math.max(grid.nRows, grid.nCols) + 0.5,
        Math.max(grid.nRows, grid.nCols) + 0.5
      ]
    ])
    .flipY();

  // Size text so it fits within a cell.
  const [x0, y0] = r.dataToScreen([0, 0]);
  const [x1, y1] = r.dataToScreen([1, 0]);
  const tSize = (x1 - x0) / 3;

  r.stroke()
    .fill("rgb(75,25,17)")
    .textSize(tSize)
    .textAlign("middle")
    .textBaseline("middle");

  pts.forEach((p, i) =>
    r.text(p[0].substring(0, 3), grid.cells[i][1], grid.cells[i][0])
  );

  r.stroke("#eee");
  for (let row = 0; row < grid.nRows; row++) {
    for (let col = 0; col < grid.nCols; col++) {
      if (isSpacer(grid.nRows - 1 - row, col)) {
        r.fill("#fafafa");
      } else {
        r.fill();
      }
      r.polygon([
        [col - 0.5, row - 0.5],
        [col - 0.5, row + 0.5],
        [col + 0.5, row + 0.5],
        [col + 0.5, row - 0.5]
      ]);
    }
  }

  r.pop();
  return r;
}
)}

export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], _1);
  main.variable(observer()).define(["md"], _2);
  main.variable(observer("london")).define("london", ["d3","topojson"], _london);
  main.variable(observer()).define(["md"], _4);
  main.variable(observer("viewof londonRows")).define("viewof londonRows", ["Inputs"], _londonRows);
  main.variable(observer("londonRows")).define("londonRows", ["Generators", "viewof londonRows"], (G, _) => G.input(_));
  main.variable(observer("viewof londonCols")).define("viewof londonCols", ["Inputs"], _londonCols);
  main.variable(observer("londonCols")).define("londonCols", ["Generators", "viewof londonCols"], (G, _) => G.input(_));
  main.variable(observer("viewof londonCompactness")).define("viewof londonCompactness", ["Inputs"], _londonCompactness);
  main.variable(observer("londonCompactness")).define("londonCompactness", ["Generators", "viewof londonCompactness"], (G, _) => G.input(_));
  main.variable(observer()).define(["london","getCentroid","pointsToGrid","londonRows","londonCols","londonCompactness","Renderer","drawMap","d3","drawGrid"], _8);
  main.variable(observer()).define(["md"], _9);
  main.variable(observer()).define(["london","getCentroid","pointsToGrid","Renderer","drawMap","d3","drawGrid"], _10);
  main.variable(observer()).define(["md"], _11);
  main.variable(observer("scotHB")).define("scotHB", ["d3","topojson"], _scotHB);
  main.variable(observer()).define(["md"], _13);
  main.variable(observer("viewof scotCompactness")).define("viewof scotCompactness", ["Inputs"], _scotCompactness);
  main.variable(observer("scotCompactness")).define("scotCompactness", ["Generators", "viewof scotCompactness"], (G, _) => G.input(_));
  main.variable(observer()).define(["scotHB","getCentroid","pointsToGrid","scotCompactness","Renderer","drawMap","d3","drawGrid"], _15);
  main.variable(observer()).define(["md"], _16);
  main.variable(observer("usStates")).define("usStates", ["d3","topojson"], _usStates);
  main.variable(observer()).define(["md"], _18);
  main.variable(observer("viewof usRows")).define("viewof usRows", ["Inputs"], _usRows);
  main.variable(observer("usRows")).define("usRows", ["Generators", "viewof usRows"], (G, _) => G.input(_));
  main.variable(observer("viewof usCols")).define("viewof usCols", ["Inputs"], _usCols);
  main.variable(observer("usCols")).define("usCols", ["Generators", "viewof usCols"], (G, _) => G.input(_));
  main.variable(observer("viewof usCompactness")).define("viewof usCompactness", ["Inputs"], _usCompactness);
  main.variable(observer("usCompactness")).define("usCompactness", ["Generators", "viewof usCompactness"], (G, _) => G.input(_));
  main.variable(observer()).define(["usStates","getCentroid","pointsToGrid","usRows","usCols","usCompactness","Renderer","drawMap","d3","drawGrid"], _22);
  main.variable(observer()).define(["md"], _23);
  main.variable(observer()).define(["usStates","getCentroid","pointsToGrid","Renderer","drawMap","d3","drawGrid"], _24);
  main.variable(observer()).define(["md"], _25);
  main.variable(observer("leicsWards")).define("leicsWards", ["d3","topojson"], _leicsWards);
  main.variable(observer()).define(["md"], _27);
  main.variable(observer()).define(["leicsWards","getCentroid","pointsToGrid","Renderer","drawMap","d3","drawGrid"], _28);
  main.variable(observer()).define(["md"], _29);
  main.variable(observer()).define(["md"], _30);
  main.variable(observer()).define(["md"], _31);
  main.variable(observer("pointsToGrid")).define("pointsToGrid", ["gridLocations","solveLP"], _pointsToGrid);
  main.variable(observer()).define(["md"], _33);
  main.variable(observer()).define(["md"], _34);
  const child1 = runtime.module(define1);
  main.import("mip", child1);
  main.variable(observer()).define(["md"], _36);
  main.variable(observer("gridLocations")).define("gridLocations", _gridLocations);
  main.variable(observer()).define(["md"], _38);
  main.variable(observer("objective")).define("objective", ["d3"], _objective);
  main.variable(observer("pointToOneCell")).define("pointToOneCell", _pointToOneCell);
  main.variable(observer("cellMaxOnePoint")).define("cellMaxOnePoint", _cellMaxOnePoint);
  main.variable(observer("vars")).define("vars", _vars);
  main.variable(observer()).define(["md"], _43);
  main.variable(observer("solveLP")).define("solveLP", ["mip","objective","pointToOneCell","cellMaxOnePoint","vars"], _solveLP);
  main.variable(observer()).define(["md"], _45);
  main.variable(observer()).define(["md"], _46);
  const child2 = runtime.module(define2);
  main.import("Renderer", child2);
  main.variable(observer()).define(["md"], _48);
  main.variable(observer("topojson")).define("topojson", ["require"], _topojson);
  main.variable(observer()).define(["md"], _50);
  main.variable(observer("getCentroid")).define("getCentroid", ["d3"], _getCentroid);
  main.variable(observer()).define(["md"], _52);
  main.variable(observer("drawMap")).define("drawMap", _drawMap);
  main.variable(observer()).define(["md"], _54);
  main.variable(observer("drawGrid")).define("drawGrid", _drawGrid);
  return main;
}
