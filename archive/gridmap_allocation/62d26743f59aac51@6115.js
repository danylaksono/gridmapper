function _1(md){return(
md`# Renderer

An abstraction of common drawing and event handling methods that can be called regardless of drawing context. Allows easy switching between SVG, Canvas and sketchy contexts, and in the future, a WebGL renderer. Methods can be chained, and state persists after creating a \`Renderer\` object (similar to the [Processing draw state model](https://p5js.org)). It can be used in your pages with:

\`\`\`javascript
import { Renderer } from "@jwolondon/renderer"
\`\`\`

Here is a minimal example:`
)}

function _2(Renderer){return(
new Renderer(140, 30)
  .fill("brown")
  .ellipse(12, 15, 10)
  .stroke()
  .text("Hello, Renderer!", 25, 22)
  .render()
)}

function _3(md){return(
md`## Constructor

* **new Renderer(_w_, _h_ _[,type]_)** : Create a new renderer with the given width and height. Defaults to creating a canvas context but the type can be optionally specified with one of \`"svg"\`, \`"canvas"\`, \`"roughsvg"\` or \`"roughcanvas"\`.`
)}

function _4(md){return(
md`## Style methods

* **fill(_clr_)** : Interior fill colour of marks, specified with any valid CSS colour.
* **stroke(_clr_)** : Boundary colour of marks, specified with any valid CSS colour.
* **strokeWidth(_n_)** : Width in pixels of strokes.
* **pointSize(_n_)** : Diameter in pixels of point symbols.
* **font(_fontName_)** : Name of font for text. Can use web-safe \`serif\`, \`sans-serif\`, \`monospace\` or a named font referenced by document stylesheet. Defaults to Observable's own font, \`Source Serif Pro\`.
* **textSize(_n_)** : Text size in points.
* **textAlign(_hAlign_)** : Horizontal alignment of text relative to anchor position. One of \`start\`, \`middle\` or \`end\`.
* **textBaseline(_vAlign_)** : Vertical alignment of text relative to anchor position. One of \`top\`, \`middle\` or \`bottom\`.`
)}

function _5(md){return(
md`## Drawing methods

* **render()** : Render the current state to screen by returning the viewable drawing context.
* **points(_coords_)** : Draw a set of points represented by \`[[x0,y0], [x1,y1], ...]\`
* **line(_coords_)** : Draw a line joining points \`[[x0,y0], [x1,y1], ...]\`
* **lines(_lineCoords_)** : Draw multiple lines from an array of line coordinates \`[[[l0x0,l0y0], [l0x1,l0y1], ...], [[l1x0,l1y0], [l1x1,l1y1], ...], ...]\`
* **polygon(_coords_)** : Draw a polygon with vertices \`[[x0,y0], [x1,y1], ...]\`
* **polygons(_rings_)** : Draw a collection of polygon rings represented by an array of polygon coordinates \`[[[r0x0,r0y0], [r0x1,r0y1], ...],[[r1x0,r1y0], [r1x1,r1y1], ...], ...]\` Allows holes and islands to be represented via spatially nested polygons.
* **bezier(_coords_)** : Draw a Bezier shape defined by \`[[anchorX,anchorY],[c1x,c1y],[c2x,c2y],[x,y]]\` where \`c1\` and \`c2\` are the start and end control points for a curve between the anchor and \`[x,y]\`. Further triplets of coordinates \`[cn1x,cn1y],[cn2x,cn2y],[xn,yn]\` can be added to string bezier curves together where the anchor of each is the previous \`[x,y]\`.
* **bezierLine(_coords_, _[,smoothing]_)** : Draw a Bezier line through the given list of points. Can optionally specify the degree of smoothing typically in the range of [0 = straight line segments, 0.2 = rounded curves].
* **geoShape(_geoJSON_ _[,att]_ _[,clrFn]_ _[,extent]_)** : Draw geographic features represented by a geoJSON object. Can optionally specify the geoJSON property to encode with colour and a function that transforms it into a valid colour (e.g. \`d3.scaleOrdinal(d3.schemeTableau10)\`) allowing a per-feature fill colour. May optionally specify a geoJSON representing the extent of the map (defaults to whole of the map when not specified). Useful when drawing parts of a geoJSON but scaling to all of it.
* **ellipse(_x_, _y_ _[,rx]_ _[,ry]_)** : Draw an ellipse with radii _rx_ and _ry_ at the given position. All values in data space. If only _rx_ is provided, _ry_ will be assumed to be the same value. Defaults to a circle of radius 1.
* **arc(_x_, _y_ _[,rx]_ _[,ry]_ _[,a0]_ _[,a1]_)** : Draw an arc around part of an ellipse. Parameters as for \`ellipse()\` with additional start (\`a0\`) and end (\`a1\`) angles bounding the arc in degrees clockwise from east.
* **text(_txt_, _x_, _y_)** : Display the given text anchored to the given position in data coordinates.
* **image(_arr_, _numCols_ _[,xPos]_ _[,yPos]_ _[,wth]_ _[,hgt]_)**: Display a raster image at the given position and size. _arr_ should be an \`Uint8ClampedArray\` of 4x number of image pixels in RGBA order (but see \`toImgArray\` for convenience function); _numCols_ is number of pixels per row in array and positions/dimensions are in data coordinates allowing image to be arbitrarily scaled. Currently canvas/roughCanvas only.
* **axisBottom(_xSc_, _ySc_ _[,extent]_ _[,vPos]_ _[,title]_)** : Draw a bottom axis based on the given x- and y-scales such as [d3.scaleLinear](https://github.com/d3/d3-scale#linear-scales). Can optionally provide the extent of the axis as a two element array specifying the left and right of the axis in data space, a vertical position in data space and the text of the axis title.
* **axisTop(_xSc_, _ySc_ _[,extent]_ _[,vPos]_ _[,title]_)** : Similar to \`axisBottom\` but with labels and ticks above the axis line.
* **axisLeft(_xSc_, _ySc_ _[,extent]_ _[,hPos]_ _[,title]_)** : Draw a left axis based on the given x- and y-scales such as [d3.scaleLinear](https://github.com/d3/d3-scale#linear-scales). Can optionally provide the extent of the axis as a two element array specifying the bottom and top of the axis in data space and a horizontal position in data space.
* **axisRight(_xSc_, _ySc_ _[,extent]_ _[,hPos]_ _[,title]_)** : Similar to \`axisLeft\` but with labels and ticks to the right of the axis line.
* **clear(_[clr]_ _[,remove]_)**: Clear contents of the renderer. Can optionally specify the colour to fill the cleared renderer. The optional Boolean _remove_ determines if the cleared contents are removed from the specification (default) or are only overwritten with a rectangle of the the given colour. Setting _remove_ to \`false\` can be useful when wishing to clear only part of the graphic subject to a clipping region.`
)}

function _6(md){return(
md`## Event Handling Methods

* **addListener(_type_, _fn_)** : Listen for pointer-driven events of the given [type](https://developer.mozilla.org/en-US/docs/Web/Events) (e.g. \`"click"\`, \`"mousemove"\`etc.) and call the given *fn* when they occur. The function should have an [event](https://github.com/d3/d3-selection/blob/v2.0.0/README.md#selection_on) parameter from which attributes such as pointer position may be extracted ([d3.pointer](https://github.com/d3/d3-selection/blob/v2.0.0/README.md#pointer) is useful for extracting pointer position). To remove a listener, provide \`null\` in place of *fn*.
  
     In order to be compatible with both Canvas and SVG contexts, pointer listeners listen to the entire rendering context, not individual elements within it.

* **addKeyListener(_type_, _fn_)** : List for key-down or key-up events. *type* should be one of \`"keydown"\` or \`"keyup"\` and the function should be one that responds to a key event. Unlike pointer-driven events, key events are associated with the whole page, so if more than one renderer on the same page is to handle key events, you need to filter them, for example by checking if the pointer position is over the relevant renderer. See the event handling examples below for one approach to doing this.`
)}

function _7(md){return(
md`## Transformation methods

### Transformations between data and screen space

_To convert between input data and 2d screen position. See [hello transforms](https://observablehq.com/@jwolondon/hello-transforms) for worked examples._

* **fit(_[coords]_ _[,margin]_)** : Set the data to screen transform to fit the extent of the given coordinates (\`[[xMin,yMin], [xMax,yMax]]\`) to the screen space. If coordinates not provided, defaults to a data domain between -1 and +1 in both x and y directions. Can optionally specify a margin in pixel units. Note this will scale x and y equally; to set indpendent scales for x and y, use \`setTransform\` or \`setScales\` instead.

* **flipY()** : Convenience method to flip the direction of the y-axis. Useful when moving between origin top-left and origin bottom-left coordinate systems.

*  **setScales(_xSc_, _ySc_)** : Set the data to screen space transform with the given pair of scaling functions (typically [d3.scales](https://github.com/d3/d3-scale#linear-scales)). Allows x and y to be scaled independently.

* **setTransform(_fn_ _[,invFn]_)** : Set the data to screen space transform with a given function \`data => [screenX, screenY]\`. Can optionally include the inverse function for transforming screen space back to data space (e.g. for mouse pointer interaction).

* **setProjection(_proj_ _[,margin]_)** : Set the [d3 map projection](https://github.com/d3/d3-geo-projection) for transforming geo to screen space. If unspecified, defaults to [d3.geoEqualEarth()](https://github.com/d3/d3-geo#equal-earth). Can optionally specify a margin in pixel units.

* **dataToScreen(_data_)** : Provide the screen coordinates of the given data values. Useful when wishing to centre a rotation around a given datum.

* **screenToData(_[x, y]_)** : Provide the data represented by the given two-element array representing a screen position. Useful for interpreting data values at the mouse pointer location.

### Screen Transformations

_For transforming features that have already been positioned to the screen. For example, to translate a map to the right._

* **translate(_tx_, _ty_)** : Translate screen positioning by the given values in screen coordinates. If no parameters are provided, will report the current screen translation values in the form \`[tx,ty]\`.

* **scale(_sx_ _[,sy]_)** : Scale screen positioning by the given scale factor(s). If a single value, both x and y coordinate space is scaled by the same value, otherwise, x and y coordinate spaces are scaled independently. If no parameters are provided, will report the current screen scaling values in the form \`[sx,sy]\`.

* **rotate(_a_)**: Rotate screen space around the origin anticlockwise by the given angle in degrees. Note that an anticlockwise rotation of coordinate space will appear to rotate objects clockwise. If no parameter is provided, will report the current screen rotation value in degrees.`
)}

