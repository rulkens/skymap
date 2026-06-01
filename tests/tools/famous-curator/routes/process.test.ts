/**
 * /api/process — crop + StarNet + alpha integration test.
 *
 * Drives the real handler with MOCK_STARNET so the spawn is a copy.
 * Verifies all three output files exist + the alpha preview's pixel
 * data shows the luminance pass actually ran (e.g. corner pixels are
 * transparent).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { handleProcess } from '../../../../tools/famous-curator/plugin/routes/process';

async function seedSession(): Promise<{ tmpId: string; dir: string }> {
  // 128×128 PNG with a bright disc in the middle so alpha-pass output
  // has visible structure — the background (r=0,g=0,b=0) will be
  // transparent after applyLuminanceAsAlpha; the white centre disc will
  // be opaque.
  const base = mkdtempSync(join(tmpdir(), 'curator-proc-test-'));
  const tmpId = 'sess';
  const fullDir = join(base, tmpId);
  mkdirSync(fullDir, { recursive: true });
  const png = await sharp({
    create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([{
      input: await sharp({
        create: { width: 64, height: 64, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer(),
      top: 32, left: 32,
    }])
    .png().toBuffer();
  writeFileSync(join(fullDir, 'source.png'), png);
  return { tmpId, dir: fullDir };
}

describe('handleProcess', () => {
  it('writes starless + alpha previews and returns their URLs', async () => {
    const sess = await seedSession();
    // Patch sessionPath to point at our test root.  Easiest: pass a
    // custom sessionDirOverride into the handler.
    const result = await handleProcess({
      body: {
        tmpId: sess.tmpId,
        crop: { x: 16, y: 16, width: 96, height: 96, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sess.dir,
    });
    // URLs include a ?v=<timestamp> cache-buster so re-Processing the
    // same session re-fetches the rewritten previews instead of serving
    // a stale cached image.
    expect(result.starlessPreviewUrl).toMatch(/^\/api\/preview\/sess\/starless\.webp\?v=\d+$/);
    expect(result.alphaPreviewUrl).toMatch(/^\/api\/preview\/sess\/alpha\.webp\?v=\d+$/);
    expect(existsSync(join(sess.dir, 'starless.png'))).toBe(true);
    expect(existsSync(join(sess.dir, 'starless.webp'))).toBe(true);
    expect(existsSync(join(sess.dir, 'alpha.webp'))).toBe(true);
  });

  it('alpha output has transparent corners (luminance pass ran)', async () => {
    const sess = await seedSession();
    await handleProcess({
      body: {
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 128, height: 128, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sess.dir,
    });
    // Decode the alpha WebP back to raw RGBA to inspect pixel values.
    // The top-left corner of the source is black (luma≈0), so after the
    // luminance pass alpha should be 0 there.  The centre is white
    // (luma≈240), so alpha should be well above 0 there.
    const alphaPng = await sharp(readFileSync(join(sess.dir, 'alpha.webp')))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = alphaPng.info.width;
    const cornerIdx = 0; // top-left pixel
    expect(alphaPng.data[cornerIdx * 4 + 3]!).toBe(0);
    const centerIdx = Math.floor(w / 2) * w + Math.floor(w / 2);
    expect(alphaPng.data[centerIdx * 4 + 3]!).toBeGreaterThan(0);
  });
});
