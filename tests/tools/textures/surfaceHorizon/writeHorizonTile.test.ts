import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HORIZON_TILE_PX } from '../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import { readHorizonTileFile } from '../../../../tools/textures/surfaceHorizon/utils/readHorizonTileFile';
import { writeHorizonTile } from '../../../../tools/textures/surfaceHorizon/utils/writeHorizonTile';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('writeHorizonTile', () => {
  it('a flat tile is a zero-byte file and reads back flat', async () => {
    dir = mkdtempSync(join(tmpdir(), 'horizon-'));
    const path = join(dir, '3', '1', '0.webp');
    await writeHorizonTile(path, { kind: 'flat' });
    expect(statSync(path).size).toBe(0);
    expect(await readHorizonTileFile(path)).toEqual({ kind: 'flat' });
    expect(await readHorizonTileFile(join(dir, 'absent.webp'))).toBeNull();
  });

  it('an image round-trips byte for byte, including colour under alpha 0', async () => {
    dir = mkdtempSync(join(tmpdir(), 'horizon-'));
    const rgba = new Uint8Array(HORIZON_TILE_PX * HORIZON_TILE_PX * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7) % 251;
    // A lit sector is byte 0 in channel A, which libwebp would otherwise zero the RGB under.
    for (let p = 0; p < HORIZON_TILE_PX * HORIZON_TILE_PX; p += 3) rgba[p * 4 + 3] = 0;
    const path = join(dir, 'tile.webp');
    await writeHorizonTile(path, { kind: 'image', rgba });
    const back = await readHorizonTileFile(path);
    expect(back?.kind).toBe('image');
    expect(back?.kind === 'image' && Buffer.compare(back.rgba, rgba)).toBe(0);
  });
});