function _8(md){return(
md`## Other methods

* **push()** : Store a copy of the current renderer state (fill colours, stroke width, transformations etc.) for later retrieval.

* **pop()** : Retrieve the last pushed renderer state.

* **clip(_coords_)** : A sequence of coordinates \`[[x0,y0],[x1,y1],...]\` in data space that define a clipping region. Only the area within the closed region defined by these coordinates will display output. Only drawing commands after this function is called are subject to clipping. To use multiple clipping regions, encase the clip/drawing within \`push()/pop()\` pairs.

* **textMetrics(_txt_ _[,border]_)** : Measure the width and height of the given text. Will return an object with properties _width_, _height_ (with values in pixel units) and _box_ (function that given an _[x,y]_ pair will provide coordinates representing a rectangular polygon in data space that bounds the given text anchored at this position). If _border_ (number of pixels) is provided, a border of that size will be added to the returned rectangle. Metrics are calculated based on the font settings present in the renderer at the point this function is called.

* **selection()** : Return a d3 selection on the renderer. Can be used for integrating with d3 functions that require a selection such as [d3.zoom](https://github.com/d3/d3-zoom). Works with canvas and SVG including their rough (sketchy) variants. See zoom and pan example below.`
)}

function _9(md){return(
md`## Utility Functions

_Not directly part of the renderer, these functions can be helpful in preparing data for rendering._

To use them in other pages ensure they are imported along with the renderer. For example:

\`import { Renderer, toImgArray } from "@jwolondon/renderer"\``
)}

function _10(md){return(
md`* **toImgArray(_arr_ _[,options]_)** Create an image array for use with \`image\`. _arr_ is a 2d array representing a raster. Options allow you to specify a **clrFn** that converts an array value into a colour string in the form of \`rgb(red,grn,blu)\` where each component is scaled between 0-255. If no colour function provided, array is assumed to contain numbers in range [0,1] and will be mapped to a grey scale. The **opacity** option specifies the opacity of the entire image on a scale between 0 (transparent) and 255 (opaque).`
)}

function _toImgArray(d3){return(
function toImgArray(arr, options) {
  const defaults = {
    clrFn: d3.scaleSequential(d3.interpolateGreys),
    opacity: 255
  };
  options = Object.assign({}, defaults, options);

  if (arr === null) {
    return null;
  }

  const clrStrToInts = (clrStr) =>
    clrStr
      ? clrStr
          .trim()
          .substring(4, clrStr.trim().length - 1)
          .split(",")
          .map(Number)
          .concat(options.opacity)
      : [0, 0, 0, 0];

  const numRows = arr.length;
  const numCols = arr[0].length;

  const img = new Uint8ClampedArray(numRows * numCols * 4);
  let i = 0;
  for (let row = 0; row < arr.length; row++) {
    for (let col = 0; col < arr[row].length; col++) {
      const rgba = clrStrToInts(options.clrFn(arr[row][col]));
      img[i] = rgba[0];
      img[i + 1] = rgba[1];
      img[i + 2] = rgba[2];
      img[i + 3] = rgba[3];
      i += 4;
    }
  }
  return img;
}
)}

function _12(md){return(
md`* **bezierLineCoords(_vertices_ _[,options]_ ** When provided with an array of vertex coordinates _[[x0,y0],[x1,y1],...]_ the rendering function \`bezierLine\` will draw a curved line through the vertices. But sometimes you may want access to points along that smoothed line, for example when animating a point along a curved path. \`bezierLineCoords()\` will provide a list of coordinates along a curved path that fits through the given vertices. Two customisation options are available. **nPerVertex** specifies the number of point coordinates provided between each pair of original vertices (default is 5). **smoothing** specifies the smoothness of the curve with value typically between 0 (straight line segments) and 0.2 (smooth curve). For example:
  \`bezierLineCoords([[10, 4],[15, 6],[16, 1]],{ nPerVertex: 10 });\` `
)}

function _bezierLineCoords(){return(
function (coords, options) {
  const defaults = { nPerVertex: 5, smoothing: 0.2 };
  options = Object.assign({}, defaults, options);

  const line = (pointA, pointB) => {
    const lengthX = pointB[0] - pointA[0];
    const lengthY = pointB[1] - pointA[1];
    return {
      length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
      angle: Math.atan2(lengthY, lengthX)
    };
  };

  const ctrPt = (lineCalc, smooth) => (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const l = lineCalc(p, n);
    const angle = l.angle + (reverse ? Math.PI : 0);
    const length = l.length * smooth;
    const x = current[0] + Math.cos(angle) * length;
    const y = current[1] + Math.sin(angle) * length;
    return [x, y];
  };

  const bezierCommand = (ctrPt) => (point, i, a) => {
    const [cpsX, cpsY] = ctrPt(a[i - 1], a[i - 2], point);
    const [cpeX, cpeY] = ctrPt(point, a[i - 1], a[i + 1], true);
    return [[cpsX, cpsY], [cpeX, cpeY], point];
  };

  const bInterpolate = (p0, c0, c1, p1, t) => {
    if (t <= 0) {
      return p0;
    }
    if (t >= 1) {
      return p1;
    }
    const cx = 3 * (c0[0] - p0[0]);
    const bx = 3 * (c1[0] - c0[0]) - cx;
    const ax = p1[0] - p0[0] - cx - bx;
    const cy = 3 * (c0[1] - p0[1]);
    const by = 3 * (c1[1] - c0[1]) - cy;
    const ay = p1[1] - p0[1] - cy - by;

    return [
      ax * (t * t * t) + bx * (t * t) + cx * t + p0[0],
      ay * (t * t * t) + by * (t * t) + cy * t + p0[1]
    ];
  };

  const controlPointCalc = ctrPt(line, options.smoothing);
  const bezierCommandCalc = bezierCommand(controlPointCalc);
  const smoothedPath = (points, command) =>
    points.reduce(
      (acc, point, i, a) =>
        i === 0 ? [point] : acc.concat(command(point, i, a)),
      []
    );

  // Apart from the last point, each original point is now followed by
  // two control points and the next line point in sequence.
  const bCoords = smoothedPath(coords, bezierCommandCalc);

  // Add new points along the bezier curve at the given resolution
  const smoothCoords = [];
  for (let i = 0; i < bCoords.length - 1; i += 3) {
    for (let j = 0; j < options.nPerVertex; j++) {
      smoothCoords.push(
        bInterpolate(
          bCoords[i],
          bCoords[i + 1],
          bCoords[i + 2],
          bCoords[i + 3],
          j / options.nPerVertex
        )
      );
    }
  }
  smoothCoords.push(bCoords[bCoords.length - 1]);
  return smoothCoords;
}
)}

function _14(md){return(
md`---
## Appendix`
)}

function _15(md){return(
md`### The Renderer

*The main object that translates the abstract drawing methods into context-dependent function calls. This is the block to import if you wish to use the renderer in another document.*`
)}

