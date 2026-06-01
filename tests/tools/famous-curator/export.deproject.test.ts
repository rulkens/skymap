/**
 * handleExport — deprojection pipeline tests.
 *
 * Verifies that a tilted-disk export is geometrically stretched to
 * face-on before downsize, that a forced toggle deprojects even a very
 * edge-on disk, and that the deproject=off path is byte-identical to the
 * no-disk baseline.
 *
 * Frame note: `starless.png` in the session dir is produced by
 * `handleProcess`, which runs `rotatedExtract` → StarNet → starless.png.
 * Both source (post-rotatedExtract) and starless are therefore in the
 * CROP frame.  The effective PA for deprojectDisk is
 *   effectivePaDeg = disk.paDeg - crop.rotationDeg.
 * For the tests below, rotationDeg=0 so effectivePaDeg = disk.paDeg.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../tools/famous-curator/plugin/routes/export';
import { curatedGalaxyDir } from '../../../tools/famous-curator/plugin/paths';
import type { RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';

/**
 * Create a 128×128 RGBA PNG with a simple gradient (so deproject produces
 * measurable dimensional changes) and write it as source.png + starless.png.
 */
async function seedSession(prefix: string): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), `curator-deproject-${prefix}-`));
  const tmpId = 'dp';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  // 128×128 gives enough pixels for the affine stretch to produce a measurably
  // different output size, while keeping the test fast.
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

/**
 * Centred 64×64 crop with no rotation — keeps effectivePaDeg = disk.paDeg
 * so the geometry is easy to reason about in assertions.
 */
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
  const buf = readFileSync(resolve(outDir, 'source.webp'));
  const meta = await sharp(buf).metadata();
  return { width: meta.width!, height: meta.height! };
}

describe('handleExport — deprojection', () => {
  it('ships a square source.webp for a tilted disk', async () => {
    // paDeg=0 → major axis vertical; minor axis is image-Y.
    // squareDeprojectCrop snaps the 64×64 crop to a 64×32 (b/a) rect; deprojectDisk
    // then Y-stretches it by 1/0.5=2× back to 64×64 — an exact square.  The square
    // IS the observable contract now (deproject no longer auto-grows to a taller
    // rectangle); the "did it stretch" geometry is covered by the unit tests.
    const sess = await seedSession('tilted');
    const repo = fakeRepoRoot();

    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 0, // major axis vertical in crop frame (same as source frame at rotationDeg=0)
      axisRatio: 0.5, // > DEPROJECT_MIN_AXIS_RATIO (0.3) → should deproject
      deproject: true,
    };

    await handleExport({
      body: { ...baseBody(sess.tmpId), disk },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });

    const { width: deprojW, height: deprojH } = await sourceWebpDims(
      curatedGalaxyDir(repo, 'ngc-deproject'),
    );

    // The deprojected source.webp is square.
    expect(deprojW).toBe(deprojH);
  });

  it('still deprojects a very edge-on disk when the toggle is forced on', async () => {
    // axisRatio=0.2 is below the advisory DEPROJECT_MIN_AXIS_RATIO (0.3) but
    // the floor is no longer a hard-stop — a forced toggle must deproject, and
    // it must do so without logging a skip warning.
    const sess = await seedSession('edgeon');
    const repo = fakeRepoRoot();

    const disk: RecipeDisk = {
      centerPx: [64, 64],
      radiusPx: 24,
      paDeg: 0,
      axisRatio: 0.2, // very edge-on — but forced on, so it deprojects
      deproject: true,
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleExport({
      body: { ...baseBody(sess.tmpId), disk },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    // No skip warning fires for a forced edge-on deproject.
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('skip deproject'));
    warnSpy.mockRestore();

    const { width: edgeonW, height: edgeonH } = await sourceWebpDims(
      curatedGalaxyDir(repo, 'ngc-deproject'),
    );

    // The forced deproject squares the output.  At b/a=0.2 the 64-px crop snaps
    // to height round(64·0.2)=13, which the ×5 stretch returns to 65 — a one-px
    // rounding off perfect square that scales to ~1.5% after the fit-inside
    // downsize, so we assert near-square rather than exact.
    expect(Math.abs(edgeonW - edgeonH) / Math.max(edgeonW, edgeonH)).toBeLessThan(0.05);
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
