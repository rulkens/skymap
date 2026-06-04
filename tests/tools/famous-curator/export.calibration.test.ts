/**
 * handleExport — calibration derivation tests.
 *
 * Verifies that ExportResult includes a derived FamousCalibration when a disk
 * is present, and is absent when no disk is supplied.
 *
 * The calibration is derived in the route after the deproject decision is made,
 * using deriveFamousCalibration.  These tests assert on the returned ExportResult
 * directly — no file I/O assertions needed for this contract.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../tools/famous-curator/plugin/routes/export';
import type { RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';
import { deriveFamousCalibration } from '../../../tools/famous/deriveFamousCalibration';
import { squareDeprojectCrop } from '../../../tools/famous/squareDeprojectCrop';
import type { FamousCalibration } from '../../../src/@types/loading/FamousCalibration';

/** Minimal session dir with the source.png + cropped.png + starless.png trio. */
async function seedSession(prefix: string): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), `curator-calibration-${prefix}-`));
  const tmpId = 'cal';
  const dir = join(root, tmpId);
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
  writeFileSync(join(dir, 'cropped.png'), png);
  writeFileSync(join(dir, 'starless.png'), png);
  return { tmpId, sessionDir: dir };
}

/** Minimal fake repoRoot with directories handleExport expects. */
function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-calibration-repo-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

/**
 * Centred 64×64 crop, no rotation — keeps effectivePaDeg = disk.paDeg
 * and makes the expected calibration easy to reason about.
 */
const CROP = { x: 32, y: 32, width: 64, height: 64, rotationDeg: 0 };

function baseBody(tmpId: string) {
  return {
    id: 'ngc-calibration',
    tmpId,
    crop: CROP,
    starnet: { stride: 64, upsample: false },
    alpha: { blackPoint: 5, whitePoint: 220, gamma: 0.8 },
    metadata: {
      sourceUrl: 'https://example.com/ngc-calibration',
      license: 'CC-BY-4.0',
      author: 'Tester',
    },
  } as const;
}

describe('handleExport — calibration derivation', () => {
  it('returns derived calibration for a disk', async () => {
    const sess = await seedSession('disk');
    const repo = fakeRepoRoot();

    // axisRatio=0.5, deproject=true → willDeproject(0.5) is true → deprojected=true.
    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 45,
      axisRatio: 0.5,
      deproject: true,
    };
    const catalogAxisRatio = 0.6;

    const result = await handleExport({
      body: { ...baseBody(sess.tmpId), disk, catalogAxisRatio },
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    // deprojected=true because wantsDeproject && axisRatio=0.5 >= 0.3 && < 1.
    // The route derives calibration from the NORMALISED (square-deproject) crop,
    // not body.crop — so the expectation must use the same normalised crop or
    // the PA frames won't match (effectivePaDeg collapses to 0 once snapped).
    const deprojected = true;
    const effectiveAxisRatio = disk.axisRatio ?? catalogAxisRatio;
    const expected: FamousCalibration = deriveFamousCalibration({
      disk,
      crop: squareDeprojectCrop(CROP, disk, effectiveAxisRatio),
      catalogAxisRatio,
      deprojected,
    });

    expect(result.calibration).toBeDefined();
    expect(result.calibration).toEqual(expected);
  });

  it('returns no calibration without a disk', async () => {
    const sess = await seedSession('nodisk');
    const repo = fakeRepoRoot();

    const result = await handleExport({
      body: baseBody(sess.tmpId),
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    expect(result.calibration).toBeUndefined();
  });
});
