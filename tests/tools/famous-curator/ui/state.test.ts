/**
 * state — reducer for the curator UI.
 *
 * State shape:
 *   - galaxies: GalaxyListEntry[]  (from /api/galaxies)
 *   - activeId: string | undefined (selected galaxy)
 *   - tmpId: string | undefined    (current /api/fetch session)
 *   - source: { width, height, previewUrl } | undefined
 *   - crop: Crop | undefined       (resetCrop'd when source loads)
 *   - disk: RecipeDisk | undefined (source-px disk geometry annotation)
 *   - starnet: { stride, upsample }
 *   - alpha: { blackPoint, whitePoint, gamma }
 *   - metadata: { sourceUrl, license, author }
 *   - previews: { starless?, alpha? }
 *   - dirty: { crop, starnet, alpha, disk }  (which subsystem needs
 *                                       re-Process / alpha-only re-render)
 *   - processedOnce: boolean       (Export gate)
 *
 * The reducer enforces the dirty-state transitions documented in the
 * spec's "Process flow + preview behaviour" section.
 */
import { describe, expect, it } from 'vitest';
import {
  reducer,
  initialState,
  canCommit,
  type Action,
} from '../../../../tools/famous-curator/ui/state';
import type { RecipeDisk } from '../../../../tools/famous-curator/plugin/recipe';

const diskFixture: RecipeDisk = {
  centerPx: [10, 20],
  radiusPx: 30,
  paDeg: 45,
  axisRatio: 0.6,
  deproject: true,
};

function apply(actions: Action[]) {
  return actions.reduce(reducer, initialState);
}

describe('state reducer', () => {
  it('initial state has nothing selected, default sliders', () => {
    expect(initialState.activeId).toBeUndefined();
    expect(initialState.starnet.stride).toBe(256);
    expect(initialState.alpha.blackPoint).toBe(8);
    expect(initialState.alpha.whitePoint).toBe(255);
    expect(initialState.alpha.gamma).toBeCloseTo(0.7);
  });

  it('setGalaxies populates the list', () => {
    const s = reducer(initialState, {
      type: 'setGalaxies',
      galaxies: [
        {
          id: 'm31',
          names: ['M31'],
          ra: 0,
          dec: 0,
          distanceMpc: 0,
          diameterKpc: 0,
          type: '',
          description: '',
          curated: false,
          hasDisk: false,
        },
      ],
    });
    expect(s.galaxies).toHaveLength(1);
  });

  it('markCuratedById flips curated + disk flags so the list badge appears without a refetch', () => {
    const entry = {
      id: 'm31',
      names: ['M31'],
      ra: 0,
      dec: 0,
      distanceMpc: 0,
      diameterKpc: 0,
      type: '',
      description: '',
      curated: false,
      hasDisk: false,
    };
    let s = reducer(initialState, { type: 'setGalaxies', galaxies: [entry] });
    s = reducer(s, { type: 'markCuratedById', id: 'm31', hasDisk: true, diskDeproject: true });
    expect(s.galaxies[0]!.curated).toBe(true);
    expect(s.galaxies[0]!.hasDisk).toBe(true);
    expect(s.galaxies[0]!.diskDeproject).toBe(true);
  });

  it('markCuratedById clears the disk flags when a galaxy is committed without a disk', () => {
    const entry = {
      id: 'm31',
      names: ['M31'],
      ra: 0,
      dec: 0,
      distanceMpc: 0,
      diameterKpc: 0,
      type: '',
      description: '',
      curated: false,
      hasDisk: true,
      diskDeproject: true,
    };
    let s = reducer(initialState, { type: 'setGalaxies', galaxies: [entry] });
    s = reducer(s, {
      type: 'markCuratedById',
      id: 'm31',
      hasDisk: false,
      diskDeproject: undefined,
    });
    expect(s.galaxies[0]!.hasDisk).toBe(false);
    expect(s.galaxies[0]!.diskDeproject).toBeUndefined();
  });

  it('selectGalaxy clears tmpId, source, crop, previews, processedOnce', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 80, previewUrl: '/p' },
      { type: 'setPreviews', starless: '/s', alpha: '/a' },
      { type: 'markProcessed' },
      { type: 'selectGalaxy', id: 'm31' },
    ]);
    expect(s.activeId).toBe('m31');
    expect(s.tmpId).toBeUndefined();
    expect(s.source).toBeUndefined();
    expect(s.crop).toBeUndefined();
    expect(s.previews).toEqual({});
    expect(s.processedOnce).toBe(false);
  });

  it('setSource initialises crop via resetCrop and marks crop dirty', () => {
    const s = reducer(initialState, {
      type: 'setSource',
      tmpId: 't',
      width: 1000,
      height: 800,
      previewUrl: '/p',
    });
    // resetCrop returns the largest centred square = min(width, height).
    expect(s.crop?.width).toBe(800);
    expect(s.dirty.crop).toBe(true);
  });

  it('setCrop marks crop dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 1000, height: 800, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 100, height: 100, rotationDeg: 0 } },
    ]);
    expect(s.dirty.crop).toBe(true);
    expect(s.processedOnce).toBe(true); // crop dirty does NOT reset processedOnce
  });

  it('setStarnet marks starnet dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setStarnet', starnet: { stride: 512, upsample: true } },
    ]);
    expect(s.dirty.starnet).toBe(true);
  });

  it('setAlpha marks alpha dirty but NOT crop/starnet', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setAlpha', alpha: { blackPoint: 10, whitePoint: 240, gamma: 0.5 } },
    ]);
    expect(s.dirty.alpha).toBe(true);
    expect(s.dirty.crop).toBe(false); // setSource cleared it; nothing dirtied since
  });

  it('markProcessed clears crop+starnet dirty, sets processedOnce, leaves alpha dirty alone', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setStarnet', starnet: { stride: 512, upsample: false } },
      { type: 'setAlpha', alpha: { blackPoint: 10, whitePoint: 240, gamma: 0.5 } },
      { type: 'markProcessed' },
    ]);
    expect(s.dirty.crop).toBe(false);
    expect(s.dirty.starnet).toBe(false);
    expect(s.dirty.alpha).toBe(true);
    expect(s.processedOnce).toBe(true);
  });

  it('canCommit requires source loaded + valid metadata (no processedOnce / dirty checks)', () => {
    // The unified Commit handles process/export/build in one click and
    // will re-process when dirty, so the gate is just "source + meta".
    const ok = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
    ]);
    expect(canCommit(ok)).toBe(true);
    const noMeta = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
    ]);
    expect(canCommit(noMeta)).toBe(false);
    // Crop being dirty (or starnet, or not-yet-processed) does not
    // block Commit — the handler re-processes when needed.
    const cropDirty = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 50, height: 50, rotationDeg: 0 } },
    ]);
    expect(canCommit(cropDirty)).toBe(true);
  });
});

