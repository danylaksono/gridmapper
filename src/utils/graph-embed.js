/**
 * Graph Embedding (simple force-directed layout)
 * Produces 2D coordinates for nodes based on adjacency edges and weights.
 * This is a lightweight alternative to spectral/MDS embedding that avoids heavy
 * numeric linear algebra dependencies.
 */

export function embedGraph(nodes, edges, options = {}) {
    const { iterations = 400, width = 1, height = 1, jitter = 0.01 } = options;

    const idToIdx = new Map();
    nodes.forEach((n, i) => idToIdx.set(n.id, i));
    const N = nodes.length;

    // Initialize positions randomly in 0..1
    const pos = new Array(N).fill(0).map(() => ({ x: Math.random(), y: Math.random() }));
    const disp = new Array(N).fill(0).map(() => ({ x: 0, y: 0 }));

    // Build adjacency list
    const adj = new Array(N).fill(0).map(() => []);
    edges.forEach(e => {
        const si = idToIdx.get(e.source);
        const ti = idToIdx.get(e.target);
        if (si == null || ti == null) return;
        const w = (e.weight || 1);
        adj[si].push({ v: ti, w });
        adj[ti].push({ v: si, w });
    });

    const area = width * height;
    const k = Math.sqrt(area / Math.max(1, N));

    for (let iter = 0; iter < iterations; iter++) {
        // reset displacements
        for (let i = 0; i < N; i++) {
            disp[i].x = 0;
            disp[i].y = 0;
        }

        // Repulsive forces (Coulomb-like)
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                let dx = pos[i].x - pos[j].x;
                let dy = pos[i].y - pos[j].y;
                let dist2 = dx * dx + dy * dy + 1e-9;
                let dist = Math.sqrt(dist2);
                let force = (k * k) / dist; // repulsive
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                disp[i].x += fx;
                disp[i].y += fy;
                disp[j].x -= fx;
                disp[j].y -= fy;
            }
        }

        // Attractive forces along edges
        for (let i = 0; i < N; i++) {
            for (const e of adj[i]) {
                const j = e.v;
                const w = e.w || 1;
                let dx = pos[i].x - pos[j].x;
                let dy = pos[i].y - pos[j].y;
                let dist2 = dx * dx + dy * dy + 1e-9;
                let dist = Math.sqrt(dist2);
                // Prefer stronger weights to pull closer: scale spring constant by weight
                let force = (dist * dist) / (k) * (1 / Math.max(1e-6, w));
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                disp[i].x -= fx;
                disp[i].y -= fy;
                // note: other side will be handled when j loops i
            }
        }

        // Update positions with small temperature and jitter
        const temp = (1 - iter / iterations) * 0.1 + jitter;
        for (let i = 0; i < N; i++) {
            let dx = disp[i].x;
            let dy = disp[i].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1e-9) {
                pos[i].x += (dx / len) * Math.min(len, temp);
                pos[i].y += (dy / len) * Math.min(len, temp);
            }
            // Small centering to keep layout bounded
            pos[i].x = Math.max(0, Math.min(1, pos[i].x));
            pos[i].y = Math.max(0, Math.min(1, pos[i].y));
        }
    }

    // Map positions back to node ids
    const out = {};
    nodes.forEach((n, i) => { out[n.id] = { x: pos[i].x * width, y: pos[i].y * height }; });

    return out;
}
