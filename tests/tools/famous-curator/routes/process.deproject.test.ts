/**
 * /api/process — deprojection integration tests.
 *
 * Mirrors the assertion style from export.deproject.test.ts: decode the
 * output with sharp and compare dimensions.
 *
 * The process route writes starless.webp at PREVIEW_PX (512) with
 * fit:'inside', but the deprojection happens on the pre-resize cropped
 * buffer.  cropped.png is written at full resolution before the StarNet
 * step, so it reflects the deprojection geometry without the fixed-size
 * resize masking the difference.  We assert on cropped.png dimensions.
 *
 * Frame note: rotationDeg=0 throughout, so effectivePaDeg = disk.paDeg.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { handleProcess } from '../../../../tools/famous-curator/plugin/routes/process';
import type { RecipeDisk } from '../../../../tools/famous-curator/plugin/recipe';

async function seedSession(prefix: string): Promise<{ tmpId: string; dir: string }> {
  // 128×128 RGBA PNG — same dimensions used by the export deproject tests so
  // the affine stretch produces a measurably different canvas size.
  const base = mkdtempSync(join(tmpdir(), `curator-proc-deproject-${prefix}-`));
  const tmpId = 'dp-proc';
  const dir = join(base, tmpId);
  mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 100, g: 120, b: 80, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
  writeFileSync(join(dir, 'source.png'), png);
  return { tmpId, dir };
}

/** Decode cropped.png from the session dir and return its dimensions. */
async function croppedDims(dir: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(readFileSync(join(dir, 'cropped.png'))).metadata();
  return { width: meta.width!, height: meta.height! };
}

const CROP = { x: 32, y: 32, width: 64, height: 64, rotationDeg: 0 };

describe('handleProcess — deprojection', () => {
  it('deprojected cropped.png is square', async () => {
    // paDeg=0 → major axis vertical; deprojectDisk stretches image-Y by 1/0.5=2×.
    // squareDeprojectCrop snaps the 64×64 crop to 64×32 (b/a) before extraction,
    // so the ×2 stretch returns cropped.png to an exact 64×64 square — the new
    // observable contract (deproject no longer grows a taller rectangle).
    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 0,
      axisRatio: 0.5, // above DEPROJECT_MIN_AXIS_RATIO (0.3) → should deproject
      deproject: true,
    };

    const sessOn = await seedSession('on');
    await handleProcess({
      body: {
        tmpId: sessOn.tmpId,
        crop: CROP,
        starnet: { stride: 64, upsample: false },
        alpha: { blackPoint: 5, whitePoint: 220, gamma: 0.8 },
        disk,
        catalogAxisRatio: 0.5,
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sessOn.dir,
    });
    const { width: onW, height: onH } = await croppedDims(sessOn.dir);

    expect(onW).toBe(onH);
  });

  it('processing without disk is unaffected by the new optional fields', async () => {
    // Ensures backward compatibility: omitting disk + catalogAxisRatio
    // still produces a valid result with no thrown errors.
    const sess = await seedSession('nodisk');
    const result = await handleProcess({
      body: {
        tmpId: sess.tmpId,
        crop: CROP,
        starnet: { stride: 64, upsample: false },
        alpha: { blackPoint: 5, whitePoint: 220, gamma: 0.8 },
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sess.dir,
    });
    expect(result.starlessPreviewUrl).toMatch(/starless\.webp/);
    const { width, height } = await croppedDims(sess.dir);
    // Without deproject the crop is exactly the requested width×height.
    expect(width).toBe(64);
    expect(height).toBe(64);
  });
});