describe('state reducer — disk slice', () => {
  it('setDisk stores the disk geometry and marks disk dirty', () => {
    const s = reducer(initialState, { type: 'setDisk', disk: diskFixture });
    expect(s.disk).toEqual(diskFixture);
    expect(s.dirty.disk).toBe(true);
  });

  it('clearDisk resets disk to undefined', () => {
    const s = apply([{ type: 'setDisk', disk: diskFixture }, { type: 'clearDisk' }]);
    expect(s.disk).toBeUndefined();
  });

  it('selectGalaxy clears disk and disk dirty', () => {
    const s = apply([
      { type: 'setDisk', disk: diskFixture },
      { type: 'selectGalaxy', id: 'm31' },
    ]);
    expect(s.disk).toBeUndefined();
    expect(s.dirty.disk).toBe(false);
  });

  it('markProcessed clears disk dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setDisk', disk: diskFixture },
      { type: 'markProcessed' },
    ]);
    expect(s.dirty.disk).toBe(false);
  });
});

describe('state reducer — deproject crop slice', () => {
  const sq = { x: 100, y: 100, width: 200, height: 200, rotationDeg: 0 };
  const rect = { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 };

  it('setDeprojectCrop saves the prior square crop on first transition', () => {
    let s = reducer(initialState, { type: 'setCrop', crop: sq });
    s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
    expect(s.crop).toEqual(rect);
    expect(s.savedSquareCrop).toEqual(sq);
    expect(s.dirty.crop).toBe(true);
  });

  it('restoreSquareCrop restores the saved square and clears the slot', () => {
    let s = reducer(initialState, { type: 'setCrop', crop: sq });
    s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
    s = reducer(s, { type: 'restoreSquareCrop' });
    expect(s.crop).toEqual(sq);
    expect(s.savedSquareCrop).toBeUndefined();
  });

  it('selectGalaxy clears savedSquareCrop', () => {
    let s = reducer(initialState, { type: 'setCrop', crop: sq });
    s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
    s = reducer(s, { type: 'selectGalaxy', id: 'm51' });
    expect(s.savedSquareCrop).toBeUndefined();
  });
});
