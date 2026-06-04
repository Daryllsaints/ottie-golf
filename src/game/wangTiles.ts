// Wang tileset loader + corner-pattern lookup. Each Pixellab Wang
// tileset is a 128x128 PNG with multiple 32x32 tiles; a JSON metadata
// file describes which 4-corner pattern each tile represents.
//
// We load each tileset once, register its tiles as Phaser texture
// frames, then look up the right frame per cell at render time by
// hashing the (NW, NE, SE, SW) terrain pattern.

import type { Scene } from 'phaser';

export type WangCorner = 'lower' | 'upper' | 'transition';

export type TileMeta = {
    id: string;
    corners: { NE: WangCorner; NW: WangCorner; SE: WangCorner; SW: WangCorner };
    bounding_box: { x: number; y: number; width: number; height: number };
};

export type TilesetMeta = {
    tile_size: { width: number; height: number };
    tileset_data: { tiles: TileMeta[] };
};

export type WangSet = {
    /** Phaser texture key for the spritesheet. */
    textureKey: string;
    /** Map from "NW,NE,SE,SW" pattern to a Phaser frame name. */
    patternToFrame: Map<string, string>;
    /** Fallback "all lower" frame name. */
    fallbackFrame: string;
};

/** Loads the JSON metadata + PNG spritesheet, then registers each
 *  tile as a Phaser texture frame so it can be rendered by name. */
export async function loadWangSet(
    scene: Scene,
    textureKey: string,
    pngUrl: string,
    jsonUrl: string,
): Promise<WangSet> {
    // Load the image into the texture cache if not already there.
    if (!scene.textures.exists(textureKey)) {
        await new Promise<void>((resolve, reject) => {
            scene.load.image(textureKey, pngUrl);
            scene.load.once('complete', () => resolve());
            scene.load.once('loaderror', reject);
            scene.load.start();
        });
    }

    const res = await fetch(jsonUrl);
    const meta = await res.json() as TilesetMeta;

    const patternToFrame = new Map<string, string>();
    let fallbackFrame = '';
    const tex = scene.textures.get(textureKey);

    // First pass: prefer non-transition tiles (cleaner matches).
    for (const tile of meta.tile_size ? meta.tileset_data.tiles : []) {
        const key = `${tile.corners.NW},${tile.corners.NE},${tile.corners.SE},${tile.corners.SW}`;
        const frameName = `f_${tile.id}`;
        tex.add(frameName, 0, tile.bounding_box.x, tile.bounding_box.y, tile.bounding_box.width, tile.bounding_box.height);
        if (!patternToFrame.has(key)) {
            patternToFrame.set(key, frameName);
        }
        if (tile.corners.NW === 'lower' && tile.corners.NE === 'lower' && tile.corners.SE === 'lower' && tile.corners.SW === 'lower') {
            fallbackFrame = frameName;
        }
    }

    return { textureKey, patternToFrame, fallbackFrame };
}

/** Maps a 4-corner pattern to lower/upper (treating transition as
 *  upper-adjacent). Returns the pattern string for lookup. */
export function patternKey(nw: 'lower' | 'upper', ne: 'lower' | 'upper', se: 'lower' | 'upper', sw: 'lower' | 'upper'): string {
    return `${nw},${ne},${se},${sw}`;
}

/** Find the best matching frame for a 4-corner pattern. Tries exact
 *  match first; if none found, falls back through transition variants
 *  by treating upper-corners as transition. */
export function pickFrame(set: WangSet, nw: 'lower' | 'upper', ne: 'lower' | 'upper', se: 'lower' | 'upper', sw: 'lower' | 'upper'): string {
    const key = patternKey(nw, ne, se, sw);
    const direct = set.patternToFrame.get(key);
    if (direct) return direct;

    // Pattern wasn't directly available — try a small set of fallbacks
    // by allowing transition substitutions for upper corners.
    const variants: WangCorner[][] = [
        [nw === 'upper' ? 'transition' : nw, ne, se, sw],
        [nw, ne === 'upper' ? 'transition' : ne, se, sw],
        [nw, ne, se === 'upper' ? 'transition' : se, sw],
        [nw, ne, se, sw === 'upper' ? 'transition' : sw],
    ];
    for (const v of variants) {
        const fb = set.patternToFrame.get(`${v[0]},${v[1]},${v[2]},${v[3]}`);
        if (fb) return fb;
    }
    return set.fallbackFrame;
}
