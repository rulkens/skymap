/**
 * Regression test for the grayscale-tint build path (Europa / Callisto).
 *
 * The bug this pins is a libvips operation-ordering constraint that ONLY
 * manifests inside sharp: a single-pipeline `linear` with three coefficients on
 * a still-mono image throws 'Band expansion using linear is unsupported',
 * because `linear` runs before the band expansion that `toColourspace('srgb')`
 * implies for a 1-band source. No pure-helper test can catch this — the failure
 * lives in sharp's internal op order — so this test deliberately drives sharp
 * end-to-end over a synthesized 1-band grayscale TIFF and asserts (a) the build's
 * actual tint path does not throw and (b) the output channel means reflect the
 * per-channel tint multiply. The image is tiny (16×8) so the round-trip is fast.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { writeTintedMonoTier } from '../../../tools/textures/buildTextures';

let dir: string;
let srcPath: string;
const GRAY = 200;
const TINT: readonly [number, number, number] = [1.0, 0.95, 0.8];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tinted-mono-'));
  srcPath = join(dir, 'mono.tif');
  // A uniform 1-band grayscale TIFF — the exact shape of a USGS Europa/Callisto
  // mosaic that triggered the band-expansion crash.
  await sharp({
    create: { width: 16, height: 8, channels: 3, background: { r: GRAY, g: GRAY, b: GRAY } },
  })
    .toColourspace('b-w')
    .tiff()
    .toFile(srcPath);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('tints a 1-band mono source without throwing and applies the per-channel multiply', async () => {
  const outPath = join(dir, 'mono-8.jpg');

  await expect(writeTintedMonoTier(srcPath, [...TINT], 8, outPath)).resolves.toBeUndefined();

  const means = (await sharp(outPath).stats()).channels.map((ch) => ch.mean);
  // Per-channel multiply of gray 200: R·1.0=200, G·0.95=190, B·0.8=160.
  // ±2 absorbs JPEG round-trip loss.
  expect(means).toHaveLength(3);
  expect(means[0]).toBeGreaterThan(GRAY * TINT[0] - 2);
  expect(means[0]).toBeLessThan(GRAY * TINT[0] + 2);
  expect(means[1]).toBeGreaterThan(GRAY * TINT[1] - 2);
  expect(means[1]).toBeLessThan(GRAY * TINT[1] + 2);
  expect(means[2]).toBeGreaterThan(GRAY * TINT[2] - 2);
  expect(means[2]).toBeLessThan(GRAY * TINT[2] + 2);
});
