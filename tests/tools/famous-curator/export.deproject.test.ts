/**
 * handleExport — deproject-frame tests.
 *
 * Frame note: `cropped.png` and `starless.png` in the session dir are produced
 * by `handleProcess`, which deprojects the crop to face-on BEFORE StarNet.  By
 * the time export runs they are ALREADY in the committed (square, for a tilted
 * disk) frame, so export applies no geometry of its own — it just downsizes
 * them.  These tests verify that faithful passthrough: a square in ships a
 * square out, no skip warning fires, and a disabled toggle matches the no-disk
 * baseline.  The "deproject actually stretches" geometry lives in the
 * handleProcess + deprojectDisk unit tests; "no double-stretch / registration"
 * lives in export.registration.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../tools/famous-curator/plugin/routes/export';
import { curatedGalaxyDir } from '../../../tools/famous-curator/plugin/paths';
import type { RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';

/**
 * Seed the source.png + cropped.png + starless.png trio handleProcess leaves
 * behind.  The 128×128 square stands in for the already-deprojected committed
 * frame; export downsizes it without restretching.
 */
async function seedSession(prefix: string): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), `curator-deproject-${prefix}-`));
  const tmpId = 'dp';
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

/** Minimal fake repoRoot with the directories handleExport expects to exist. */
function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-deproject-repo-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

const CROP = { x: 32, y: 32, width: 64, height: 64, rotationDeg: 0 };

function baseBody(tmpId: string) {
  return {
    id: 'ngc-deproject',
    tmpId,
    crop: CROP,
    starnet: { stride: 64, upsample: false },
    alpha: { blackPoint: 5, whitePoint: 220, gamma: 0.8 },
    metadata: {
      sourceUrl: 'https://example.com/ngc-deproject',
      license: 'CC-BY-4.0',
      author: 'Tester',
    },
  } as const;
}

/** Read source.webp from the export result dir and return its dimensions. */
async function sourceWebpDims(outDir: string): Promise<{ width: number; height: number }> {
  const buf = await sharp(resolve(outDir, 'source.webp')).metadata();
  return { width: buf.width!, height: buf.height! };
}

describe('handleExport — deproject frame', () => {
  it('downsizes an already-deprojected crop without restretching it', async () => {
    // Square cropped/starless in (handleProcess already squared them) ⇒ square
    // out.  A forced edge-on disk (axisRatio 0.2) must NOT trigger any export
    // re-stretch or skip warning — export owns no deproject step anymore.
    const sess = await seedSession('tilted');
    const repo = fakeRepoRoot();

    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 0,
      axisRatio: 0.2, // very edge-on, forced on — irrelevant to export's rasters now
      deproject: true,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleExport({
      body: { ...baseBody(sess.tmpId), disk },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('skip deproject'));
    warnSpy.mockRestore();

    const { width, height } = await sourceWebpDims(curatedGalaxyDir(repo, 'ngc-deproject'));
    expect(width).toBe(height);
  });

  it('is unchanged when deproject is off', async () => {
    // Baseline: no disk at all.
    const sessNoDisk = await seedSession('nodisk');
    const repoNoDisk = fakeRepoRoot();
    await handleExport({
      body: baseBody(sessNoDisk.tmpId),
      repoRoot: repoNoDisk,
      sessionDirOverride: sessNoDisk.sessionDir,
    });
    const noDiskDims = await sourceWebpDims(curatedGalaxyDir(repoNoDisk, 'ngc-deproject'));

    // With disk but deproject=false — must match the no-disk baseline AND emit
    // no skip warning (a disabled toggle is not a threshold skip).
    const sessOff = await seedSession('deproject-off');
    const repoOff = fakeRepoRoot();
    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 0,
      axisRatio: 0.5,
      deproject: false,
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleExport({
      body: { ...baseBody(sessOff.tmpId), disk },
      repoRoot: repoOff,
      sessionDirOverride: sessOff.sessionDir,
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('skip deproject'));
    warnSpy.mockRestore();
    const offDims = await sourceWebpDims(curatedGalaxyDir(repoOff, 'ngc-deproject'));

    expect(offDims.width).toBe(noDiskDims.width);
    expect(offDims.height).toBe(noDiskDims.height);
  });
});
