/**
 * buildThumbTile — the shared non-deprojected thumb generator.
 *
 * Both the curator export (per-galaxy Commit) and the bulk backfill build the
 * InfoCard tile the same way: extract the natural-inclination crop from a
 * source image, StarNet it, stamp luminance-as-alpha, and downsize to a
 * square-bounded WebP.  This pins the geometry contract — a non-square
 * extraction crop yields a non-square (foreshortened) tile, never a square
 * one (which would mean we accidentally shipped deprojected pixels).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildThumbTile } from '../../../tools/famous/buildThumbTile';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'build-thumb-'));
}

async function writeSourcePng(path: string, w: number, h: number): Promise<void> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 90, g: 110, b: 70, alpha: 255 } },
  })
    .png()
    .toBuffer();
  writeFileSync(path, buf);
}

describe('buildThumbTile', () => {
  it('produces a foreshortened (non-square) WebP for a non-square crop', async () => {
    const dir = tmpDir();
    const sourcePath = join(dir, 'source.png');
    await writeSourcePng(sourcePath, 600, 600);

    const out = await buildThumbTile({
      sourcePath,
      // 2:1 natural crop (the pre-deproject framing) → must stay 2:1.
      extractionCrop: { x: 100, y: 200, width: 400, height: 200, rotationDeg: 0 },
      starnet: { stride: 16, upsample: false },
      alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
      starnetConfig: { mock: true },
      workDir: dir,
    });

    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width!).toBeGreaterThan(meta.height!);
  });
});
