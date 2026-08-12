/**
 * Parallel Utilities — worker_threads pool (Node only)
 *
 * Real parallelism for CPU-bound leaf-packing solves: each worker has its own
 * V8 isolate and its own GLPK.js WASM instance, so MIP solves genuinely run on
 * separate threads (a JS-side concurrency pool would NOT help because
 * glpk.js's solve() is synchronous).
 *
 * worker_threads is dynamically imported so the browser bundle is unaffected;
 * calling this in a browser throws (callers should fall back to sequential).
 */

/**
 * Run `tasks` on a pool of worker threads, preserving task order.
 *
 * @param {Array} tasks - Array of { index, payload } (payload must be
 *   structured-cloneable). `index` is the result slot.
 * @param {string|URL} workerUrl - ESM worker entry (absolute path or file URL).
 * @param {Object} [options]
 * @param {number} [options.concurrency] - Number of workers (default:
 *   min(8, cpuCount - 1), clamped to task count).
 * @param {Function} [options.onProgress] - (fraction: 0..1) => void.
 * @returns {Promise<Array>} results in task order.
 */
export async function runWorkerPool(tasks, workerUrl, options = {}) {
  const { concurrency = 0, onProgress = null } = options;
  let Worker;
  let cpuCount = 4;
  try {
    const wt = await import("worker_threads");
    Worker = wt.Worker;
    try {
      const os = await import("os");
      cpuCount = os.cpus?.().length || 4;
    } catch {
      cpuCount = 4;
    }
  } catch {
    throw new Error(
      "runWorkerPool: worker_threads is not available in this environment",
    );
  }

  const n = tasks.length;
  if (n === 0) return [];
  const workers = Math.max(
    1,
    Math.min(
      concurrency > 0 ? concurrency : Math.max(1, Math.min(8, cpuCount - 1)),
      n,
    ),
  );

  const results = new Array(n);
  const queue = tasks.slice();
  let returned = 0;

  await new Promise((resolve, reject) => {
    const spawn = () => {
      const worker = new Worker(workerUrl);
      worker.on("message", (msg) => {
        if (msg.type === "result") {
          results[msg.taskIndex] = msg.result;
          returned++;
          if (onProgress) onProgress(returned / n);
          if (queue.length > 0) {
            const t = queue.shift();
            worker.postMessage({ taskIndex: t.index, payload: t.payload });
          } else {
            worker.terminate();
          }
          if (returned === n) resolve();
        } else if (msg.type === "error") {
          worker.terminate();
          reject(new Error(msg.error));
        }
      });
      worker.on("error", (err) => {
        worker.terminate();
        reject(err);
      });
      if (queue.length > 0) {
        const t = queue.shift();
        worker.postMessage({ taskIndex: t.index, payload: t.payload });
      } else {
        worker.terminate();
      }
    };
    for (let i = 0; i < workers; i++) spawn();
  });

  return results;
}
