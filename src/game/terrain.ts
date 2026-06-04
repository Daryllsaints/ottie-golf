// Course design — Hole 1 inspired by TPC Sawgrass #17 "Island Green".
// Par 3, ~150 yards, tee on a small land pad, green sits as an island
// in the middle of a lake, bunker hugs the front-right of the green.
// All-or-nothing: miss the green and you're swimming.
//
// Future holes (scaffolded as separate entries) will draw from Pebble
// Beach #7 (cliffside par-3) and St Andrews #17 Road Hole (dogleg par-4).

export type Terrain = 'ocean' | 'rough' | 'fairway' | 'sand' | 'green';

export const TILE_PX = 32;

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

// Sawgrass #17 — Island Green. Par 3, ~150 yds.
const sawgrass17: HoleSpec = (() => {
    const COLS = 25;
    const ROWS = 50;
    const TEE  = { col: 12, row: ROWS - 5 };
    const HOLE = { col: 12, row: 8 };
    return {
        name: 'The Island',
        inspiration: 'TPC Sawgrass #17',
        par: 3,
        gridCols: COLS, gridRows: ROWS,
        teeVertex: TEE, holeVertex: HOLE,
        terrainAt(col: number, row: number): Terrain {
            // Tee box: small rough island at the south. Slight pad +
            // wraparound to give it shape.
            const teeDx = col - TEE.col;
            const teeDy = row - TEE.row;
            const distTee = Math.hypot(teeDx / 1.2, teeDy / 0.9);
            if (distTee < 3.5) return 'rough';
            if (distTee < 4.3) return 'rough';

            // Green island: oval around the cup. Wider than tall, classic Sawgrass shape.
            const greenDx = col - HOLE.col;
            const greenDy = row - HOLE.row;
            const distGreen = Math.hypot(greenDx / 1.2, greenDy / 1.0);
            if (distGreen < 3.0) return 'green';

            // Rough fringe around the green (the island's "lip" before water).
            if (distGreen < 4.0) return 'rough';

            // Sand bunker bites into the front-right of the green.
            const sandDx = col - (HOLE.col + 2.4);
            const sandDy = row - (HOLE.row + 2.4);
            const distSand = Math.hypot(sandDx / 1.0, sandDy / 0.7);
            if (distSand < 1.6) return 'sand';

            return 'ocean';
        },
    };
})();

// (Stubs for future holes — terrainAt unimplemented so they won't ship yet.)
// Pebble Beach #7 — cliffside par-3, ~106 yds, ocean along the right.
// St Andrews #17 Road Hole — par-4 dogleg right, Hell Bunker, ~380 yds.

export const HOLES: HoleSpec[] = [
    sawgrass17,
];

// ─── Currently active hole exports ────────────────────────────────

export const ACTIVE_HOLE = HOLES[0];

export const GRID_COLS = ACTIVE_HOLE.gridCols;
export const GRID_ROWS = ACTIVE_HOLE.gridRows;
export const WORLD_W = GRID_COLS * TILE_PX;
export const WORLD_H = GRID_ROWS * TILE_PX;
export const PX_PER_YARD = 6.4;

export const TEE_VERTEX  = ACTIVE_HOLE.teeVertex;
export const HOLE_VERTEX = ACTIVE_HOLE.holeVertex;

export function vertexToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_PX, y: row * TILE_PX };
}

export const TEE_WORLD  = vertexToWorld(TEE_VERTEX.col,  TEE_VERTEX.row);
export const HOLE_WORLD = vertexToWorld(HOLE_VERTEX.col, HOLE_VERTEX.row);

export const terrainAt = ACTIVE_HOLE.terrainAt;

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

/** Tree positions: line the back/sides of the green island and the
 *  tee island. Not in water (visually weird). */
export function generateTreePositions(grid: TerrainGrid): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const corners = cornerPattern(grid, col, row);
            // Only place a tree if this cell is rough/grass-ish AND has at
            // least one ocean corner (i.e., it sits on the shore of an island).
            const here = grid[row][col];
            if (here !== 'rough') continue;
            const hasOcean = anyIs(corners, 'ocean');
            if (!hasOcean) continue;
            const seed = (col * 73 + row * 191) % 100;
            if (seed > 25) continue; // sparser tree placement on small islands
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
    // Sample all 4 corner vertices of this cell. If ANY is ocean, treat as water.
    // (Lets the ball stay alive if it's hugging a shore.)
    // Actually for hazard rules we want STRICT: all 4 corners ocean = definitively water.
    const corners = cornerPattern(grid, col, row);
    return corners.every(c => c === 'ocean');
}
