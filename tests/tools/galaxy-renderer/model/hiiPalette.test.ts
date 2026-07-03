/**
 * hiiPalette — the metallicity-driven HII emission palette, extracted from
 * galaxy-model.js:131-136. Core lerps teal -> pink -> deep red across the
 * metallicity range; halo lerps a separate teal -> red pair over the full
 * [0,1] range in one step.
 */
import { describe, expect, it } from 'vitest';
import { hiiPalette } from '../../../../tools/galaxy-renderer/src/model/hiiPalette';

describe('hiiPalette', () => {
  it('metallicity 0 gives a teal core', () => {
    const { core } = hiiPalette(0);
    expect(core).toEqual([0.4, 0.85, 0.8]);
  });

  it('metallicity 0.5 gives the pink core exactly', () => {
    const { core } = hiiPalette(0.5);
    expect(core).toEqual([1.0, 0.42, 0.56]);
  });

  it('metallicity 1 gives the deep-red core exactly', () => {
    const { core } = hiiPalette(1);
    expect(core).toEqual([1.0, 0.3, 0.32]);
  });

  it('halo tracks metallicity — endpoints exact', () => {
    expect(hiiPalette(0).halo).toEqual([0.42, 0.78, 0.72]);
    expect(hiiPalette(1).halo).toEqual([1.0, 0.26, 0.3]);
  });
});