function _Renderer(DOM,d3,rough){return(
function Renderer(w = 640, h = 100, r = "canvas") {
  // Renderer state
  // -------------------------------------------------------------

  let ctx, offscreenCanvas, transGroup, rType, rc, keyDownFn, keyUpFn;
  const TO_RADIANS = Math.PI / 180;
  const TO_DEGREES = 180 / Math.PI;

  // Screen transformations are stored in a 3x3 homogenous matrix. Class to represent
  // matrices adapted from https://observablehq.com/@nstrayer/simple-matrices by Nick Strayer.
  // -------------------------------------------------------------

  class Matrix {
    constructor(dims, fill = 0) {
      this.nrow = dims[0];
      this.ncol = dims[1];
      this.size = this.nrow * this.ncol;
      const vec_fill = fill.length > 1;
      if (vec_fill && fill.length !== this.nrow * this.ncol) {
        throw `Expecting a fill vector of length ${this.size} but got a vector of length ${fill.length}`;
      }
      this.vals = Array.from(
        vec_fill ? fill : [...new Array(this.nrow * this.ncol)].map((d) => fill)
      );
    }

    mPos(i, j) {
      return this.ncol * i + j;
    }

    // Given a row and col fill the place with a value. If inplace is false, will create a new matrix.
    set(i, j, val, inplace = true) {
      if (inplace) {
        this.vals[this.mPos(i, j)] = val;
      } else {
        const newMat = new Matrix([this.nrow, this.ncol], [...this.vals]);
        newMat.set(i, j, val);
        return newMat;
      }
    }

    get(i, j) {
      return this.vals[this.mPos(i, j)];
    }

    row(i) {
      const row_res = new Array(this.ncol);
      for (let j = 0; j < this.ncol; j++) row_res[j] = this.get(i, j);
      return row_res;
    }

    col(j) {
      const col_res = new Array(this.nrow);
      for (let i = 0; i < this.nrow; i++) col_res[i] = this.get(i, j);
      return col_res;
    }

    cpy() {
      return new Matrix([this.nrow, this.ncol], [...this.vals]);
    }
  }

  // Generate a unique global ID for this renderer.
  const uid = () => {
    const randomLetter = () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26));

    const p8 = (s) => {
      const p = (Math.random().toString(16) + "000000000").substr(2, 8);
      return s
        ? "-" + p.substr(0, 4) + "-" + p.substr(4, 4)
        : randomLetter() + p.substr(0, 7);
    };
    return p8() + p8(true) + p8(true) + p8();
  };

  // Initialise the context as either SVG or Canvas.
  // -------------------------------------------------------------

  switch (r.toLowerCase()) {
    case "svg":
    case "roughsvg":
      ctx = DOM.svg(w, h);
      d3.select(ctx).attr("id", uid());
      if (r.toLowerCase() === "roughsvg") {
        rType = "roughsvg";
        rc = rough.svg(ctx);
      } else {
        rType = "svg";
      }
      transGroup = (m) =>
        d3
          .select(ctx)
          .append("g")
          .attr("transform", `matrix(${transParams(m).join(" ")})`);
      break;

    case "canvas":
    case "roughcanvas":
      ctx = DOM.context2d(w, h);
      d3.select(ctx.canvas).attr("id", uid());
      if (r.toLowerCase() === "roughcanvas") {
        rType = "roughcanvas";
        rc = rough.canvas(ctx.canvas);
      } else {
        rType = "canvas";
      }
      break;

    default:
      rType = r;
      ctx = DOM.context2d(w, h);
      ctx.textAlign = "center";
      ctx.fillText("Unknown drawing context: " + r, w / 2, h / 2);
  }

  // Initialise state of this renderer.
  // -------------------------------------------------------------

  let fillClr = "black";
  let strokeClr = "black";
  let strokeW = 1;
  let pointR = 1.5;
  let fnt = "Source Serif Pro";
  let fntSize = 10;
  let txtAlign = "start";
  let txtBaseline = "bottom";
  let dToScreen = null; // Data to screen transform.
  let screenToD = null; // Screen to data transform for interpreting interaction coordinates.
  let reflectY = false;
  let width = w;
  let height = h;
  let mapProj = d3.geoEqualEarth();
  let geoBorder = 0;
  let mTrans = mIdentity();
  let clipPath = undefined;
  let stackHash = makeid(8);
  let stateStack = [];
  let roughStyle = {};

  // Pushing and popping state
  // -------------------------------------------------------------

  // Stores a copy of the current drawing and transformation settings.
  this.push = function () {
    stateStack.push({
      fill: fillClr,
      stroke: strokeClr,
      strokeW: strokeW,
      pointR: pointR,
      font: fnt,
      fontSize: fntSize,
      textAlign: txtAlign,
      textBaseline: txtBaseline,
      reflectY: reflectY,
      dToScreen: dToScreen,
      width: width,
      height: height,
      mapProj: mapProj,
      geoBorder: geoBorder,
      mTrans: mCopy(mTrans),
      clipPath: clipPath,
      stackHash: stackHash,
      roughStyle: roughStyle
    });
    stackHash = makeid(8); // Create a new unique hash every time we push. For creating stack-specific SVG elements.
    return this;
  };

  // Restores the last pushed copy of the drawing and transformation settings.
  this.pop = function () {
    if (stateStack.length > 0) {
      const state = stateStack.pop();
      fillClr = state.fill;
      strokeClr = state.stroke;
      strokeW = state.strokeW;
      pointR = state.pointR;
      fnt = state.font;
      fntSize = state.fontSize;
      txtAlign = state.textAlign;
      txtBaseline = state.textBaseline;
      reflectY = state.reflectY;
      dToScreen = state.dToScreen;
      width = state.width;
      height = state.height;
      mapProj = state.mapProj;
      geoBorder = state.geoBorder;
      mTrans = mCopy(state.mTrans);
      clipPath = state.clipPath;
      stackHash = state.stackHash;
      roughStyle = state.roughStyle;
    }
    return this;
  };

  // Transform methods
  // -------------------------------------------------------------

  // Set the geometric transform function. This should be a function that takes
  // a coordinate pair array in data space and returns a pair in screen space.
  // Can optionally provide an inverse transform if decoding of screen position required.
  this.setTransform = function (trans, invTrans) {
    dToScreen = trans;
    screenToD = invTrans ? invTrans : (p) => p;
    return this;
  };

  // Set the geometric transform by two independent scaling functions for x and y.
  this.setScales = function (xSc, ySc) {
    dToScreen = ([a, b]) =>
      reflectY
        ? [xSc(a), ySc.range()[0] + ySc.range()[1] - ySc(b)]
        : [xSc(a), ySc(b)];
    screenToD = ([x, y]) =>
      reflectY
        ? [xSc.invert(x), ySc.domain()[0] + ySc.domain()[1] - ySc.invert(y)]
        : [xSc.invert(x), ySc.invert(y)];
    return this;
  };

  // Sets the geometric transform function to one that fits the given set
  // of coordinates to the current display area with optional padding.
  this.fit = function (
    coords = [
      [-1, -1],
      [1, 1]
    ],
    padding = 0
  ) {
    const [aMin, aMax] = d3.extent(coords, (p) => p[0]);
    const [bMin, bMax] = d3.extent(coords, (p) => p[1]);
    const scaleFactor = Math.min(
      (width - 2 * padding) / (aMax - aMin),
      (height - 2 * padding) / (bMax - bMin)
    );

    dToScreen = ([a, b]) =>
      reflectY
        ? [
            padding + scaleFactor * (a - aMin),
            height - (padding + scaleFactor * (b - bMin))
          ]
        : [
            padding + scaleFactor * (a - aMin),
            padding + scaleFactor * (b - bMin)
          ];

    screenToD = ([x, y]) =>
      reflectY
        ? [
            (x - padding) / scaleFactor + aMin,
            (height - y - padding) / scaleFactor + bMin
          ]
        : [
            (x - padding) / scaleFactor + aMin,
            (y - padding) / scaleFactor + bMin
          ];

    return this;
  };

  // Flips the y-axis for moving between origin bottom-left and top-left
  // coordinate systems.
  this.flipY = function (flip = true) {
    reflectY = flip;
    if (screenToD === null && flip) {
      dToScreen = ([x, y]) => [x, height - y];
      screenToD = ([x, y]) => [x, height - y];
    }
    return this;
  };

  // Set the map projection transform for geo features.
  this.setProjection = function (proj, border = 0) {
    mapProj = proj;
    geoBorder = border;
    dToScreen = ([lng, lat]) => mapProj([lng, lat]);
    screenToD = ([x, y]) => mapProj.invert([x, y]);
    return this;
  };

  // Set the default rough styling. Has no effect on non-sketchy renderers.
  this.setRoughStyle = function (rStyle) {
    roughStyle = rStyle;
    return this;
  };

  // Translate screen coordinates by the given tx and ty values
  this.translate = function (tx, ty) {
    if (tx === undefined) {
      // Report current translation parameters
      return mTrans.col(2).slice(0, 2);
    }

    if (ty === undefined) {
      ty = 0; // tx is valid but no ty
    }
    mTrans = mMult(mTrans, new Matrix([3, 3], [1, 0, tx, 0, 1, ty, 0, 0, 1]));
    return this;
  };

  // Scale screen coordinates by the given x and y factors
  this.scale = function (sx, sy) {
    if (sx === undefined) {
      // Report current scaling parameters.
      const [a, b] = mTrans.row(0).slice(0, 2);
      const [c, d] = mTrans.row(1).slice(0.2);
      return [
        Math.sign(a) * Math.sqrt(a * a + b * b),
        Math.sign(d) * Math.sqrt(c * c + d * d)
      ];
    }
    if (sy === undefined) {
      sy = sx; // Only sx provided so set sy to be the same.
    }

    mTrans = mMult(mTrans, new Matrix([3, 3], [sx, 0, 0, 0, sy, 0, 0, 0, 1]));
    return this;
  };

  // Rotate screen coordinates by the given angle
  this.rotate = function (angle) {
    if (angle === undefined) {
      const [a, b] = mTrans.row(0).slice(0, 2);
      return Math.atan2(-b, a) * TO_DEGREES;
    }
    const cosA = Math.cos(angle * TO_RADIANS);
    const sinA = Math.sin(angle * TO_RADIANS);
    mTrans = mMult(
      mTrans,
      new Matrix([3, 3], [cosA, -sinA, 0, sinA, cosA, 0, 0, 0, 1])
    );
    return this;
  };

  // Converts data to screen coordinates
  this.dataToScreen = function (d) {
    const s = dToScreen ? dToScreen(d) : d;
    return mMult(mTrans, new Matrix([3, 1], [...s.flat(), 1]))
      .col(0)
      .slice(0, 2);
  };

  // Converts screen coordinates to data.
  this.screenToData = function (p) {
    const p2 = mMult(affineInverse(mTrans), new Matrix([3, 1], [...p, 1]))
      .col(0)
      .slice(0, 2);
    return screenToD ? screenToD(p2) : p2;
  };

  // TODO: Do we need this method?
  // Possibly for screen transform use cases such as mouse-centred zooming.
  this.getScreenTrans = function () {
    return mTrans;
  };

  // TODO: Do we need this method?
  // Possibly for screen transform use cases such as mouse-centred zooming.
  this.getInvScreenTrans = function () {
    return affineInverse(mTrans);
  };

  // TODO: Do we need to keep this public?
  // Provide the untransformed screen coordinates of the given screen position.
  this.screenAt = (p) =>
    mMult(affineInverse(mTrans), new Matrix([3, 1], [...p, 1]))
      .col(0)
      .slice(0, 2);

  // Drawing methods
  // -------------------------------------------------------------

  // Draw the given points
  this.points = function (coords) {
    const tCoords = dToScreen ? coords.map(dToScreen) : coords;

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        if (rType === "roughsvg") {
          transCtx.each(function () {
            tCoords.forEach((c) => {
              d3.select(this)
                .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
                .node()
                .appendChild(rc.circle(...c, 2 * pointR, setRoughStyles()));
            });
          });
        } else {
          transCtx
            .selectAll()
            .data(tCoords)
            .enter()

            .append("circle")
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .attr("fill", fillClr)
            .attr("stroke", strokeClr)
            .attr("stroke-width", strokeW)
            .attr("r", pointR)
            .attr("cx", (d) => d[0])
            .attr("cy", (d) => d[1]);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          tCoords.forEach((c) => rc.circle(...c, 2 * pointR, setRoughStyles()));
        } else {
          tCoords.forEach((c) => {
            ctx.beginPath();
            ctx.arc(...c, pointR, 0, 6.283);
            ctx.closePath();
            setCanvasStyles();
          });
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw a line joining the given point coordinates
  this.line = function (coords) {
    if (arrayDepth(coords) > 2) {
      return this.lines(coords);
    }
    const tCoords = dToScreen ? coords.map(dToScreen) : coords;

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        const path = `M${tCoords.join("L")}`;
        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
              .node()
              .appendChild(rc.path(path, setRoughStyles("none")));
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("path")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW)
            .attr("fill", "none")
            .attr("d", path);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          const path = `M${tCoords.join("L")}`;
          rc.path(path, setRoughStyles("none"));
        } else {
          ctx.beginPath();
          tCoords.forEach((c) => ctx.lineTo(...c));
          setCanvasStyles("nofill");
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw multiple lines each joining the given point coordinates
  this.lines = function (lineCoords) {
    lineCoords.forEach((coords) => this.line(coords));
    return this;
  };

  // Draw Bezier curves joining the given point coordinates and control points
  // Coords are anchor,ctrl1,ctrl2,pt,[[ctrl1,ctrl2,pt]...]
  this.bezier = function (coords) {
    const tCoords = dToScreen ? coords.map(dToScreen) : coords;
    if (tCoords.length < 4) {
      return this;
    }

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        const path = `M${tCoords[0][0]},${tCoords[0][1]} C${tCoords
          .slice(1)
          .join()}`;

        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
              .node()
              .appendChild(rc.path(path, setRoughStyles()));
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("path")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW)
            .attr("fill", isValid(fillClr) ? fillClr : "none")
            .attr("d", path);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          const path = `M${tCoords[0][0]},${tCoords[0][1]} C${tCoords
            .slice(1)
            .join()}`;
          rc.path(path, setRoughStyles());
        } else {
          const bezCoords = chunk(tCoords.slice(1), 3);
          ctx.beginPath();
          ctx.moveTo(...tCoords[0]);
          bezCoords.forEach((bc) => ctx.bezierCurveTo(...bc.flat()));
          setCanvasStyles();
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw draw a Bezier curve through the given set of points. Can optionally control the
  // the smoothing of the curve with second parameter (0=no smoothing).
  this.bezierLine = function (coords, smoothing = 0.2) {
    const line = (pointA, pointB) => {
      const lengthX = pointB[0] - pointA[0];
      const lengthY = pointB[1] - pointA[1];
      return {
        length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
        angle: Math.atan2(lengthY, lengthX)
      };
    };

    const ctrPt = (lineCalc, smooth) => (current, previous, next, reverse) => {
      const p = previous || current;
      const n = next || current;
      const l = lineCalc(p, n);
      const angle = l.angle + (reverse ? Math.PI : 0);
      const length = l.length * smooth;
      const x = current[0] + Math.cos(angle) * length;
      const y = current[1] + Math.sin(angle) * length;
      return [x, y];
    };

    const bezierCommand = (ctrPt) => (point, i, a) => {
      const [cpsX, cpsY] = ctrPt(a[i - 1], a[i - 2], point);
      const [cpeX, cpeY] = ctrPt(point, a[i - 1], a[i + 1], true);
      return [[cpsX, cpsY], [cpeX, cpeY], point];
    };

    const controlPointCalc = ctrPt(line, smoothing);
    const bezierCommandCalc = bezierCommand(controlPointCalc);
    const smoothedPath = (points, command) =>
      points.reduce(
        (acc, point, i, a) =>
          i === 0 ? [point] : acc.concat(command(point, i, a)),
        []
      );

    return this.bezier(smoothedPath(coords, bezierCommandCalc));
  };

  // Draw a polygon from the given point coordinates
  this.polygon = function (coords) {
    if (arrayDepth(coords) > 2) {
      return this.multiPolygon(coords);
    }

    const tCoords = dToScreen ? coords.map(dToScreen) : coords;

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        const path = `M${tCoords.join("L")}Z`;
        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level
              .node()
              .appendChild(rc.path(path, setRoughStyles()));
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("path")
            .attr("fill", isValid(fillClr) ? fillClr : "none")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW)
            .attr("d", path);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          const path = `M${tCoords.join("L")}Z`;
          rc.path(path, setRoughStyles());
        } else {
          ctx.beginPath();
          tCoords.forEach((c) => ctx.lineTo(...c));
          ctx.closePath();
          setCanvasStyles();
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw a multi polygon comprising one or more rings
  this.multiPolygon = function (rings) {
    // Synonym for backwards compatibility.
    return this.polygons(rings);
  };
  this.polygons = function (rings) {
    const tRings = dToScreen
      ? rings.map((coords) => coords.map(dToScreen))
      : rings;

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        let path = "";
        tRings.forEach((tCoords) => {
          path = path.concat(`M${tCoords.join("L")}Z`);
        });
        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
              .node()
              .appendChild(rc.path(path, setRoughStyles()));
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("path")
            .attr("fill", isValid(fillClr) ? fillClr : "none")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW)
            .attr("d", path);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          let path = "";
          tRings.forEach((tCoords) => {
            path = path.concat(`M${tCoords.join("L")}Z`);
          });
          rc.path(path, setRoughStyles());
        } else {
          ctx.beginPath();
          tRings.forEach((tCoords) => {
            ctx.moveTo(...tCoords[0]);
            close(tCoords).forEach((c) => ctx.lineTo(...c));
          });
          ctx.closePath();
          setCanvasStyles();
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }

    return this;
  };

  // Specify a geographic feature or features to draw.
  this.geoShape = function (geo, prop = null, clrFn = null, geoExtent = null) {
    const project = (features) =>
      mapProj.fitExtent(
        [
          [geoBorder, geoBorder],
          [w - geoBorder, h - geoBorder]
        ],
        geoExtent ? geoExtent : features
      );

    const features = geo.features ? geo.features : [geo];

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        if (rType === "roughsvg") {
          const mapPath = d3.geoPath().projection(project(geo));
          transCtx.each(function () {
            features.forEach((feat) =>
              d3
                .select(this)
                .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
                .node()
                .appendChild(
                  rc.path(
                    mapPath(feat),
                    setRoughStyles(
                      clrFn
                        ? clrFn(resolve(feat, prop))
                        : isValid(fillClr)
                        ? fillClr
                        : "none"
                    )
                  )
                )
            );
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .selectAll("path")
            .data(features)
            .join("path")
            .attr(
              "fill",
              prop
                ? (d) =>
                    clrFn
                      ? clrFn(resolve(d, prop))
                      : isValid(fillClr)
                      ? fillClr
                      : "none"
                : isValid(fillClr)
                ? fillClr
                : "none"
            )
            .attr("stroke", strokeClr)
            .attr("stroke-width", strokeW)
            .attr("d", d3.geoPath(project(geo)));
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          const mapPath = d3.geoPath().projection(project(geo));
          features.forEach((feat) =>
            rc.path(
              mapPath(feat),
              setRoughStyles(
                clrFn
                  ? clrFn(resolve(feat, prop))
                  : isValid(fillClr)
                  ? fillClr
                  : "none"
              )
            )
          );
        } else {
          const geoPath = d3.geoPath(project(geo), ctx);
          features.forEach((feat) => {
            ctx.beginPath();
            geoPath(feat);
            setCanvasStyles(
              clrFn
                ? clrFn(resolve(feat, prop))
                : isValid(fillClr)
                ? fillClr
                : "none"
            );
          });
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  this.ellipse = function (x = 0, y = 0, rx = 1, ry = rx) {
    const [[tx, ty], [tRx, tRy]] = dToScreen
      ? [
          [x, y],
          [x + rx, y + ry]
        ].map(dToScreen)
      : [
          [x, y],
          [x + rx, y + ry]
        ];
    const dx = Math.abs(tRx - tx);
    const dy = Math.abs(tRy - ty);

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
              .node()
              .appendChild(
                rc.ellipse(tx, ty, dx * 2, dy * 2, setRoughStyles())
              );
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("ellipse")
            .attr("cx", tx)
            .attr("cy", ty)
            .attr("rx", dx)
            .attr("ry", dy)
            .attr("fill", isValid(fillClr) ? fillClr : "none")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          rc.ellipse(tx, ty, dx * 2, dy * 2, setRoughStyles());
        } else {
          ctx.beginPath();
          ctx.ellipse(tx, ty, dx, dy, 0, 0, 2 * Math.PI);
          setCanvasStyles();
        }
        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  this.arc = function (x = 0, y = 0, rx = 1, ry = rx, a0 = 0, a1 = 90) {
    const [stAngle, enAngle] = [a0 % 360, a1 % 360];
    const [[tx, ty], [tRx, tRy]] = dToScreen
      ? [
          [x, y],
          [x + rx, y + ry]
        ].map(dToScreen)
      : [
          [x, y],
          [x + rx, y + ry]
        ];
    const dx = Math.abs(tRx - tx);
    const dy = Math.abs(tRy - ty);

    const posAngle = (a) => (a < 0 ? a + 360 : a);
    const angleToCoords = (angle) => ({
      x: x + rx * Math.cos(angle * TO_RADIANS),
      y: y + ry * Math.sin(angle * TO_RADIANS)
    });
    // SVG paths define arc position with start and end of arc rather than centre of ellipse, so convert
    const start = angleToCoords(stAngle);
    const end = angleToCoords(enAngle);
    const path = [
      "M",
      start.x,
      start.y,
      "A",
      rx,
      ry,
      0,
      posAngle(enAngle - stAngle) <= 180 ? "0" : "1", // Large arc flag
      1, // sweep flag
      end.x,
      end.y
    ].join(" ");

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        if (rType === "roughsvg") {
          transCtx.each(function () {
            d3.select(this)
              .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level
              .node()
              .appendChild(rc.path(path, setRoughStyles()));
          });
        } else {
          d3.selectAll(transCtx)
            .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
            .append("path")
            .attr("fill", isValid(fillClr) ? fillClr : "none")
            .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
            .attr("stroke-width", strokeW)
            .attr("d", path);
        }
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (rType === "roughcanvas") {
          rc.path(path, setRoughStyles());
        } else {
          // Normal canvas can use the ellipse command rather than custom path.
          ctx.beginPath();
          ctx.ellipse(
            tx,
            ty,
            dx,
            dy,
            0,
            posAngle(stAngle) * TO_RADIANS,
            posAngle(enAngle) * TO_RADIANS
          );
          setCanvasStyles();
        }
        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw some text at the given position in data coordinates
  this.text = function (txt, x = 0, y = 0) {
    if (fntSize <= 0) {
      return this;
    }
    let vOffset = 0;

    const [tx, ty] = dToScreen ? dToScreen([x, y]) : [x, y];

    switch (rType) {
      case "svg":
      case "roughsvg":
        const transCtx = transGroup(mTrans);
        checkClip(); // Have we got a clip path?
        vOffset = txtBaseline === "bottom" ? fntSize / 3 : 0; // Small vertical adjustment to account for way SVG treats descenders.

        d3.selectAll(transCtx)
          .attr("clip-path", `url(#clip${stackHash})`) // Has no effect if clipping path not defined for this level.
          .append("text")
          .attr("x", tx)
          .attr("y", ty)
          .attr("fill", isValid(fillClr) ? fillClr : "none")
          .attr("stroke", isValid(strokeClr) ? strokeClr : "none")
          .attr("stroke-width", strokeW)
          .attr("font-family", fnt)
          .attr("font-size", `${fntSize}pt`)
          .attr("text-anchor", txtAlign)
          .attr("dominant-baseline", txtBaseline)
          .attr("baseline-shift", `${vOffset}px`)
          .text(txt);
        break;

      case "canvas":
      case "roughcanvas":
        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        ctx.font = `${fntSize}pt ${fnt}`;
        ctx.textAlign = txtAlign;
        ctx.textBaseline = txtBaseline;

        vOffset =
          txtBaseline === "top"
            ? fntSize / 3
            : txtBaseline === "bottom"
            ? fntSize / -8
            : 0; // Small vertical adjustment to account for way canvas treats descenders.

        if (isValid(fillClr)) {
          ctx.fillStyle = fillClr;
          ctx.fillText(txt, tx, ty - vOffset);
        }
        if (isValid(strokeClr)) {
          if (strokeW && Number(strokeW) > 0) {
            ctx.lineWidth = strokeW;
          }
          ctx.strokeStyle = strokeClr;
          ctx.strokeText(txt, tx, ty);
        }

        ctx.restore(); // Restore state prior to transforms.
        break;
    }
    return this;
  };

  // Draw some text at the given position in data coordinates
  this.image = function (imgArr, nCols = 0, x = 0, y = 0, w = 0, h = 0) {
    if (imgArr === null || nCols == 0 || nCols > imgArr.length / 4) {
      return this;
    }
    w = w <= 0 ? nCols : w;
    const nRows = Math.round(imgArr.length / (4 * nCols));
    h = h <= 0 ? nRows : h;

    const [[tx, ty], [tw, th]] = dToScreen
      ? [
          [x, y],
          [x + w, y + h]
        ].map(dToScreen)
      : [
          [x, y],
          [x + w, y + h]
        ];
    const tWidth = tw - tx;
    const tHeight = th - ty;

    switch (rType) {
      case "svg":
      case "roughsvg":
        break;

      case "canvas":
      case "roughcanvas":
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = nCols;
        offscreenCanvas.height = nRows;
        offscreenCanvas
          .getContext("2d")
          .putImageData(new ImageData(imgArr, nCols), 0, 0);

        ctx.save(); // Save state before any transforms
        ctx.transform(...transParams(mTrans));
        checkClip(); // Have we got a clip path?
        if (reflectY) {
          ctx.translate(0, tHeight + ty);
          ctx.scale(1, -1);
          ctx.translate(0, -ty);
        }
        ctx.drawImage(offscreenCanvas, tx, ty, tWidth, tHeight);
        ctx.restore(); // Restore state prior to transforms.

        break;
    }
    return this;
  };

  // Store the clipping path for limiting extent of rendered output.
  this.clip = function (coords) {
    if (coords == undefined) {
      clipPath = undefined;
    } else {
      clipPath = dToScreen == null ? coords : coords.map(dToScreen);
    }
    return this;
  };

  // Draw a bottom axis
  this.axisBottom = function (xSc, ySc, xExtent, yPos, title = "") {
    const validYPos =
      yPos === undefined || yPos == null || isNaN(yPos)
        ? ySc(ySc.domain()[0]) < ySc(ySc.domain()[ySc.domain().length - 1])
          ? ySc.domain()[reflectY ? 0 : ySc.domain().length - 1]
          : ySc.domain()[reflectY ? ySc.domain().length - 1 : 0]
        : yPos;
    return axis(
      "bottom",
      xSc,
      ySc,
      xExtent ? xExtent : xSc.domain(),
      validYPos,
      title
    );
  };

  // Draw a top axis
  this.axisTop = function (xSc, ySc, xExtent, yPos, title = "") {
    const validYPos =
      yPos === undefined || yPos == null || isNaN(yPos)
        ? ySc(ySc.domain()[0]) > ySc(ySc.domain()[ySc.domain().length - 1])
          ? ySc.domain()[reflectY ? 0 : ySc.domain().length - 1]
          : ySc.domain()[reflectY ? ySc.domain().length - 1 : 0]
        : yPos;
    return axis(
      "top",
      xSc,
      ySc,
      xExtent ? xExtent : xSc.domain(),
      validYPos,
      title
    );
  };

  // Draw a left axis
  this.axisLeft = function (xSc, ySc, yExtent, xPos, title = "") {
    const validXPos =
      xPos === undefined || xPos == null || isNaN(xPos)
        ? xSc.domain()[0]
        : xPos;
    return axis(
      "left",
      xSc,
      ySc,
      yExtent ? yExtent : ySc.domain(),
      validXPos,
      title
    );
  };

  // Draw a right axis
  this.axisRight = function (xSc, ySc, yExtent, xPos, title = "") {
    const validXPos =
      xPos === undefined || xPos == null || isNaN(xPos)
        ? xSc.domain()[xSc.domain().length - 1]
        : xPos;
    return axis(
      "right",
      xSc,
      ySc,
      yExtent ? yExtent : ySc.domain(),
      validXPos,
      title
    );
  };

  // Clear the contents of the renderer.
  this.clear = function (clr, remove = true) {
    switch (rType) {
      case "svg":
      case "roughsvg":
        if (remove) {
          d3.select(ctx).selectAll("*").remove();
        }
        if (isValid(clr)) {
          this.mTrans = mIdentity();
          this.push()
            .setTransform(null)
            .stroke()
            .fill(clr)
            .polygon([
              [0, 0],
              [width, 0],
              [width, height],
              [0, height]
            ])
            .pop();
        }
        break;

      case "canvas":
      case "roughcanvas":
        if (remove) {
          ctx.clearRect(0, 0, width, height);
        }
        if (isValid(clr)) {
          this.mTrans = mIdentity();
          this.push()
            .setTransform(null)
            .stroke()
            .fill(clr)
            .polygon([
              [0, 0],
              [width, 0],
              [width, height],
              [0, height]
            ])
            .pop();
        }
        break;
    }
    return this;
  };

  // Display the current render. Unlike other methods you cannot chain
  // from this as it returns the viewable node/canvas rather than object.
  this.render = function () {
    switch (rType) {
      case "svg":
      case "roughsvg":
        return ctx;

      case "canvas":
      case "roughcanvas":
        return ctx.canvas;

      default:
        return ctx.canvas;
    }
  };

  // Text metrics
  // -------------------------------------------------------------

  // Provides width and height of the given text in pixels and a function that will return
  // bounding box as polygon in data space. Metrics dependent on current alignment settings
  // as well as font size and style at the point the method is called.
  this.textMetrics = function (txt, border = 0) {
    if (txt === "" || fntSize <= 0) {
      return {
        width: 0,
        height: 0,
        box: ([x, y]) => {
          const [dLeft, dTop] = screenToD
            ? screenToD([-border, -border])
            : [-border, -border];
          const [dRight, dBottom] = screenToD
            ? screenToD([border, border])
            : [border, border];

          return [
            [x + dLeft, y + dTop],
            [x + dRight, y + dTop],
            [x + dRight, y + dBottom],
            [x + dLeft, y + dBottom]
          ];
        }
      };
    }

    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement("canvas").getContext("2d");
    }
    // Set the offscreen canvas to the current font settings.
    offscreenCanvas.font = `${fntSize}pt ${fnt}`;

    // Extract font metrics and calculate bounding box in data space
    const metrics = offscreenCanvas.measureText(txt);

    const xOff =
      toCanvasAlign(txtAlign) === "left"
        ? 0
        : toCanvasAlign(txtAlign) === "right"
        ? -metrics.width
        : metrics.width / -2;
    const yOff =
      toCanvasBaseline(txtBaseline) === "middle"
        ? (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) /
          2
        : toCanvasBaseline(txtBaseline) === "bottom"
        ? 0
        : metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const w = metrics.width;
    const h =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    return {
      width: w,
      height: h,
      box: ([x, y]) => {
        const [dLeft, dTop] = screenToD
          ? screenToD([xOff - border, yOff - border - h])
          : [xOff - border, yOff - border - h];
        const [dRight, dBottom] = screenToD
          ? screenToD([border + xOff + w, border + yOff])
          : [border + xOff + w, border + yOff];

        return [
          [x + dLeft, y + dTop],
          [x + dRight, y + dTop],
          [x + dRight, y + dBottom],
          [x + dLeft, y + dBottom]
        ];
      }
    };
  };

  // Style methods
  // -------------------------------------------------------------

  // Set the fill colour
  this.fill = function (clr) {
    fillClr = clr;
    return this;
  };

  // Set the stroke colour
  this.stroke = function (clr) {
    strokeClr = clr;
    return this;
  };

  // Set the stroke width.
  this.strokeWidth = function (sw) {
    strokeW = sw;
    return this;
  };

  // Set the point size
  this.pointSize = function (d) {
    pointR = d / 2;
    return this;
  };

  // Set the font
  this.font = function (fontName) {
    fnt = fontName;
    return this;
  };

  // Set the font size
  this.textSize = function (fontSize) {
    fntSize = fontSize;
    return this;
  };

  // Set the horizontal alignment of text
  this.textAlign = function (hAlign) {
    // Canvas and svg use "center" and "middle" respectively
    switch (rType) {
      case "svg":
      case "roughsvg":
        txtAlign = toSvgAlign(hAlign);
        break;

      case "canvas":
      case "roughcanvas":
        txtAlign = toCanvasAlign(hAlign);
        break;
    }
    return this;
  };

  // Set the vertical alignment of text
  this.textBaseline = function (vAlign) {
    switch (rType) {
      case "svg":
      case "roughsvg":
        txtBaseline = toSvgBaseline(vAlign);
        break;

      case "canvas":
      case "roughcanvas":
        txtBaseline = toCanvasBaseline(vAlign);
        break;
    }
    return this;
  };

  // Event methods
  // -------------------------------------------------------------

  this.addListener = function (evt, evFn) {
    switch (rType) {
      case "svg":
      case "roughsvg":
        d3.select(ctx).on(evt, evFn);
        break;

      case "canvas":
      case "roughcanvas":
        d3.select(ctx.canvas).on(evt, evFn);
        break;
    }
    return this;
  };

  // Key events are global to the page so if multiple renderers on the same page
  // call this function, they will need to disambiguate in a provided page-wide function.
  this.addKeyListener = function (evt, evFn) {
    switch (evt) {
      case "keydown":
        d3.select("body").on("keydown", evFn);
        break;
      case "keyup":
        d3.select("body").on("keyup", evFn);
        break;
    }
    return this;
  };

  // Returns the d3 selection of the renderer. Can be useful for linking to d3
  // functions such as d3.zoom.
  this.selection = function () {
    switch (rType) {
      case "svg":
      case "roughsvg":
        return d3.select(ctx);
      case "canvas":
      case "roughcanvas":
        return d3.select(ctx.canvas);
    }
  };

  // Internal utility methods
  // -------------------------------------------------------------

  // Combine a dot notation expression with an object
  const resolve = (obj, expr) => expr.split(".").reduce((o, i) => o[i], obj);

  // Chunk an array into an array of arrays of size n
  const chunk = (arr, chunkSize) => {
    const chunked = [];
    for (let i = 0, len = arr.length; i < len; i += chunkSize) {
      chunked.push(arr.slice(i, i + chunkSize));
    }
    return chunked;
  };

  // Set up clipping if we have a clip path.
  const checkClip = () => {
    if (clipPath != undefined) {
      switch (rType) {
        case "svg":
          transGroup(mTrans)
            .append("defs")
            .append("clipPath")
            .attr("id", "clip" + stackHash) // Each push level has unique ID so we can have multiple clip paths with push/pop.
            .append("path")
            .attr("d", `M${clipPath.join("L")}Z`);
          break;

        case "roughsvg":
          transGroup(mTrans).each(function () {
            d3.select(this)
              .append("defs")
              .append("clipPath")
              .attr("id", "clip" + stackHash) // Each push level has unique ID so we can have multiple clip paths with push/pop.
              .append("path")
              .attr("d", `M${clipPath.join("L")}Z`);
          });
          break;

        case "canvas":
        case "roughcanvas":
          // Because canvas is stateful, we don't need to store push-level IDs.
          ctx.beginPath();
          clipPath.forEach((c) => ctx.lineTo(...c));
          ctx.closePath();
          ctx.clip();
          break;
      }
    }
  };

  function makeid(len) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < len) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
  }

  // Ensure a set of polygon coordinates are closed (first and last match)
  const close = (coords) => {
    if (
      coords[0][0] != coords[coords.length - 1][0] ||
      coords[0][1] != coords[coords.length - 1][1]
    ) {
      coords.push(coords[0]);
    }
    return coords;
  };

  // Do we have a valid colour?
  const isValid = (clr) =>
    clr && clr.trim().length > 0 && clr.toLowerCase() !== "none";

  // General title function for any one of 4 sides
  const axis = (dir, xSc, ySc, extent, dPos, title) => {
    this.push();
    const start = extent[0];
    const end = extent[extent.length - 1];
    this.fill(fillClr ? fillClr : "black");
    const sClr = strokeClr ? strokeClr : "black";
    this.stroke(sClr);
    let tickFormat, ticks, sPos;
    if (reflectY) {
      ySc.domain([ySc.domain()[1], ySc.domain()[0]]);
    }
    this.setScales(xSc, ySc);

    // If categorical scale calculate width of single category
    let [xCatWidth, yCatWidth] = [0, 0];
    if (
      typeof xSc.tickFormat !== "function" &&
      typeof xSc.bandwidth === "function"
    ) {
      xCatWidth =
        (Math.max(...xSc.range()) - Math.min(...xSc.range())) /
        xSc.domain().length;
    }
    if (
      typeof ySc.tickFormat !== "function" &&
      typeof ySc.bandwidth === "function"
    ) {
      yCatWidth =
        (Math.max(...ySc.range()) - Math.min(...ySc.range())) /
        ySc.domain().length;
    }

    switch (dir) {
      case "left":
        this.push();
        dToScreen = null;
        this.textAlign("end");
        this.textBaseline("middle");
        sPos = xSc(dPos);
        this.line([
          [sPos, ySc(start) + yCatWidth],
          [sPos, ySc(end)]
        ]);
        if (typeof ySc.tickFormat === "function") {
          // Continuous scale
          tickFormat = ySc.tickFormat();
          ticks = ySc.ticks();
          dToScreen = null;
          ticks.forEach((d) => {
            if (d >= start && d <= end) {
              this.stroke(sClr);
              this.line([
                [sPos, ySc(d)],
                [sPos - 4, ySc(d)]
              ]);
              this.stroke();
              this.text(tickFormat(d), sPos - 6, ySc(d));
            }
          });
        } else {
          // Categorical scale
          ySc.domain().forEach((d) => {
            this.stroke(sClr);
            this.line([
              [sPos, ySc(d)],
              [sPos - 4, ySc(d)]
            ]);
            this.stroke();
            this.text(d, sPos - 4, ySc(d) + yCatWidth / 2);
          });
          const lastTick = ySc.range()[0];
          this.stroke(sClr);
          this.line([
            [sPos, lastTick],
            [sPos - 4, lastTick]
          ]);
        }

        // Axis title
        this.stroke();
        this.textBaseline("middle");
        this.textAlign("middle");
        this.translate(
          sPos - 5 * fntSize,
          (ySc(start) + ySc(end) + yCatWidth) / 2
        );
        this.rotate(-90);
        this.text(title, 0, 0);

        this.pop();
        break;

      case "right":
        this.push();
        dToScreen = null;
        sPos = xSc(dPos) + xCatWidth;
        this.textAlign("start");
        this.textBaseline("middle");
        this.line([
          [sPos, ySc(start) + yCatWidth],
          [sPos, ySc(end)]
        ]);
        if (typeof ySc.tickFormat === "function") {
          // Continuous scale
          tickFormat = ySc.tickFormat();
          ticks = ySc.ticks();
          ticks.forEach((d) => {
            if (d >= start && d <= end) {
              this.stroke(sClr);
              this.line([
                [sPos, ySc(d)],
                [sPos + 4, ySc(d)]
              ]);
              this.stroke();
              this.text(tickFormat(d), sPos + 6, ySc(d));
            }
          });
        } else {
          // Categorical scale
          ySc.domain().forEach((d) => {
            this.stroke(sClr);
            this.line([
              [sPos, ySc(d)],
              [sPos + 4, ySc(d)]
            ]);
            this.stroke();
            this.text(d, sPos + 4, ySc(d) + yCatWidth / 2);
          });
          const lastTick = ySc.range()[0];
          this.stroke(sClr);
          this.line([
            [sPos, lastTick],
            [sPos + 4, lastTick]
          ]);
        }

        // Axis title
        this.stroke();
        this.textBaseline("middle");
        this.textAlign("middle");
        this.translate(
          sPos + 5 * fntSize,
          (ySc(start) + ySc(end) + yCatWidth) / 2
        );
        this.rotate(-90);
        this.text(title, 0, 0);
        this.pop();
        break;

      case "bottom":
        this.push();
        dToScreen = null;
        sPos = ySc(dPos) + yCatWidth;
        this.textAlign("middle");
        this.textBaseline("top");
        this.line([
          [xSc(start), sPos],
          [xSc(end) + xCatWidth, sPos]
        ]);

        // Continuous scale
        if (typeof xSc.tickFormat === "function") {
          tickFormat = xSc.tickFormat();
          ticks = xSc.ticks();
          ticks.forEach((d) => {
            if (d >= start && d <= end) {
              this.stroke(sClr);
              this.line([
                [xSc(d), sPos],
                [xSc(d), sPos + 4]
              ]);
              this.stroke();
              this.text(tickFormat(d), xSc(d), sPos + 6);
            }
          });
        } else {
          // Categorical scale
          xSc.domain().forEach((d) => {
            this.stroke(sClr);
            this.line([
              [xSc(d), sPos],
              [xSc(d), sPos + 4]
            ]);
            this.stroke();
            this.text(d, xSc(d) + xCatWidth / 2, sPos + 6);
          });
          const lastTick = xSc.range()[xSc.range().length - 1];
          this.stroke(sClr);
          this.line([
            [lastTick, sPos],
            [lastTick, sPos + 4]
          ]);
        }
        // Axis title
        this.stroke();
        this.textBaseline("top");
        this.text(
          title,
          [(xSc(start) + xSc(end) + xCatWidth) / 2, 0][0],
          sPos + 2.2 * fntSize
        );

        this.pop();
        break;

      case "top":
        this.push();
        dToScreen = null;
        sPos = ySc(dPos);
        this.textAlign("middle");
        this.textBaseline("bottom");
        this.line([
          [xSc(start), sPos],
          [xSc(end) + xCatWidth, sPos]
        ]);

        if (typeof xSc.tickFormat === "function") {
          // Continuous scale
          tickFormat = xSc.tickFormat();
          ticks = xSc.ticks();
          ticks.forEach((d) => {
            if (d >= start && d <= end) {
              this.stroke(sClr);
              this.line([
                [xSc(d), sPos],
                [xSc(d), sPos - 4]
              ]);
              this.stroke();
              this.text(tickFormat(d), xSc(d), sPos - 6);
            }
          });
        } else {
          // Categorical scale
          xSc.domain().forEach((d) => {
            this.stroke(sClr);
            this.line([
              [xSc(d), sPos],
              [xSc(d), sPos - 4]
            ]);
            this.stroke();
            this.text(d, xSc(d) + xCatWidth / 2, sPos - 2);
          });
          const lastTick = xSc.range()[xSc.range().length - 1];
          this.stroke(sClr);
          this.line([
            [lastTick, sPos],
            [lastTick, sPos - 4]
          ]);
        }

        // Axis title
        this.stroke();
        this.textBaseline("bottom");
        this.text(
          title,
          [(xSc(start) + xSc(end) + xCatWidth) / 2, 0][0],
          sPos - 2 * fntSize
        );

        this.pop();
        break;
    }

    if (reflectY) {
      ySc.domain([ySc.domain()[1], ySc.domain()[0]]);
    }
    this.pop();
    return this;
  };

  // Use context-appropriate alignment labels
  const toCanvasAlign = (hAlign) =>
    hAlign.toLowerCase() === "middle"
      ? "center"
      : hAlign.toLowerCase() === "start"
      ? "left"
      : hAlign.toLowerCase() === "end"
      ? "right"
      : hAlign.toLowerCase();

  const toSvgAlign = (hAlign) =>
    hAlign.toLowerCase() === "center"
      ? "middle"
      : hAlign.toLowerCase() === "left"
      ? "start"
      : hAlign.toLowerCase() === "right"
      ? "end"
      : hAlign.toLowerCase();

  const toCanvasBaseline = (vAlign) =>
    vAlign.toLowerCase() === "hanging" ? "top" : vAlign.toLowerCase();

  const toSvgBaseline = (vAlign) =>
    vAlign.toLowerCase() === "top" ? "hanging" : vAlign.toLowerCase();

  // Set the canvas stylings depending on object state.
  const setCanvasStyles = (fill) => {
    if (fill) {
      if (fill === "nofill" || fill === "none") {
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fill();
      } else {
        ctx.fillStyle = fill;
        ctx.fill();
      }
    } else if (isValid(fillClr)) {
      ctx.fillStyle = fillClr;
      ctx.fill();
    }
    if (isValid(strokeClr)) {
      ctx.strokeStyle = strokeClr;
    }
    if (strokeW && Number(strokeW) > 0) {
      ctx.lineWidth = strokeW;
    }

    if (isValid(strokeClr) && strokeW && Number(strokeW) > 0) {
      ctx.stroke();
    }
  };

  const setRoughStyles = (fill) => {
    if (roughStyle) {
      const rStyleObj = {
        fill: fill ? fill : fillClr,
        stroke: !strokeClr || strokeClr === "" ? "none" : strokeClr,
        strokeWidth: strokeW,
        fillWeight: 1,
        hachureGap: 4
      };
      if (roughStyle.hasOwnProperty("fillWeight")) {
        rStyleObj.fillWeight = roughStyle.fillWeight;
      }
      if (roughStyle.hasOwnProperty("hachureGap")) {
        rStyleObj.hachureGap = roughStyle.hachureGap;
      }
      if (roughStyle.hasOwnProperty("fillStyle")) {
        rStyleObj.fillStyle = roughStyle.fillStyle;
      }
      if (roughStyle.hasOwnProperty("roughness")) {
        rStyleObj.roughness = roughStyle.roughness;
      }
      if (roughStyle.hasOwnProperty("hachureAngle")) {
        rStyleObj.hachureAngle = roughStyle.hachureAngle;
      }
      return rStyleObj;
    } else
      return {
        fill: fill ? fill : fillClr,
        stroke: !strokeClr || strokeClr === "" ? "none" : strokeClr,
        strokeWidth: strokeW,
        fillWeight: 1,
        hachureGap: 4
      };
  };

  // Determine depth of a possibly nested array. Used to distinguish
  // polygon coordinate lists from multi-polygons coordinate lists.
  function arrayDepth(val) {
    return Array.isArray(val) ? 1 + Math.max(0, ...val.map(arrayDepth)) : 0;
  }

  // Matrix manipulation
  // -------------------------------------------------------------

  // New 3x3 identity matrix
  function mIdentity() {
    return new Matrix([3, 3], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  // The six affine transformation parameters of a 3x3 matrix
  function transParams(m) {
    return m
      .col(0)
      .slice(0, 2)
      .concat(m.col(1).slice(0, 2).concat(m.col(2).slice(0, 2)));
  }

  // Clone copy of a matrix
  function mCopy(m) {
    return m.cpy();
  }

  //  Dot product of two vectors
  function dotProd(vA, vB) {
    return vA.reduce((sum, d, i) => sum + d * vB[i], 0);
  }

  // Multiplication of two 3x3 matrices
  function mMult(mA, mB) {
    const m = new Matrix([mA.nrow, mB.ncol]);
    for (let i = 0; i < mA.nrow; i++) {
      for (let j = 0; j < mB.ncol; j++) {
        m.set(i, j, dotProd(mA.row(i), mB.col(j)));
      }
    }
    return m;
  }

  // Given a 3x3 affine transformation matrix, find its inverse.
  function affineInverse(m) {
    const s0 = m.get(0, 0) * m.get(1, 1) - m.get(1, 0) * m.get(0, 1);
    const s1 = m.get(0, 0) * m.get(1, 2) - m.get(1, 0) * m.get(0, 2);
    const s3 = m.get(0, 1) * m.get(1, 2) - m.get(1, 1) * m.get(0, 2);

    return new Matrix(
      [3, 3],
      [
        m.get(1, 1) / s0,
        -m.get(0, 1) / s0,
        s3 / s0,
        -m.get(1, 0) / s0,
        m.get(0, 0) / s0,
        -s1 / s0,
        0,
        0,
        1
      ]
    );
  }
}
)}

function _17(md){return(
md`_Not necessary for rendering, but for this document we make alternative fonts available for rough text._`
)}

function _style(html){return(
html`
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rock+Salt:ital@0;1&display=swap">`
)}

function _19(md){return(
md`### D3 TopoJSON Library

*For conversion of topoJSON to geoJSON features. Used in the geo example below.*`
)}

function _topojson(require){return(
require("topojson-client@3")
)}

function _21(md){return(
md`### RoughJS

*For sketchy rendering contexts.*`
)}

function _rough(require){return(
require("roughjs@4.5").catch(() => window.rough)
)}

function _23(md){return(
md`### Examples`
)}

function _testCoords(){return(
[
  [
    [105000, 14000],
    [116000, 9000],
    [121000, 0],
    [110000, 5000],
    [101000, 3000]
  ],
  [
    [130000, 15000],
    [108000, 10000],
    [114000, 3000]
  ],
  [
    [115000, 11000],
    [125000, 11000],
    [125000, 15000],
    [115000, 15000]
  ],
  [
    [124000, 4000],
    [129000, 2000],
    [129000, 9500],
    [124000, 9500],
    [126000, 10000],
    [127000, 4500],
    [124000, 4000]
  ],
  [
    [124000, 3000],
    [126000, 7000],
    [128000, 11000],
    [130000, 15000]
  ],
  [
    [106000, 3000],
    [116000, 1000],
    [126000, 2000],
    [130000, 6000]
  ]
]
)}

function _ringCoords(){return(
[
  [
    [100, 400],
    [800, 400],
    [800, 100],
    [100, 100]
  ],
  [
    [200, 350],
    [200, 150],
    [600, 150],
    [600, 350]
  ],
  [
    [300, 300],
    [450, 300],
    [450, 200],
    [300, 200]
  ],
  [
    [325, 275],
    [325, 225],
    [375, 225],
    [375, 275]
  ]
]
)}

function _house(){return(
[
  [
    [1, 1],
    [1, 5],
    [4.5, 8],
    [6, 6.72],
    [6, 7.4],
    [7, 7.4],
    [7, 5.86],
    [8, 5],
    [8, 1]
  ],
  [
    [2, 3.5],
    [3, 3.5],
    [3, 4.5],
    [2, 4.5]
  ],
  [
    [6, 3.5],
    [7, 3.5],
    [7, 4.5],
    [6, 4.5]
  ],
  [
    [4, 1],
    [5, 1],
    [5, 3],
    [4, 3]
  ]
]
)}

function _rType(Inputs){return(
Inputs.radio(["SVG", "Canvas", "RoughSVG", "RoughCanvas"], {
  label: "Renderer",
  value: "Canvas"
})
)}

function _28(md){return(
md`#### Basic rendering`
)}

function _29(Renderer,width,rType,testCoords){return(
new Renderer(width, width / 5, rType)
  .fit(testCoords.flat(), 15)
  .strokeWidth(2)
  .fill("rgba(180,90,45,0.5)")
  .polygon(testCoords[0])

  .stroke()
  .fill("rgba(0,0,0,0.3)")
  .polygon(testCoords[1])
  .polygon(testCoords[2])

  .fill("rgba(180,90,45,0.7)")
  .bezier(testCoords[3])

  .stroke("black")
  .fill("rgb(180,90,45)")
  .pointSize(8)
  .points(testCoords[4])

  .strokeWidth(4)
  .stroke("rgb(180,90,45)")
  .line(testCoords[5])

  .stroke("black")
  .strokeWidth(0.5)
  .fill()
  .ellipse(124000, 3000, 6000, 3000)

  .font(rType == "SVG" || rType == "Canvas" ? "monospace" : "Rock Salt")
  .stroke("red")
  .textAlign("middle")
  .textBaseline("middle")
  .strokeWidth(0.3)
  .fill("black")
  .textSize(20)
  .text("Hello", 105000, 900)

  .render()
)}

function _30(md){return(
md`#### Pushing and popping styles`
)}

function _31(Renderer,width,rType,testCoords){return(
new Renderer(width, width / 5, rType)
  .fit(testCoords.flat(), 15)

  .strokeWidth(2)
  .fill("rgba(180,90,45,0.5)")
  .polygon(testCoords[0])

  .push()
  .stroke()
  .fill("rgba(0,0,0,0.3)")
  .polygon(testCoords[1])
  .pop()

  .polygon(testCoords[2])

  .render()
)}

function _32(md){return(
md`#### Multipolygon with holes and islands`
)}

function _33(Renderer,width,rType,ringCoords){return(
new Renderer(width, width / 5, rType)
  .fit(ringCoords.flat(), 15)
  .fill("rgba(180,90,45,0.5)")
  .polygons(ringCoords)
  .render()
)}

function _34(md){return(
md`#### Raster image drawing (Canvas only)`
)}

function _35(Renderer,width,rType,testCoords,toImgArray,d3)
{
  // Create raster filled with values in range [0,1]
  const [numRows, numCols] = [50, 50];
  const raster = new Array(numRows);
  for (let row = 0; row < numRows; row++) {
    raster[row] = new Array(numCols);
    for (let col = 0; col < numCols; col++) {
      raster[row][col] = Math.abs(Math.cos((col + 2 * row) / 18));
    }
  }

  return new Renderer(width, width / 5, rType)
    .fit(testCoords.flat(), 15)
    .image(
      toImgArray(raster, {
        clrFn: d3.scaleSequential(d3.interpolateOranges),
        opacity: 180
      }),
      numCols,
      101000,
      0,
      29000,
      15000
    )
    .strokeWidth(2)
    .fill("rgba(225,197,182,0.2)")
    .polygon(testCoords[0])
    .fill("rgba(236,224,218,0.7)")
    .polygon(testCoords[1])
    .render();
}


function _36(md){return(
md`#### Geo shape`
)}

async function _37(d3,topojson,Renderer,width,rType)
{
  const london = await d3
    .json("https://gicentre.github.io/data/geoTutorials/londonBoroughs.json")
    .then((feats) => topojson.feature(feats, feats.objects.boroughs));

  const centroids = await d3.csv(
    "https://gicentre.github.io/data/geoTutorials/londonCentroids.csv"
  );

  const brownFn = (att) => {
    return `hsla(20, ${20 + Math.random() * 50}%, ${
      60 + Math.random() * 20
    }%, 0.5)`;
  };

  // Draw map polygons
  const r = new Renderer(width / 2, width / 3, rType)
    .setProjection(d3.geoTransverseMercator().rotate([2, 0])) // Approximates OSGB map projection
    .stroke("hsl(20,10%,20%)")
    .strokeWidth(0.5)
    .geoShape(london, "properties.GSSCode", brownFn);

  // Draw labels at borough centroids.
  r.stroke()
    .font(rType.startsWith("Rough") ? "Rock Salt" : "Source Serif Pro")
    .textAlign("middle")
    .textBaseline("middle")
    .textSize(6);
  centroids.forEach((c) => r.text(c.FID.split(" ")[0], c.cx, c.cy));

  return r.render();
}


function _38(md){return(
md`#### Text alignment and metrics`
)}

function _font(Inputs){return(
Inputs.radio(
  ["serif", "sans-serif", "monospace", "Source Serif Pro", "Rock Salt"],
  {
    label: "Font",
    value: "Source Serif Pro"
  }
)
)}

function _tSize(Inputs){return(
Inputs.range([0, 32], {
  label: "Font Size",
  value: 24,
  step: 1
})
)}

function _tBorder(Inputs){return(
Inputs.range([0, 32], {
  label: "Border",
  value: 5,
  step: 1
})
)}

function _hAlign(Inputs){return(
Inputs.radio(["left", "middle", "right"], {
  label: "Justify",
  value: "middle"
})
)}

function _vAlign(Inputs){return(
Inputs.radio(["top", "middle", "bottom"], {
  label: "Baseline",
  value: "middle"
})
)}

function _44(d3,width,Renderer,rType,tSize,hAlign,vAlign,font,tBorder)
{
  const x1 = 0.5;
  const y1 = 0.5;
  const text = "Let 6149 goats SHOUT";
  const xSc = d3.scaleLinear().domain([0, 1]).range([0, width]);
  const ySc = d3.scaleLinear().domain([0, 1]).range([0, 300]);

  const r = new Renderer(width, 300, rType)
    .setScales(xSc, ySc)
    .translate(-50, -30)
    .scale(0.85)
    .pointSize(12)
    .textSize(tSize)
    .textAlign(hAlign)
    .textBaseline(vAlign)
    .font(font);

  const tm = r.textMetrics(text, tBorder);

  r.push()
    .stroke()
    .textSize(12)
    .font("monospace")
    .textAlign("left")
    .textBaseline("bottom")
    .text("Text width:  " + Number(tm.width).toFixed(2), 0.01, 0.92)
    .text("Text height: " + Number(tm.height).toFixed(2), 0.01, 0.99)
    .pop();

  return r
    .stroke("black")
    .fill("rgba(180,90,45,0.4)")
    .polygon(tm.box([x1, y1]))
    .stroke()
    .fill("black")
    .text(text, x1, y1)
    .fill("rgb(180,90,45)")
    .points([[x1, y1]])
    .render();
}


function _45(md){return(
md`#### Axes

_Linear (central), log (left), temporal (bottom), band (top) and ordinal (right) scales applied to axes._`
)}

function _46(width,d3,Renderer,rType)
{
  const w = width * 0.5;
  const h = width * 0.3;
  const borderX = 80;
  const borderY = 40;

  const xScBand = d3
    .scaleBand()
    .domain(["A", "B", "C", "D"])
    .range([borderX, w - borderX]);

  const xScLin = d3
    .scaleLinear()
    .domain([-500, 500])
    .range([borderX, w - borderX]);

  const xScTime = d3
    .scaleTime()
    .domain([new Date(2021, 0, 1), new Date(2021, 6, 1)])
    .range([borderX, w - borderX]);

  const yScLin = d3
    .scaleLinear()
    .domain([-500, 500])
    .range([h - borderY, borderY]);

  const yScLog = d3
    .scaleLog()
    .domain([1, 100000])
    .range([h - borderY, borderY]);

  const yScOrd = d3
    .scaleOrdinal()
    .domain(["lower", "mid", "upper"])
    .range([h - borderY, h / 2, borderY]);

  return new Renderer(w, h, rType)
    .font(
      rType == "SVG" || rType == "Canvas" ? "Source Serif Pro" : "Rock Salt"
    )

    .textSize(w / 60)
    .fill("grey")
    .axisLeft(xScTime, yScLin, [-499, 499], new Date(2021, 3, 1))
    .axisBottom(xScLin, yScLin, [-499, 499], 0)
    .stroke("grey")
    .axisBottom(xScTime, yScLog, null, null, "Temporal axis label")
    .axisLeft(xScBand, yScLog, null, null, "log axis label")
    .axisRight(xScBand, yScOrd, null, null, "Ordinal axis label")
    .axisTop(xScBand, yScLin, null, null, "Band axis label")

    .render();
}


function _47(md){return(
md`#### Event Handling

*Click to add points. Pressing the shift key while clicking creates larger circles.*`
)}

function _48(update,Renderer,width,rType,testCoords,points,d3,keyState,$0,keyDownHandler,keyUpHandler)
{
  update;
  const r = new Renderer(width, width / 5, rType);

  r.strokeWidth(2)
    .fill("rgba(180,90,45,0.5)")

    // Transform from data to screen for polygon
    .push()
    .fit(testCoords.flat(), 15)
    .polygon(testCoords[0])
    .pop()

    // Use screen coords directly for interaction
    .addListener("click", (ev) => {
      points.push([
        ...d3.pointer(ev),
        keyState.event.key === "Shift" && keyState.isDown ? 15 : 8
      ]);
      $0.value = true;
    })
    .addKeyListener("keydown", keyDownHandler)
    .addKeyListener("keyup", keyUpHandler);

  points.forEach((pt) => r.ellipse(...pt));
  return r.render();
}


function _points(){return(
[]
)}

function _50(md){return(
md`_Click to add points to build a (local Bezier) curve._`
)}

function _51(Renderer,width,rType,d3)
{
  const pts = [];
  const updateCurve = () =>
    r
      .clear()
      .stroke("black")
      .points(pts)
      .stroke("rgb(180,90,45)")
      .bezierLine(pts, 0.2);

  const r = new Renderer(width, width / 5, rType).strokeWidth(2).fill();
  return r
    .addListener("click", (ev) => {
      pts.push(d3.pointer(ev));
      updateCurve();
    })
    .render();
}


function _52(md){return(
md`*Click on area below to focus and press keys to leave a message. Will only update is mouse is resting i the message area.*`
)}

function _53(update,Renderer,width,rType,msg,keyDownHandler,keyState)
{
  update; // This will change whenever a key is pressed so can update message
  const r = new Renderer(width, 50)
    .clear("rgba(180,90,45,0.2)")
    .stroke()
    .font(rType.startsWith("Rough") ? "Rock Salt" : "Source Serif Pro")
    .textSize(18);

  const validKey = (k) =>
    k == 32 ||
    (k > 47 && k < 58) ||
    (k > 64 && k < 91) ||
    (k > 95 && k < 112) ||
    (k > 185 && k < 193) ||
    (k > 218 && k < 223);

  r.addListener("mouseover", (evt) => (msg.focus = true))
    .addListener("mouseout", (evt) => (msg.focus = false))
    .addKeyListener("keydown", keyDownHandler); // Keeps record of last key pressed

  if (keyState.event && keyState.isDown && msg.focus) {
    const key = keyState.event.keyCode || keyState.event.charCode;
    if (key == 8 || key == 46) {
      msg.text.splice(-1);
    } else if (validKey(key)) {
      msg.text.push(keyState.event.key);
    }
  }
  return r.text(msg.text.join(""), 10, 40).render();
}


function _msg(){return(
{ text: [], focus: false }
)}

function _keyDownHandler(keyState,$0){return(
function keyDownHandler(ev) {
  keyState.event = ev;
  keyState.isDown = true;
  $0.value = true; // To allow update whenever a new key is pressed.
}
)}

function _keyUpHandler(keyState,$0){return(
function keyUpHandler(ev) {
  keyState.isDown = false;
  $0.value = true; // To allow update whenever a key is released.
}
)}

function _keyState(){return(
{ event: { key: "" }, isDown: false }
)}

function _update(){return(
false
)}

function _59(md){return(
md`#### Screen transformations`
)}

function _60(Renderer,width,rType,house,d3)
{
  const r = new Renderer(width, width / 5, rType)
    .fit(house.flat(), 25)
    .flipY()
    .fill("rgba(180,90,45,0.5)")
    .strokeWidth(2)
    .polygon(house); // No screen transform

  const [cx, cy] = r.dataToScreen(d3.polygonCentroid(house.flat()));

  // Rotate about centre and translate to right
  r.push()
    .translate(220 + cx, cy)
    .rotate(15)
    .translate(-cx, -cy)
    .polygon(house)

    // Tiny house at centre
    .push()
    .translate(cx, cy)
    .scale(0.25)
    .translate(-cx, -cy)
    .fill("rgba(45,90,180,0.5)")
    .polygon(house)
    .pop() // Finish tiny scaling

    .pop() // Finish rotation

    // Translate original to the right by twice the second house's translation.
    .translate(440, 0)
    .polygon(house);

  return r.render();
}


function _61(md){return(
md`_Click to add points to scaled shape below_`
)}

function _62(Renderer,width,rType,house,d3)
{
  const r = new Renderer(width, width / 5, rType)
    .fit(house.flat(), 30)
    .flipY()
    .fill("rgba(180,90,45,0.5)")
    .strokeWidth(2)
    .pointSize(12)

    .scale(0.5)
    .translate(200, 100)
    .rotate(-15)
    .multiPolygon(house)
    .addListener("click", (ev) => r.points([r.screenToData(d3.pointer(ev))]));

  return r.render();
}


function _63(md){return(
md`_Zooming and panning: Try dragging to pan and mousewheel/trackpad up/down to zoom_`
)}

function _64(Renderer,width,rType,testCoords,d3)
{
  const r = new Renderer(width, width / 5, rType).fit(testCoords[0], 15);
  const title = (r) =>
    r
      .font(rType == "SVG" || rType == "Canvas" ? "monospace" : "Rock Salt")
      .push()
      .textAlign("left")
      .textBaseline("top")
      .textSize(14)
      .stroke()
      .fill("black")
      .text("A fixed title", 100000, 0)
      .pop();

  const drawScene = (r) =>
    r
      .stroke("black")
      .strokeWidth(2)
      .fill("rgba(180,90,45,0.5)")
      .polygon(testCoords[0])
      .push()
      .stroke()
      .textSize(4)
      .textAlign("right")
      .textBaseline("bottom")
      .fill("black")
      .rotate(12.5)
      .text("Tiny text only legible when zoomed", 111000, 2500)
      .pop();

  const zFn = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", ({ transform }) => {
      r.clear();
      title(r);
      r.push()
        .translate(transform.x, transform.y)
        .scale(transform.k, transform.k);
      drawScene(r).pop();
    });

  r.selection().call(zFn);
  title(r);
  return drawScene(r).render();
}


