/**
 * Adjacency Fixer - Local heuristic to reduce 'cut' edges (non-adjacent assigned pairs)
 * Works by moving a feature into a nearby empty cell or swapping with a neighbor
 */

export function reduceCutEdges(assignments, adjacencyGraph, rows, cols, options = {}) {
    const maxIter = options.maxIter || 500;
    const adjacencyDiagonal = options.adjacencyDiagonal || false;
    const spacerSet = options.spacerSet || new Set();

    // Build maps: id -> assignment index
    const idToIdx = new Map();
    assignments.forEach((a, idx) => idToIdx.set(a.id ?? idx, idx));

    // occupancy set: cellKey -> idx
    const cellKey = (r, c) => `${r}_${c}`;
    const occ = new Map();
    assignments.forEach((a, idx) => occ.set(cellKey(a.gridY, a.gridX), idx));

    function areCellsAdjacent(aCell, bCell) {
        const [ar, ac] = aCell.split('_').map(Number);
        const [br, bc] = bCell.split('_').map(Number);
        const dr = Math.abs(ar - br);
        const dc = Math.abs(ac - bc);
        if (adjacencyDiagonal) return Math.max(dr, dc) === 1;
        return (dr + dc) === 1;
    }

    function countCuts() {
        let cuts = 0;
        adjacencyGraph.edges.forEach(e => {
            const ia = e.i; const ib = e.j;
            const aIdx = idToIdx.get(ia);
            const bIdx = idToIdx.get(ib);
            if (aIdx == null || bIdx == null) return;
            const aCell = cellKey(assignments[aIdx].gridY, assignments[aIdx].gridX);
            const bCell = cellKey(assignments[bIdx].gridY, assignments[bIdx].gridX);
            if (!areCellsAdjacent(aCell, bCell)) cuts++;
        });
        return cuts;
    }

    let currentCuts = countCuts();

    // Precompute neighbor offsets
    const nbrOffsets = adjacencyDiagonal ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,0],[1,0],[0,-1],[0,1]];

    let iter = 0;
    let improved = true;
    while (improved && iter < maxIter) {
        improved = false;
        iter++;

        // Find cut edges (shuffled for some randomness)
        const cutEdges = adjacencyGraph.edges.filter(e => {
            const ia = e.i; const ib = e.j;
            const aIdx = idToIdx.get(ia);
            const bIdx = idToIdx.get(ib);
            if (aIdx == null || bIdx == null) return false;
            const aCell = cellKey(assignments[aIdx].gridY, assignments[aIdx].gridX);
            const bCell = cellKey(assignments[bIdx].gridY, assignments[bIdx].gridX);
            return !areCellsAdjacent(aCell, bCell);
        });

        if (cutEdges.length === 0) break;

        // Try to fix each cut edge by moving one endpoint to an empty neighbor cell of the other
        for (const e of cutEdges) {
            const ia = e.i; const ib = e.j;
            const aIdx = idToIdx.get(ia);
            const bIdx = idToIdx.get(ib);
            if (aIdx == null || bIdx == null) continue;

            const aAssign = assignments[aIdx];
            const bAssign = assignments[bIdx];
            const bR = bAssign.gridY, bC = bAssign.gridX;

            // Try to move A into empty neighbor of B
            for (const [dr, dc] of nbrOffsets) {
                const nr = bR + dr, nc = bC + dc;
                if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
                const k = cellKey(nr, nc);
                if (spacerSet.has(k)) continue;
                if (!occ.has(k)) {
                    // Check delta in cuts if we move A to (nr,nc)
                    const oldCellA = cellKey(aAssign.gridY, aAssign.gridX);
                    const newCellA = k;

                    // quickly compute change in cuts for edges incident to A
                    let delta = 0;
                    adjacencyGraph.edges.forEach(ee => {
                        if (ee.i === ia || ee.j === ia) {
                            const other = ee.i === ia ? ee.j : ee.i;
                            const otherIdx = idToIdx.get(other);
                            if (otherIdx == null) return;
                            const otherCell = cellKey(assignments[otherIdx].gridY, assignments[otherIdx].gridX);
                            const wasAdj = areCellsAdjacent(oldCellA, otherCell);
                            const nowAdj = areCellsAdjacent(newCellA, otherCell);
                            if (wasAdj && !nowAdj) delta++;
                            else if (!wasAdj && nowAdj) delta--;
                        }
                    });

                    // Also moving might affect edge ea-eb (the one we're fixing) but already accounted above
                    if (delta < 0) {
                        // perform move
                        occ.delete(oldCellA);
                        occ.set(newCellA, aIdx);
                        aAssign.gridY = nr; aAssign.gridX = nc;
                        currentCuts += delta;
                        improved = true;
                        break;
                    }
                }
            }
            if (improved) break;

            // If moving A didn't work, try moving B into empty neighbor of A
            const aR = aAssign.gridY, aC = aAssign.gridX;
            for (const [dr, dc] of nbrOffsets) {
                const nr = aR + dr, nc = aC + dc;
                if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
                const k = cellKey(nr, nc);
                if (spacerSet.has(k)) continue;
                if (!occ.has(k)) {
                    // Evaluate delta similar to above for B
                    const oldCellB = cellKey(bAssign.gridY, bAssign.gridX);
                    const newCellB = k;
                    let delta = 0;
                    adjacencyGraph.edges.forEach(ee => {
                        if (ee.i === ib || ee.j === ib) {
                            const other = ee.i === ib ? ee.j : ee.i;
                            const otherIdx = idToIdx.get(other);
                            if (otherIdx == null) return;
                            const otherCell = cellKey(assignments[otherIdx].gridY, assignments[otherIdx].gridX);
                            const wasAdj = areCellsAdjacent(oldCellB, otherCell);
                            const nowAdj = areCellsAdjacent(newCellB, otherCell);
                            if (wasAdj && !nowAdj) delta++;
                            else if (!wasAdj && nowAdj) delta--;
                        }
                    });
                    if (delta < 0) {
                        occ.delete(oldCellB);
                        occ.set(newCellB, bIdx);
                        bAssign.gridY = nr; bAssign.gridX = nc;
                        currentCuts += delta;
                        improved = true;
                        break;
                    }
                }
            }
            if (improved) break;

            // Try simple swap with neighbor occupant that would reduce cuts
            // For each neighbor cell of B, if occupied by k, evaluate swapping A with k
            const bNbrs = nbrOffsets.map(([dr,dc]) => [bR + dr, bC + dc]).filter(([nr,nc]) => nr>=0 && nc>=0 && nr<rows && nc<cols);
            for (const [nr,nc] of bNbrs) {
                const k = cellKey(nr, nc);
                const occIdx = occ.get(k);
                if (occIdx == null) continue;
                // occIdx is index of some other assignment assigned to neighbor of B
                const other = assignments[occIdx];
                // Evaluate swapping A and other
                const oldCells = [cellKey(aAssign.gridY, aAssign.gridX), cellKey(other.gridY, other.gridX)];
                const newCells = [cellKey(other.gridY, other.gridX), cellKey(aAssign.gridY, aAssign.gridX)];
                let delta = 0;
                // Evaluate edges incident to A and other
                const affected = new Set();
                adjacencyGraph.edges.forEach(ee => {
                    if (ee.i === ia || ee.j === ia || ee.i === (other.id) || ee.j === (other.id)) affected.add(ee);
                });
                // convert to array
                Array.from(affected).forEach(ee => {
                    const nodes = [ee.i, ee.j];
                    nodes.forEach(nid => {
                        const idx = idToIdx.get(nid);
                        if (idx == null) return;
                    });
                });
                // For simplicity, we check if swapping reduces cuts on the focal edge
                const aCellAfter = cellKey(other.gridY, other.gridX);
                const bCell = cellKey(bAssign.gridY, bAssign.gridX);
                if (areCellsAdjacent(aCellAfter, bCell)) {
                    // perform swap
                    const tmpX = aAssign.gridX, tmpY = aAssign.gridY;
                    aAssign.gridX = other.gridX; aAssign.gridY = other.gridY;
                    other.gridX = tmpX; other.gridY = tmpY;
                    occ.set(cellKey(aAssign.gridY, aAssign.gridX), aIdx);
                    occ.set(cellKey(other.gridY, other.gridX), occIdx);
                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }

    return { assignments, meta: { initialCuts: null, finalCuts: countCuts(), iterations: iter } };
}