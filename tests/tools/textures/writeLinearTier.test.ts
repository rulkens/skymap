/**
 * Property test for the linear lossless-WebP build primitive.
 *
 * The whole reason `writeLinearTier` exists apart from the sRGB `writeBodyTier`
 * path is that a linear-packed map's bytes must survive the write UNCHANGED — a
 * sneaky `.toColourspace('srgb')` / `.gamma()` would bend a roughness of 0.5 off
 * its value and no pure-helper test would catch it (the transform lives inside
 * sharp). So this drives sharp end-to-end over a tiny known linear RGBA buffer,
 * writes at the same width (an identity resize), reads the WebP back to raw, and
 * asserts byte equality. Lossless WebP is per-pixel exact for the RGB wherever
 * alpha is non-zero (both test pixels are), so a gamma/sRGB transform — or a
 * regression to a lossy encoder — slipping into the pipeline flips this red.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { writeLinearTier } from '../../../tools/textures/writeLinearTier';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'writeLinearTier-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('round-trips raw pixel values unchanged (no sRGB gamma applied)', async () => {
  // A 2×1 RGBA buffer of mid-range values — exactly the band a gamma curve would
  // move most. If any sRGB transform sneaks in, these come back different.
  const width = 2;
  const height = 1;
  const data = Buffer.from([
    10,
    128,
    200,
    255, //
    64,
    32,
    96,
    128,
  ]);
  const outPath = join(dir, 'linear-2.webp');

  await writeLinearTier({ data, info: { width, height, channels: 4 } }, width, outPath);

  const back = await sharp(outPath).raw().toBuffer({ resolveWithObject: true });
  expect(back.info.width).toBe(width);
  expect(back.info.height).toBe(height);
  expect(back.info.channels).toBe(4);
  expect(Uint8Array.from(back.data)).toEqual(Uint8Array.from(data));
});
