import { describe, expect, it } from 'vitest';
import { layerSwitchRows } from '../../../src/utils/layer/layerSwitchRows';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import type { VisibilityEntry } from '../../../src/@types/engine/layer/VisibilityEntry';

const section = () => null;

describe('layerSwitchRows', () => {
  // The pin: a composed Layer with a second switchable show entry throws here, and must say which.
  it('gives every main-section Layer one row, switching the show entry that is no Labels & Guides row', () => {
    const rows = layerSwitchRows(APP_COMPOSITION.layers);
    expect(rows.length).toBe(layerUiContents(APP_COMPOSITION.layers, 'main').length);
    // starCatalog also shows S-star trails, a Labels & Guides row.
    const toggles = rows.map((row) => row.toggle);
    expect(toggles).toContain('starCatalog');
    expect(toggles).not.toContain('sStarTrails');
  });

  it('throws, naming the Layer, unless exactly one show entry is left to switch', () => {
    const layerWith = (visibility: readonly VisibilityEntry[]) => ({
      name: 'stub',
      ui: [{ slot: 'main' as const, content: section, title: 'Stub' }],
      visibility,
    });
    expect(() => layerSwitchRows([layerWith([{ key: 'a' }, { key: 'b' }])])).toThrow(/stub/);
    expect(() => layerSwitchRows([layerWith([{ label: 'a', cluster: 'a' }])])).toThrow(/stub/);
  });
});
