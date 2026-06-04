// Terrain types + procedural course layout for Hole 1.
//
// The world is a grid of vertices. Each vertex carries a terrain
// type. Each grid CELL renders by sampling the 4 surrounding vertices
// and looking up the right Wang tile per layer:
//   Layer 1 (ocean/grass): base. Renders for every cell.
//   Layer 2 (grass/sand):  on top of grass cells with sand corners.
//   Layer 3 (grass/green): on top of grass cells with green corners.
//
// Terrain at vertex (row=0, col=0) is top-left of the world.

export type Terrain = 'ocean' | 'grass' | 'sand' | 'green';

// World dimensions. ~640x2560 = par-4 scale, room to scroll vertically.
export const TILE_PX = 32;
export const GRID_COLS = 20;     // 640px wide
export const GRID_ROWS = 80;     // 2560px tall

export const WORLD_W = GRID_COLS * TILE_PX;
export const WORLD_H = GRID_ROWS * TILE_PX;

// Vertex grid is (GRID_COLS+1) x (GRID_ROWS+1). Tee at bottom, hole at top.
export const TEE_VERTEX  = { col: 10, row: GRID_ROWS - 6 };
export const HOLE_VERTEX = { col: 11, row: 10 };

// Convert a vertex grid coord to world pixels.
export function vertexToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_PX, y: row * TILE_PX };
}

export const TEE_WORLD  = vertexToWorld(TEE_VERTEX.col,  TEE_VERTEX.row);
export const HOLE_WORLD = vertexToWorld(HOLE_VERTEX.col, HOLE_VERTEX.row);

// Procedural terrain layout: fairway runs vertically with a slight
// curve, water (ocean) flanks both sides, putting green is a circular
// blob around the cup, sand bunker sits just left of the green.
export function terrainAt(col: number, row: number): Terrain {
    // Sand bunker: a circular blob to the left of and approaching the green.
    const sandCenter = { col: 7, row: 16 };
    const distSand = Math.hypot(col - sandCenter.col, row - sandCenter.row);
    if (distSand < 2.8) return 'sand';

    // Putting green: oval around the cup.
    const distGreen = Math.hypot(
        (col - HOLE_VERTEX.col) / 1.0,
        (row - HOLE_VERTEX.row) / 1.2,
    );
    if (distGreen < 4.0) return 'green';

    // Fairway: column band with a slight S-curve.
    const fairwayCenter = 10 + Math.sin(row * 0.07) * 2.5;
    // Narrow approaching the green, wide off the tee.
    let fairwayHalf = 4.5;
    if (row < 20) fairwayHalf = 3.0;          // near green
    else if (row > GRID_ROWS - 10) fairwayHalf = 5.5; // tee box

    if (Math.abs(col - fairwayCenter) < fairwayHalf) return 'grass';

    return 'ocean';
}

// Precomputed vertex grid for the entire world. Built once at boot
// so render calls are O(1) lookups.
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

// Vertex pattern at a CELL — encodes the 4 corner terrains as a string
// like 'grass,grass,sand,grass' so a tileset can be looked up by pattern.
export function cornerPattern(grid: TerrainGrid, cellCol: number, cellRow: number): [Terrain, Terrain, Terrain, Terrain] {
    const tl = grid[cellRow]   [cellCol];
    const tr = grid[cellRow]   [cellCol + 1];
    const br = grid[cellRow + 1][cellCol + 1];
    const bl = grid[cellRow + 1][cellCol];
    return [tl, tr, br, bl];
}

// Tree decorations — clustered along the rough edges to form a treeline.
// Returns world-space positions where a tree sprite should render.
export function generateTreePositions(grid: TerrainGrid): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    // For each cell, if it's GRASS but has at least one OCEAN neighbor
    // among its corners, drop a tree on the grass side with some
    // pseudo-random jitter so the treeline reads as natural.
    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const [tl, tr, br, bl] = cornerPattern(grid, col, row);
            const corners = [tl, tr, br, bl];
            const hasOcean = corners.includes('ocean');
            const hasGrass = corners.includes('grass');
            if (!hasOcean || !hasGrass) continue;
            // Deterministic pseudo-random so the treeline doesn't reshuffle.
            const seed = (col * 73 + row * 191) % 100;
            if (seed > 55) continue; // ~55% chance of a tree on the edge
            const jx = ((seed * 13) % 17) - 8;
            const jy = ((seed * 7)  % 17) - 8;
            out.push({
                x: col * TILE_PX + TILE_PX / 2 + jx,
                y: row * TILE_PX + TILE_PX / 2 + jy,
            });
        }
    }
    return out;
}
