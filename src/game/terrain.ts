// Course design. Three holes inspired by famous real-world holes:
// 1. TPC Sawgrass #17 (Island Green, par 3)
// 2. Pebble Beach #7 (Cliffside par 3)
// 3. St Andrews #17 (Road Hole, par 4)
//
// All three holes share the same 18x30 world grid so the camera /
// physics / world bounds stay constant across hole changes. Only the
// per-cell terrainAt function differs, plus the tee/hole positions.

export type Terrain = 'ocean' | 'rough' | 'fairway' | 'sand' | 'green';

export const TILE_PX = 32;
export const GRID_COLS = 18;
export const GRID_ROWS = 30;
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
    const TEE  = { col: 9, row: ROWS - 5 };
    const HOLE = { col: 9, row: 5 };
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

// Hole 2: Pebble Beach #7. Famous tiny green at the edge of the
// Pacific cliff, ringed by bunkers. Ocean wraps the right and back
// of the green so a fade or pulled shot dies on the rocks.
const pebble7: HoleSpec = (() => {
    const COLS = GRID_COLS;
    const ROWS = GRID_ROWS;
    const TEE  = { col: 5, row: ROWS - 4 };
    const HOLE = { col: 12, row: 6 };
    return {
        name: 'Cliff Top',
        inspiration: 'Pebble Beach #7',
        par: 3,
        gridCols: COLS, gridRows: ROWS,
        teeVertex: TEE, holeVertex: HOLE,
        terrainAt(col: number, row: number): Terrain {
            // Ocean along the right edge plus behind/above the green.
            if (col >= 16) return 'ocean';
            if (row <= 2) return 'ocean';
            if (col >= 14 && row <= 4) return 'ocean';

            // Tiny putting green near the cliff.
            const gDx = col - HOLE.col;
            const gDy = row - HOLE.row;
            if (Math.hypot(gDx / 1.0, gDy / 0.8) < 1.5) return 'green';

            // Three bunkers ring the green (front, right, back).
            if (Math.hypot((col - 11) / 0.8, (row - 9) / 0.6)  < 1.1) return 'sand';
            if (Math.hypot((col - 14) / 0.6, (row - 7) / 0.7)  < 1.1) return 'sand';
            if (Math.hypot((col - 11) / 0.8, (row - 4) / 0.5)  < 1.0) return 'sand';

            // Fairway corridor: gentle curve from tee (lower-left) toward
            // the green (upper-mid). Width 2.5 cells.
            const tNorm = Math.max(0, Math.min(1, (ROWS - row) / (ROWS - HOLE.row)));
            const fairwayCol = TEE.col + (HOLE.col - TEE.col) * tNorm;
            if (Math.abs(col - fairwayCol) < 2.5 && row > HOLE.row + 2 && row < ROWS - 1) return 'fairway';

            // Tee box.
            const tDx = col - TEE.col;
            const tDy = row - TEE.row;
            if (Math.hypot(tDx / 1.6, tDy / 1.0) < 2.2) return 'rough';

            // Default land is rough until we hit ocean on the right.
            if (col < 14) return 'rough';
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
    const TEE  = { col: 3, row: ROWS - 3 };
    const HOLE = { col: 14, row: 4 };
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
            if (Math.hypot((col - 12) / 0.85, (row - 6) / 0.6) < 1.2) return 'sand';

            // Dogleg fairway: bottom half goes up, then bends right.
            const tNorm = Math.max(0, Math.min(1, (ROWS - row) / (ROWS - HOLE.row - 2)));
            const centerCol = tNorm < 0.5
                ? TEE.col
                : TEE.col + (HOLE.col - TEE.col) * ((tNorm - 0.5) / 0.5);
            if (Math.abs(col - centerCol) < 2.2 && row > HOLE.row + 2 && row < ROWS - 1) return 'fairway';

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

/** Tree positions: line the back/sides of rough cells that border ocean
 *  (shorelines of islands). On inland holes with no ocean this yields
 *  zero trees, which is the right look for St Andrews / parkland. */
export function generateTreePositions(grid: TerrainGrid): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const corners = cornerPattern(grid, col, row);
            const here = grid[row][col];
            if (here !== 'rough') continue;
            const hasOcean = anyIs(corners, 'ocean');
            if (!hasOcean) continue;
            const seed = (col * 73 + row * 191) % 100;
            if (seed > 25) continue;
            const jx = ((seed * 13) % 9) - 4;
            const jy = ((seed * 7)  % 9) - 4;
            out.push({
                x: col * TILE_PX + TILE_PX / 2 + jx,
                y: row * TILE_PX + TILE_PX / 2 + jy,
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
