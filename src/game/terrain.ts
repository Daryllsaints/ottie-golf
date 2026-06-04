// Terrain layout for Hole 1. The world is wider than the prior
// version with more land + less ocean, and a properly-shaped fairway
// running vertically with a clean rough border.

export type Terrain = 'ocean' | 'rough' | 'fairway' | 'sand' | 'green';

export const TILE_PX = 32;
export const GRID_COLS = 30;
export const GRID_ROWS = 80;
export const WORLD_W = GRID_COLS * TILE_PX;   // 960
export const WORLD_H = GRID_ROWS * TILE_PX;   // 2560

// Approximate visual scale: ~6.4 pixels per yard, so a 2048px tee-to-pin
// distance reads as ~320 yds. Tuned by feel against the reference PPG par-4 screenshots.
export const PX_PER_YARD = 6.4;

export const TEE_VERTEX  = { col: 15, row: GRID_ROWS - 8 };
export const HOLE_VERTEX = { col: 16, row: 8 };

export function vertexToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_PX, y: row * TILE_PX };
}

export const TEE_WORLD  = vertexToWorld(TEE_VERTEX.col,  TEE_VERTEX.row);
export const HOLE_WORLD = vertexToWorld(HOLE_VERTEX.col, HOLE_VERTEX.row);

// Terrain rules:
//   Ocean: outside the rough silhouette
//   Rough: thin band framing the fairway
//   Fairway: the main playable corridor (wide vertical band with slight S-curve)
//   Sand:  blob just left of the green approach
//   Green: oval around the cup
export function terrainAt(col: number, row: number): Terrain {
    // Sand bunker: blob to the left of the approach to the green
    const sandCenter = { col: 12, row: 14 };
    const distSand = Math.hypot((col - sandCenter.col) / 1.0, (row - sandCenter.row) / 0.8);
    if (distSand < 2.8) return 'sand';

    // Putting green: oval around the cup
    const distGreen = Math.hypot(
        (col - HOLE_VERTEX.col) / 1.0,
        (row - HOLE_VERTEX.row) / 1.2,
    );
    if (distGreen < 4.2) return 'green';

    // Fairway center column with a slight S-curve
    const fairwayCenter = 15 + Math.sin(row * 0.06) * 2.5;
    // Narrows near the green, widens at the tee box
    let fairwayHalf = 5.5;
    if (row < 18) fairwayHalf = 3.5;                 // narrow approach to green
    else if (row > GRID_ROWS - 12) fairwayHalf = 6.5; // wide tee box

    const fromCenter = Math.abs(col - fairwayCenter);
    if (fromCenter < fairwayHalf) return 'fairway';
    if (fromCenter < fairwayHalf + 2.5) return 'rough';
    return 'ocean';
}

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

/** True if all four corners share the same terrain type. */
export function allSame(corners: [Terrain, Terrain, Terrain, Terrain]): Terrain | null {
    const [a, b, c, d] = corners;
    return (a === b && b === c && c === d) ? a : null;
}

/** True if any corner is the given terrain type. */
export function anyIs(corners: [Terrain, Terrain, Terrain, Terrain], t: Terrain): boolean {
    return corners[0] === t || corners[1] === t || corners[2] === t || corners[3] === t;
}

/** Tree decoration positions — sit just inside the ocean side of the
 *  rough/ocean boundary so they form a clean treeline framing the
 *  course without invading the fairway. Deterministic so the line
 *  doesn't reshuffle on rerender. */
export function generateTreePositions(grid: TerrainGrid): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const corners = cornerPattern(grid, col, row);
            const hasOcean = anyIs(corners, 'ocean');
            const hasGround = anyIs(corners, 'rough') || anyIs(corners, 'fairway');
            if (!hasOcean || !hasGround) continue;
            // Tree only if THIS cell is itself ocean-ish (sits on the water side of the boundary).
            const here = grid[row][col];
            if (here !== 'ocean') continue;
            const seed = (col * 73 + row * 191) % 100;
            if (seed > 38) continue; // ~38% density along the shore
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
