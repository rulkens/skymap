import { describe, it, expect } from 'vitest';

import { setStructureItemEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setStructureItemEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setStructureItemEnabled', () => {
  it('flips items[cat].enabled copy-on-write and leaves siblings', () => {
    const state = makeSettingsFixture(); // every category seeded enabled
    const next = setStructureItemEnabled(state, 'cluster', false);

    expect(next.structures.items.cluster.enabled).toBe(false);
    // The touched cluster, items record, and row are all new refs …
    expect(next.structures).not.toBe(state.structures);
    expect(next.structures.items).not.toBe(state.structures.items);
    expect(next.structures.items.cluster).not.toBe(state.structures.items.cluster);
    // … but a sibling category row keeps its existing reference …
    expect(next.structures.items.supercluster).toBe(state.structures.items.supercluster);
    // … and a sibling cluster is untouched.
    expect(next.surveys).toBe(state.surveys);
  });

  it('preserves the category label axis when flipping the ring', () => {
    const state = makeSettingsFixture();
    const next = setStructureItemEnabled(state, 'cluster', false);

    expect(next.structures.items.cluster.labelEnabled).toBe(
      state.structures.items.cluster.labelEnabled,
    );
  });

  it('preserves the structures master gate when flipping a category ring', () => {
    const state = makeSettingsFixture();
    const next = setStructureItemEnabled(state, 'cluster', false);

    expect(next.structures.enabled).toBe(state.structures.enabled);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();

    setStructureItemEnabled(state, 'cluster', false);

    expect(state.structures.items.cluster.enabled).toBe(true);
  });
});