export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], _1);
  main.variable(observer()).define(["Renderer"], _2);
  main.variable(observer()).define(["md"], _3);
  main.variable(observer()).define(["md"], _4);
  main.variable(observer()).define(["md"], _5);
  main.variable(observer()).define(["md"], _6);
  main.variable(observer()).define(["md"], _7);
  main.variable(observer()).define(["md"], _8);
  main.variable(observer()).define(["md"], _9);
  main.variable(observer()).define(["md"], _10);
  main.variable(observer("toImgArray")).define("toImgArray", ["d3"], _toImgArray);
  main.variable(observer()).define(["md"], _12);
  main.variable(observer("bezierLineCoords")).define("bezierLineCoords", _bezierLineCoords);
  main.variable(observer()).define(["md"], _14);
  main.variable(observer()).define(["md"], _15);
  main.variable(observer("Renderer")).define("Renderer", ["DOM","d3","rough"], _Renderer);
  main.variable(observer()).define(["md"], _17);
  main.variable(observer("style")).define("style", ["html"], _style);
  main.variable(observer()).define(["md"], _19);
  main.variable(observer("topojson")).define("topojson", ["require"], _topojson);
  main.variable(observer()).define(["md"], _21);
  main.variable(observer("rough")).define("rough", ["require"], _rough);
  main.variable(observer()).define(["md"], _23);
  main.variable(observer("testCoords")).define("testCoords", _testCoords);
  main.variable(observer("ringCoords")).define("ringCoords", _ringCoords);
  main.variable(observer("house")).define("house", _house);
  main.variable(observer("viewof rType")).define("viewof rType", ["Inputs"], _rType);
  main.variable(observer("rType")).define("rType", ["Generators", "viewof rType"], (G, _) => G.input(_));
  main.variable(observer()).define(["md"], _28);
  main.variable(observer()).define(["Renderer","width","rType","testCoords"], _29);
  main.variable(observer()).define(["md"], _30);
  main.variable(observer()).define(["Renderer","width","rType","testCoords"], _31);
  main.variable(observer()).define(["md"], _32);
  main.variable(observer()).define(["Renderer","width","rType","ringCoords"], _33);
  main.variable(observer()).define(["md"], _34);
  main.variable(observer()).define(["Renderer","width","rType","testCoords","toImgArray","d3"], _35);
  main.variable(observer()).define(["md"], _36);
  main.variable(observer()).define(["d3","topojson","Renderer","width","rType"], _37);
  main.variable(observer()).define(["md"], _38);
  main.variable(observer("viewof font")).define("viewof font", ["Inputs"], _font);
  main.variable(observer("font")).define("font", ["Generators", "viewof font"], (G, _) => G.input(_));
  main.variable(observer("viewof tSize")).define("viewof tSize", ["Inputs"], _tSize);
  main.variable(observer("tSize")).define("tSize", ["Generators", "viewof tSize"], (G, _) => G.input(_));
  main.variable(observer("viewof tBorder")).define("viewof tBorder", ["Inputs"], _tBorder);
  main.variable(observer("tBorder")).define("tBorder", ["Generators", "viewof tBorder"], (G, _) => G.input(_));
  main.variable(observer("viewof hAlign")).define("viewof hAlign", ["Inputs"], _hAlign);
  main.variable(observer("hAlign")).define("hAlign", ["Generators", "viewof hAlign"], (G, _) => G.input(_));
  main.variable(observer("viewof vAlign")).define("viewof vAlign", ["Inputs"], _vAlign);
  main.variable(observer("vAlign")).define("vAlign", ["Generators", "viewof vAlign"], (G, _) => G.input(_));
  main.variable(observer()).define(["d3","width","Renderer","rType","tSize","hAlign","vAlign","font","tBorder"], _44);
  main.variable(observer()).define(["md"], _45);
  main.variable(observer()).define(["width","d3","Renderer","rType"], _46);
  main.variable(observer()).define(["md"], _47);
  main.variable(observer()).define(["update","Renderer","width","rType","testCoords","points","d3","keyState","mutable update","keyDownHandler","keyUpHandler"], _48);
  main.variable(observer("points")).define("points", _points);
  main.variable(observer()).define(["md"], _50);
  main.variable(observer()).define(["Renderer","width","rType","d3"], _51);
  main.variable(observer()).define(["md"], _52);
  main.variable(observer()).define(["update","Renderer","width","rType","msg","keyDownHandler","keyState"], _53);
  main.variable(observer("msg")).define("msg", _msg);
  main.variable(observer("keyDownHandler")).define("keyDownHandler", ["keyState","mutable update"], _keyDownHandler);
  main.variable(observer("keyUpHandler")).define("keyUpHandler", ["keyState","mutable update"], _keyUpHandler);
  main.variable(observer("keyState")).define("keyState", _keyState);
  main.define("initial update", _update);
  main.variable(observer("mutable update")).define("mutable update", ["Mutable", "initial update"], (M, _) => new M(_));
  main.variable(observer("update")).define("update", ["mutable update"], _ => _.generator);
  main.variable(observer()).define(["md"], _59);
  main.variable(observer()).define(["Renderer","width","rType","house","d3"], _60);
  main.variable(observer()).define(["md"], _61);
  main.variable(observer()).define(["Renderer","width","rType","house","d3"], _62);
  main.variable(observer()).define(["md"], _63);
  main.variable(observer()).define(["Renderer","width","rType","testCoords","d3"], _64);
  return main;
}
