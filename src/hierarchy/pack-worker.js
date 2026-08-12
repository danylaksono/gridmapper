/**
 * Pack Worker (worker_threads)
 *
 * Packs leaf features into a parent block ('block' mode → packLeavesIntoBlock)
 * or a parent shape ('shape' mode → packIntoShape) using this worker's own
 * GLPK.js instance, so multiple leaf MIPs run on parallel threads.
 *
 * Contract:
 *   in:  { taskIndex, payload: { mode, children:[{id,x,y}], block?, shape?,
 *         compactness, smallBlockThreshold } }
 *   out: { type:'result', taskIndex, result: [{ childId, gridX, gridY,
 *         gridRows, gridCols, subdivided }] }
 *        — for 'block': gridX/gridY are global (block-relative), or sub-local
 *          when subdivided. For 'shape': gridX/gridY are shape-local.
 */
import { parentPort } from "worker_threads";
import glpkModule from "glpk.js";
import { packLeavesIntoBlock } from "./footprint-packer.js";
import { packIntoShape } from "./mosaic-allocator.js";
import { GLPKSolver } from "../solvers/glpk-solver.js";

let glpkPromise = null;

async function handle(payload) {
  if (!glpkPromise) glpkPromise = glpkModule();
  const glpk = await glpkPromise;
  const mip = () => new GLPKSolver(glpk);
  const opts = {
    mip,
    xAccessor: (d) => d.x,
    yAccessor: (d) => d.y,
    compactness: payload.compactness ?? 0.5,
    smallBlockThreshold: payload.smallBlockThreshold ?? 6,
  };

  if (payload.mode === "block") {
    const children = payload.children.map((c) => ({ item: c }));
    const packed = await packLeavesIntoBlock(children, payload.block, opts);
    return packed.map((p) => ({
      childId: p.id,
      gridX: p.gridX,
      gridY: p.gridY,
      gridRows: p.gridRows,
      gridCols: p.gridCols,
      subdivided: !!p._subdivided,
    }));
  }

  // mode 'shape'
  const children = payload.children.map((c) => ({ item: c }));
  const shape = payload.shape;
  const packed = await packIntoShape(children, shape, opts);
  return packed.map((p) => ({
    childId: p.item.id,
    gridX: p.localC,
    gridY: p.localR,
    gridRows: shape.shapeRows,
    gridCols: shape.shapeCols,
  }));
}

parentPort.on("message", async (msg) => {
  try {
    const result = await handle(msg.payload);
    parentPort.postMessage({
      type: "result",
      taskIndex: msg.taskIndex,
      result,
    });
  } catch (e) {
    parentPort.postMessage({
      type: "error",
      taskIndex: msg.taskIndex,
      error: String((e && e.stack) || e),
    });
  }
});
