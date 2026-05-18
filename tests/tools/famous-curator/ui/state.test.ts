/**
 * state — reducer for the curator UI.
 *
 * State shape:
 *   - galaxies: GalaxyListEntry[]  (from /api/galaxies)
 *   - activeId: string | undefined (selected galaxy)
 *   - tmpId: string | undefined    (current /api/fetch session)
 *   - source: { width, height, previewUrl } | undefined
 *   - crop: Crop | undefined       (resetCrop'd when source loads)
 *   - starnet: { stride, upsample }
 *   - alpha: { blackPoint, whitePoint, gamma }
 *   - metadata: { sourceUrl, license, author }
 *   - previews: { starless?, alpha? }
 *   - dirty: { crop, starnet, alpha }  (which subsystem needs re-Process /
 *                                       alpha-only re-render)
 *   - processedOnce: boolean       (Export gate)
 *
 * The reducer enforces the dirty-state transitions documented in the
 * spec's "Process flow + preview behaviour" section.
 */
import { describe, expect, it } from 'vitest';
import { reducer, initialState, canExport, type Action } from '../../../../tools/famous-curator/ui/state';

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
    const s = reducer(initialState, { type: 'setGalaxies', galaxies: [
      { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
    ]});
    expect(s.galaxies).toHaveLength(1);
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
    const s = reducer(initialState, { type: 'setSource', tmpId: 't', width: 1000, height: 800, previewUrl: '/p' });
    // resetCrop returns the largest centred square = min(width, height).
    expect(s.crop?.width).toBe(800);
    expect(s.dirty.crop).toBe(true);
  });

  it('setCrop marks crop dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 1000, height: 800, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 100, height: 100 } },
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

  it('canExport requires processedOnce + valid metadata + crop not dirty + starnet not dirty', () => {
    // canExport is a derived selector exported from the same module —
    // imported statically above (require() doesn't work in ESM/Vitest).
    const ok = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
    ]);
    expect(canExport(ok)).toBe(true);
    const noMeta = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
    ]);
    expect(canExport(noMeta)).toBe(false);
    const cropDirty = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 50, height: 50 } },
    ]);
    expect(canExport(cropDirty)).toBe(false);
  });
});
