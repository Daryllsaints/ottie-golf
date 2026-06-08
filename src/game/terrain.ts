// Course design. Three holes inspired by famous real-world holes:
// 1. TPC Sawgrass #17 (Island Green, par 3)
// 2. Pebble Beach #7 (Cliffside par 3)
// 3. St Andrews #17 (Road Hole, par 4)
//
// All three holes share the same 18x36 world grid so the camera /
// physics / world bounds stay constant across hole changes. Only the
// per-cell terrainAt function differs, plus the tee/hole positions.
// Aspect 0.5 sits closer to phone portrait (~0.46) than the prior
// 0.6 ratio so cover-fit crops far less.

export type Terrain = 'ocean' | 'rough' | 'fairway' | 'sand' | 'green';

export const TILE_PX = 32;
export const GRID_COLS = 28;
export const GRID_ROWS = 40;
export const WORLD_W = GRID_COLS * TILE_PX;
export const WORLD_H = GRID_ROWS * TILE_PX;
export const PX_PER_YARD = 6.4;

// ─── Hole definitions ──────────────────────────────────────────────

export type HoleSpec = {
    name: string;
    inspiration: string;
    par: number;
    gridCols: number;
    gridRows: number;
    teeVertex:  { col: number; row: number };
    holeVertex: { col: number; row: number };
    terrainAt: (col: number, row: number) => Terrain;
};

// Hole 1: Sawgrass #17 Island Green. Par 3, ~135 yds.
const sawgrass17: HoleSpec = (() => {
    const COLS = GRID_COLS;
    const ROWS = GRID_ROWS;
    const TEE  = { col: 14, row: ROWS - 8 };
    const HOLE = { col: 14, row: 7 };
    return {
        name: 'The Island',
        inspiration: 'TPC Sawgrass #17',
        par: 3,
        gridCols: COLS, gridRows: ROWS,
        teeVertex: TEE, holeVertex: HOLE,
        terrainAt(col: number, row: number): Terrain {
            const teeDx = col - TEE.col;
            const teeDy = row - TEE.row;
            const distTee = Math.hypot(teeDx / 1.3, teeDy / 0.9);
            if (distTee < 2.6) return 'rough';

            const greenDx = col - HOLE.col;
            const greenDy = row - HOLE.row;
            const distGreen = Math.hypot(greenDx / 1.3, greenDy / 1.0);
            if (distGreen < 2.6) return 'green';
            if (distGreen < 3.4) return 'rough';

            const sandDx = col - (HOLE.col + 2.0);
            const sandDy = row - (HOLE.row + 1.8);
            const distSand = Math.hypot(sandDx / 1.0, sandDy / 0.7);
            if (distSand < 1.3) return 'sand';

            return 'ocean';
        },
    };
})();

// Smoothstep: cubic Hermite curve (3t^2 - 2t^3) clamped to [0,1].
// Continuous in value AND first derivative, so any path interpolated
// through it never produces the slope-kink artifact that linear lerp
// produces at segment joins.
function smoothstep01(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
}

// Hole 2: Pebble Beach #7. Famous tiny green at the edge of the
// Pacific cliff, ringed by bunkers. Ocean wraps the right and back
// of the green so a fade or pulled shot dies on the rocks.
const pebble7: HoleSpec = (() => {
    const COLS = GRID_COLS;
    const ROWS = GRID_ROWS;
    const TEE  = { col: 10, row: ROWS - 8 };
    const HOLE = { col: 17, row: 8 };
    return {
        name: 'Cliff Top',
        inspiration: 'Pebble Beach #7',
        par: 3,
        gridCols: COLS, gridRows: ROWS,
        teeVertex: TEE, holeVertex: HOLE,
        terrainAt(col: number, row: number): Terrain {
            // Ocean along the right edge plus behind/above the green.
            if (col >= 22) return 'ocean';
            if (row <= 4) return 'ocean';
            if (col >= 20 && row <= 6) return 'ocean';

            // Tiny putting green near the cliff.
            const gDx = col - HOLE.col;
            const gDy = row - HOLE.row;
            if (Math.hypot(gDx / 1.0, gDy / 0.8) < 1.5) return 'green';

            // Three bunkers ring the green (front, right, back).
            if (Math.hypot((col - 16) / 0.8, (row - 11) / 0.6) < 1.1) return 'sand';
            if (Math.hypot((col - 19) / 0.6, (row - 9) / 0.7)  < 1.1) return 'sand';
            if (Math.hypot((col - 16) / 0.8, (row - 6) / 0.5)  < 1.0) return 'sand';

            // Fairway corridor smoothed via smoothstep so the curve has
            // continuous slope and the edges read as a flowing river of
            // grass instead of a kinked polyline.
            const tNorm = (ROWS - row) / (ROWS - HOLE.row);
            const s = smoothstep01(tNorm);
            const fairwayCol = TEE.col + (HOLE.col - TEE.col) * s;
            if (Math.abs(col - fairwayCol) < 2.6 && row > HOLE.row + 2 && row < ROWS - 1) return 'fairway';

            // Tee box.
            const tDx = col - TEE.col;
            const tDy = row - TEE.row;
            if (Math.hypot(tDx / 1.6, tDy / 1.0) < 2.2) return 'rough';

            // Default land is rough until we hit ocean on the right.
            if (col < 20) return 'rough';
            return 'ocean';
        },
    };
})();

