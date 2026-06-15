import { describe, it, expect } from 'vitest';

import { setStructureLabelEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setStructureLabelEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setStructureLabelEnabled', () => {
  it('flips items[cat].labelEnabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every category seeded labelEnabled
    const next = setStructureLabelEnabled(state, 'cluster', false);

    expect(next.structures.items.cluster.labelEnabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.structures).not.toBe(state.structures);
    expect(next.structures.items).not.toBe(state.structures.items);
    expect(next.structures.items.cluster).not.toBe(state.structures.items.cluster);
    // … but a sibling category row keeps its existing reference …
    expect(next.structures.items.supercluster).toBe(state.structures.items.supercluster);
    // … and a sibling cluster is untouched.
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('preserves the category ring axis when flipping the label', () => {
    const state = makeSettingsFixture();
    const next = setStructureLabelEnabled(state, 'cluster', false);

    expect(next.structures.items.cluster.enabled).toBe(state.structures.items.cluster.enabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setStructureLabelEnabled(state, 'cluster', false);

    expect(state.structures.items.cluster.labelEnabled).toBe(true);
  });
});
