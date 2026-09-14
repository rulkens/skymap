/**
 * The wrapper's load-bearing behaviours: a covered box comes out wearing the
 * reference band's colour rather than the primary's own; the correction lands
 * REGISTERED, so a known step edge in the reference reappears at a known
 * output pixel; coverage boxes sharing a canvas tile correct continuously
 * across it; and a box the primary declines is declined without reading the
 * reference or building a field — `bakeDeepestLevel` probes ~33.5M boxes,
 * nearly all of them declines.
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

/** One canvas pixel in degrees: the canvas is level 8 (reference maxLevel + 1),
 *  256 tiles of 512 px around the globe, so 360/256 = 1.40625° per tile. */
const CANVAS_PX_DEG = 1.40625 / TILE_PX;

/** Three canvas pixels — a step's ramp then resolves well inside a probe box a
 *  few dozen canvas pixels wide, and the blur stays cheap. */
const FINE_SIGMA_DEG = 3 * CANVAS_PX_DEG;

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

/** A source whose raster varies across the box. `sample` is evaluated at each
 *  pixel's CENTRE, row 0 north — the grid every real source resamples onto,
 *  and the one the wrapper's registration has to agree with. */
function perPixelSource(opts: {
  id: string;
  maxLevel: number;
  coverage: readonly LonLatBounds[];
  sample: (lon: number, lat: number) => readonly [number, number, number, number];
}): EarthImagerySource {
  return {
    id: opts.id,
    attribution: `${opts.id} attribution`,
    maxLevel: opts.maxLevel,
    coverage: opts.coverage,
    provenance: { sourceId: opts.id, attribution: `${opts.id} attribution`, vintage: '2026' },
    readBox: vi.fn(async (box: LonLatBounds, widthPx: number, heightPx: number) => {
      if (!opts.coverage.some((c) => intersects(c, box))) return null;
      const out = new Uint8Array(widthPx * heightPx * 4);
      for (let py = 0; py < heightPx; py++) {
        const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
        for (let px = 0; px < widthPx; px++) {
          const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
          out.set(opts.sample(lon, lat), (py * widthPx + px) * 4);
        }
      }
      return out;
    }),
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

function referenceSource(): EarthImagerySource {
  return stubSource({
    id: 'reference',
    maxLevel: REFERENCE_LEVEL,
    coverage: [WHOLE_GLOBE],
    rgb: BRIGHT,
  });
}

// Level-13 tiles 3999 and 4000 straddle the level-8 canvas tile boundary at
// -4.21875°, and tiles 1698/1699 put the covered rows symmetrically around
// canvas row 48 of tile y=53. Both step edges below therefore sit at the
// CENTRE of the covered support, where the normalised blur's answer is the
// midpoint of the two reference levels exactly.
const STEP_COVERAGE = tileBox(PRIMARY_LEVEL, 3999, 1698, 2, 2);
const STEP_LON = 125 * 1.40625 - 180;
const STEP_LAT = 90 - 53 * 1.40625 - 48 * CANVAS_PX_DEG;

/** Probe box half-width, in canvas pixels, and its pixel count: 4 output
 *  pixels per canvas pixel, so a half-canvas-pixel registration slip moves a
 *  crossing by 2. */
const PROBE_HALF_CANVAS_PX = 32;
const PROBE_PX = 256;

function probeBox(centreLon: number, centreLat: number): LonLatBounds {
  const half = PROBE_HALF_CANVAS_PX * CANVAS_PX_DEG;
  return {
    west: centreLon - half,
    east: centreLon + half,
    north: centreLat + half,
    south: centreLat - half,
  };
}

/** First index along the probe's centre row (`x`) or column (`y`) at which
 *  `channel` reaches `midpoint`. The corrected ramp is monotone through the
 *  step, so this is where the correction placed the reference's edge. */
function firstCrossing(
  rgba: Uint8Array,
  channel: number,
  midpoint: number,
  along: 'x' | 'y',
): number {
  for (let i = 0; i < PROBE_PX; i++) {
    const pixel = along === 'x' ? (PROBE_PX / 2) * PROBE_PX + i : i * PROBE_PX + PROBE_PX / 2;
    if (rgba[pixel * 4 + channel]! >= midpoint) return i;
  }
  return -1;
}

describe('colourMatchedImagerySource', () => {
  it('moves the primary toward the reference band colour', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      rgb: DARK,
    });
    const reference = referenceSource();

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

  it('places a stepped reference edge at the output pixel it falls on', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [STEP_COVERAGE],
      rgb: DARK,
    });
    // Channel 0 steps in longitude, channel 1 in latitude, so one field build
    // answers both axes independently.
    const reference = perPixelSource({
      id: 'reference',
      maxLevel: REFERENCE_LEVEL,
      coverage: [WHOLE_GLOBE],
      sample: (lon, lat) => [
        lon < STEP_LON ? DARK[0] : BRIGHT[0],
        lat > STEP_LAT ? DARK[1] : BRIGHT[1],
        DARK[2],
        255,
      ],
    });

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: FINE_SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    const rgba = await matched.readBox(probeBox(STEP_LON, STEP_LAT), PROBE_PX, PROBE_PX);
    expect(rgba).not.toBeNull();

    const crossX = firstCrossing(rgba!, 0, (DARK[0] + BRIGHT[0]) / 2, 'x');
    expect(crossX).toBeGreaterThan(PROBE_PX / 2 - 2);
    expect(crossX).toBeLessThan(PROBE_PX / 2 + 2);

    const crossY = firstCrossing(rgba!, 1, (DARK[1] + BRIGHT[1]) / 2, 'y');
    expect(crossY).toBeGreaterThan(PROBE_PX / 2 - 2);
    expect(crossY).toBeLessThan(PROBE_PX / 2 + 2);
  });

  it("leaves the primary raster's transparent pixels alone", async () => {
    // The primary's no-data edge runs down the middle of the probe tile; both
    // sides are within reach of the same offset, so only the alpha guard can
    // keep the transparent half at the raw colour.
    const edgeLon =
      tileBox(PRIMARY_LEVEL, 4001, 1001, 1, 1).west + 0.5 * (360 / 2 ** PRIMARY_LEVEL);
    const primary = perPixelSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      sample: (lon) => [...DARK, lon < edgeLon ? 0 : 255],
    });
    const reference = referenceSource();

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: FINE_SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    const rgba = await matched.readBox(tileBox(PRIMARY_LEVEL, 4001, 1001, 1, 1), TILE_PX, TILE_PX);
    const transparent = (256 * TILE_PX + 100) * 4;
    const opaque = (256 * TILE_PX + 400) * 4;

    expect([...rgba!.slice(transparent, transparent + 4)]).toEqual([...DARK, 0]);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(rgba![opaque + c]! - BRIGHT[c]!)).toBeLessThanOrEqual(2);
    }
  });

  it('corrects continuously across two coverage boxes that share a canvas tile', async () => {
    // Coverage stops at -4.21875° and resumes there: one box lands in canvas
    // tile 124, the other in 125. A field per box measures the ramp over a
    // different half of the boundary each side, which shows up as a step.
    const west = tileBox(PRIMARY_LEVEL, 3998, 1698, 2, 2);
    const east = tileBox(PRIMARY_LEVEL, 4000, 1698, 2, 2);
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [west, east],
      rgb: DARK,
    });
    // 3 levels per canvas pixel: a seam from split fields is ~16 levels, while
    // the true ramp moves <1 level between the two probe pixels compared.
    const reference = perPixelSource({
      id: 'reference',
      maxLevel: REFERENCE_LEVEL,
      coverage: [WHOLE_GLOBE],
      sample: (lon) => {
        const v = 128 + 3 * ((lon - STEP_LON) / CANVAS_PX_DEG);
        const level = Math.max(0, Math.min(255, Math.round(v)));
        return [level, level, level, 255];
      },
    });

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: FINE_SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    const span = 8 * CANVAS_PX_DEG;
    const rows = { north: STEP_LAT + span / 2, south: STEP_LAT - span / 2 };
    const left = await matched.readBox({ west: STEP_LON - span, east: STEP_LON, ...rows }, 64, 8);
    const right = await matched.readBox({ west: STEP_LON, east: STEP_LON + span, ...rows }, 64, 8);

    const lastOfLeft = (4 * 64 + 63) * 4;
    const firstOfRight = 4 * 64 * 4;
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(left![lastOfLeft + c]! - right![firstOfRight + c]!)).toBeLessThanOrEqual(1);
    }
  });

  it('refuses a primary too deep for the canvas to sample', () => {
    const primary = stubSource({
      id: 'geodanmark',
      maxLevel: 19,
      coverage: [COVERAGE],
      rgb: DARK,
    });

    expect(() =>
      colourMatchedImagerySource(primary, referenceSource(), {
        sigmaDeg: SIGMA_DEG,
        waterMaskPath: 'never-read.png',
      }),
    ).toThrow(/canvas pixel/);
  });

  it('declines where the primary declines, without reading the reference', async () => {
    const primary = stubSource({
      id: 'primary',
      maxLevel: PRIMARY_LEVEL,
      coverage: [COVERAGE],
      rgb: DARK,
    });
    const reference = referenceSource();

    const matched = colourMatchedImagerySource(primary, reference, {
      sigmaDeg: SIGMA_DEG,
      waterMaskPath: await allLandMaskPath(),
    });

    const rgba = await matched.readBox(tileBox(PRIMARY_LEVEL, 10, 10, 1, 1), TILE_PX, TILE_PX);

    expect(rgba).toBeNull();
    expect(reference.readBox).not.toHaveBeenCalled();
  });
});