// Hole 3: St Andrews #17 Road Hole. Par 4 dogleg right with the
// infamous Road Bunker front-left of a narrow elongated green.
// Inland, so no ocean here; rough wraps the fairway.
const road17: HoleSpec = (() => {
    const COLS = GRID_COLS;
    const ROWS = GRID_ROWS;
    const TEE  = { col: 8, row: ROWS - 8 };
    const HOLE = { col: 19, row: 6 };
    return {
        name: 'The Road Hole',
        inspiration: 'St Andrews #17',
        par: 4,
        gridCols: COLS, gridRows: ROWS,
        teeVertex: TEE, holeVertex: HOLE,
        terrainAt(col: number, row: number): Terrain {
            // Narrow green tucked top-right.
            const gDx = col - HOLE.col;
            const gDy = row - HOLE.row;
            if (Math.hypot(gDx / 1.4, gDy / 0.55) < 1.5) return 'green';

            // Road Bunker: deep sand front-left of the green.
            if (Math.hypot((col - 17) / 0.85, (row - 8) / 0.6) < 1.2) return 'sand';

            // Dogleg fairway. tNorm goes 0 at the tee, 1 at the green.
            // The bend kicks in around tNorm 0.45 and is shaped by a
            // smoothstep so the slope never kinks (the old linear lerp
            // produced a visible 'crease' down the fairway center). The
            // corridor is also slightly wider mid-dogleg for forgiveness.
            const tNorm = (ROWS - row) / (ROWS - HOLE.row - 2);
            const bendT = smoothstep01((tNorm - 0.25) / 0.75);
            const centerCol = TEE.col + (HOLE.col - TEE.col) * bendT;
            const widthFalloff = 1 - 0.35 * Math.abs(tNorm - 0.55);
            const corridorWidth = 2.6 * Math.max(0.7, widthFalloff);
            if (Math.abs(col - centerCol) < corridorWidth && row > HOLE.row + 2 && row < ROWS - 1) return 'fairway';

            // Tee box.
            const tDx = col - TEE.col;
            const tDy = row - TEE.row;
            if (Math.hypot(tDx / 1.7, tDy / 1.0) < 2.0) return 'rough';

            return 'rough';
        },
    };
})();

// Difficulty ramp for first-time players: open with the forgiving
// dogleg-with-fairway-recovery (Road Hole), middle with the small
// cliff green (Pebble), end with the dramatic island (Sawgrass) so
// the final hole carries the most weight.
export const HOLES: HoleSpec[] = [road17, pebble7, sawgrass17];

// ─── Active hole (mutable, ESM live bindings) ─────────────────────
//
// The renderer and gameplay code imports ACTIVE_HOLE, TEE_WORLD,
// HOLE_WORLD, and terrainAt directly. ESM `export let` bindings are
// LIVE: re-assigning them inside this module is observed by every
// importing module on next access. setHoleIndex() is the only way
// these values change at runtime; call it before scene.restart().

let _activeHoleIdx = 0;
export let ACTIVE_HOLE: HoleSpec = HOLES[_activeHoleIdx];
export let TEE_VERTEX  = ACTIVE_HOLE.teeVertex;
export let HOLE_VERTEX = ACTIVE_HOLE.holeVertex;

export function vertexToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_PX, y: row * TILE_PX };
}

export let TEE_WORLD  = vertexToWorld(TEE_VERTEX.col,  TEE_VERTEX.row);
export let HOLE_WORLD = vertexToWorld(HOLE_VERTEX.col, HOLE_VERTEX.row);
export let terrainAt: (col: number, row: number) => Terrain = ACTIVE_HOLE.terrainAt;

export function activeHoleIndex(): number {
    return _activeHoleIdx;
}

