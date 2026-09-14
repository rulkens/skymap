/**
 * The wrapper's two load-bearing behaviours: a covered box comes out wearing
 * the reference band's colour rather than the primary's own, and a box the
 * primary declines is declined without reading the reference or building a
 * field — `bakeDeepestLevel` probes ~33.5M boxes, nearly all of them declines.
 */

import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import type { EarthImagerySource } from '../../../tools/textures/EarthImagerySource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { colourMatchedImagerySource } from '../../../tools/textures/colourMatchedImagerySource';

const PRIMARY_LEVEL = 13;
const REFERENCE_LEVEL = 7;
const TILE_PX = 512;

const DARK = [40, 60, 50] as const;
const BRIGHT = [140, 160, 170] as const;

/** 2 km along a meridian — the shipped EOX figure, so the canvas geometry is
 *  exercised at the sigma the bake actually runs. */
const SIGMA_DEG = 0.018;

function tileBox(z: number, x: number, y: number, tilesX: number, tilesY: number): LonLatBounds {
  const step = 360 / 2 ** z;
  return {
    west: x * step - 180,
    east: (x + tilesX) * step - 180,
    north: 90 - y * step,
    south: 90 - (y + tilesY) * step,
  };
}

/** A 4x4 block of level-13 tiles at mid-latitude, wholly inside one level-8
 *  canvas tile, so the canvas has a covered patch with room around it. */
const COVERAGE = tileBox(PRIMARY_LEVEL, 4000, 1000, 4, 4);

function intersects(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}

function flatRaster(rgb: readonly [number, number, number], widthPx: number, heightPx: number) {
  const out = new Uint8Array(widthPx * heightPx * 4);
  for (let i = 0; i < widthPx * heightPx; i++) out.set([...rgb, 255], i * 4);
  return out;
}

function stubSource(opts: {
  id: string;
  maxLevel: number;
  coverage: readonly LonLatBounds[];
  rgb: readonly [number, number, number];
}): EarthImagerySource {
  return {
    id: opts.id,
    attribution: `${opts.id} attribution`,
    maxLevel: opts.maxLevel,
    coverage: opts.coverage,
    provenance: { sourceId: opts.id, attribution: `${opts.id} attribution`, vintage: '2026' },
    readBox: vi.fn(async (box: LonLatBounds, widthPx: number, heightPx: number) =>
      opts.coverage.some((c) => intersects(c, box))
        ? flatRaster(opts.rgb, widthPx, heightPx)
        : null,
    ),
  };
}

const WHOLE_GLOBE: LonLatBounds = { west: -180, east: 180, south: -90, north: 90 };

/** All-land mask: both classes resolve to the same offset, so these tests read
 *  the transfer itself rather than the land/water split (covered elsewhere). */
let maskPath: Promise<string> | undefined;
function allLandMaskPath(): Promise<string> {
  maskPath ??= (async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'colour-match-mask-')), 'mask.png');
    await sharp({ create: { width: 360, height: 180, channels: 3, background: '#fff' } })
      .greyscale()
      .png()
      .toFile(path);
    return path;
  })();
  return maskPath;
}

describe('colourMatchedImagerySource', () => {
  it('moves the primary toward the reference band colour', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      rgb: DARK,
    });
    const reference = stubSource({
      id: 'reference',
      maxLevel: REFERENCE_LEVEL,
      coverage: [WHOLE_GLOBE],
      rgb: BRIGHT,
    });

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    // A tile in the middle of the covered patch: the whole neighbourhood the
    // kernel sees is the same flat pair, so the offset is exactly the gap.
    const rgba = await matched.readBox(tileBox(PRIMARY_LEVEL, 4001, 1001, 1, 1), TILE_PX, TILE_PX);
    expect(rgba).not.toBeNull();

    const centre = (TILE_PX * (TILE_PX / 2) + TILE_PX / 2) * 4;
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(rgba![centre + c]! - BRIGHT[c]!)).toBeLessThanOrEqual(2);
    }
    expect(rgba![centre + 3]).toBe(255);
  });

  it('keeps identity fields and coverage from the primary', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      rgb: DARK,
    });
    const reference = stubSource({
      id: 'reference',
      maxLevel: REFERENCE_LEVEL,
      coverage: [WHOLE_GLOBE],
      rgb: BRIGHT,
    });

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    expect(matched.id).toBe(primary.id);
    expect(matched.maxLevel).toBe(PRIMARY_LEVEL);
    expect(matched.coverage).toEqual([COVERAGE]);
    expect(matched.provenance).toEqual(primary.provenance);
  });

  it('declines where the primary declines, without reading the reference', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      rgb: DARK,
    });
    const reference = stubSource({
      id: 'reference',
      maxLevel: REFERENCE_LEVEL,
      coverage: [WHOLE_GLOBE],
      rgb: BRIGHT,
    });

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    const rgba = await matched.readBox(tileBox(PRIMARY_LEVEL, 10, 10, 1, 1), TILE_PX, TILE_PX);

    expect(rgba).toBeNull();
    expect(reference.readBox).not.toHaveBeenCalled();
  });
});