export function setHoleIndex(i: number): void {
    _activeHoleIdx = Math.max(0, Math.min(HOLES.length - 1, i));
    ACTIVE_HOLE  = HOLES[_activeHoleIdx];
    TEE_VERTEX   = ACTIVE_HOLE.teeVertex;
    HOLE_VERTEX  = ACTIVE_HOLE.holeVertex;
    TEE_WORLD    = vertexToWorld(TEE_VERTEX.col,  TEE_VERTEX.row);
    HOLE_WORLD   = vertexToWorld(HOLE_VERTEX.col, HOLE_VERTEX.row);
    terrainAt    = ACTIVE_HOLE.terrainAt;
}

// ─── Grid utilities ───────────────────────────────────────────────

export type TerrainGrid = Terrain[][];

export function buildTerrainGrid(): TerrainGrid {
    const grid: TerrainGrid = [];
    for (let row = 0; row <= GRID_ROWS; row++) {
        const r: Terrain[] = [];
        for (let col = 0; col <= GRID_COLS; col++) {
            r.push(terrainAt(col, row));
        }
        grid.push(r);
    }
    return grid;
}

export function cornerPattern(grid: TerrainGrid, cellCol: number, cellRow: number): [Terrain, Terrain, Terrain, Terrain] {
    const tl = grid[cellRow]   [cellCol];
    const tr = grid[cellRow]   [cellCol + 1];
    const br = grid[cellRow + 1][cellCol + 1];
    const bl = grid[cellRow + 1][cellCol];
    return [tl, tr, br, bl];
}

export function allSame(corners: [Terrain, Terrain, Terrain, Terrain]): Terrain | null {
    const [a, b, c, d] = corners;
    return (a === b && b === c && c === d) ? a : null;
}

export function anyIs(corners: [Terrain, Terrain, Terrain, Terrain], t: Terrain): boolean {
    return corners[0] === t || corners[1] === t || corners[2] === t || corners[3] === t;
}

export type TreeSpawn = { x: number; y: number; scale: number };

/** Tree positions: shoreline cells frame the islands densely;
 *  inland cells get scattered trees so the wider course reads as
 *  a real landscape instead of an empty green field. Trees never
 *  touch fairway / green / sand edges, and adjacent cells with a
 *  recent neighbour are skipped to keep clusters from looking
 *  like a forest wall. */
export function generateTreePositions(grid: TerrainGrid): TreeSpawn[] {
    const out: TreeSpawn[] = [];
    const placed: boolean[][] = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));

    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const corners = cornerPattern(grid, col, row);
            const here = grid[row][col];
            if (here !== 'rough') continue;

            // Don't crowd the fairway / green / sand edges.
            const touchesPlay = anyIs(corners, 'fairway') || anyIs(corners, 'green') || anyIs(corners, 'sand');
            if (touchesPlay) continue;

            // No clustering: skip if any of the 4-neighbours already
            // got a tree. Diagonals are still allowed which keeps the
            // grove feel without solid walls.
            if (
                (row > 0          && placed[row - 1][col]) ||
                (row < GRID_ROWS - 1 && placed[row + 1][col]) ||
                (col > 0          && placed[row][col - 1]) ||
                (col < GRID_COLS - 1 && placed[row][col + 1])
            ) continue;

            const hasOcean = anyIs(corners, 'ocean');
            // Deterministic per-cell pseudo-random (no Math.random so
            // the scene rebuild after hole change is stable).
            const seed = (col * 73 + row * 191) % 100;

            // Shoreline ~18% (down from 25%), inland ~8% (down from
            // 14%). The no-cluster check sparsens these further so
            // effective density is lower than the threshold suggests.
            const threshold = hasOcean ? 18 : 8;
            if (seed > threshold) continue;

            placed[row][col] = true;
            const jx = ((seed * 13) % 11) - 5;
            const jy = ((seed * 7)  % 11) - 5;
            // Vary scale 0.82..1.02 per seed for visual interest.
            const scale = 0.82 + ((seed * 29) % 20) / 100;
            out.push({
                x: col * TILE_PX + TILE_PX / 2 + jx,
                y: row * TILE_PX + TILE_PX / 2 + jy,
                scale,
            });
        }
    }
    return out;
}

/** Returns true if a given world-space point is over water terrain.
 *  Used for the water-hazard check when the ball comes to rest. */
export function isOverWater(grid: TerrainGrid, worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / TILE_PX);
    const row = Math.floor(worldY / TILE_PX);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return true;
    const corners = cornerPattern(grid, col, row);
    return corners.every(c => c === 'ocean');
}
