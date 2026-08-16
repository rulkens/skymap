/**
 * mergeSettingsSnapshot — unit tests for the pure cluster-merge reducer that
 * backs the tour's `restoreSceneSaga` settings write.
 *
 * The reducer takes a (possibly partial) `SettingsSnapshot` and returns a fresh
 * `EngineSettingsState` with each PRESENT cluster replaced by a detached deep
 * clone, every untouched cluster left at its original reference. These tests pin
 * the copy-on-write shape and the detachment that lets restore round-trip safely.
 */

import { describe, it, expect } from 'vitest';

import { mergeSettingsSnapshot } from '../../../src/state/settings/mergeSettingsSnapshot';
import { makeSettingsFixture } from './makeSettingsFixture';
import type { SettingsSnapshot } from '../../../src/@types/engine/settings/SettingsSnapshot';
import type { StructureId } from '../../../src/@types/data/structure/StructureId';

describe('mergeSettingsSnapshot', () => {
  it('replaces a present cluster with a detached deep clone (copy-on-write)', () => {
    const state = makeSettingsFixture();
    const patch = {
      flow: { ...state.flow, flowSpeed: 42 },
    } as unknown as Partial<SettingsSnapshot>;

    const next = mergeSettingsSnapshot(state, patch);

    // New top-level state, the touched cluster carries the patched values...
    expect(next).not.toBe(state);
    expect(next.flow).toEqual({ ...state.flow, flowSpeed: 42 });
    // ...but is a clone, not the patch's own object (detached).
    expect(next.flow).not.toBe(patch.flow);
  });

  it('leaves untouched clusters at their original reference', () => {
    const state = makeSettingsFixture();

    const next = mergeSettingsSnapshot(state, {
      flow: { ...state.flow },
    } as unknown as Partial<SettingsSnapshot>);

    // Other snapshot clusters untouched...
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
    expect(next.structures).toBe(state.structures);
    // ...and the non-snapshot clusters (tonemap/camera/bias/thumbnails/debug)
    // ride through unchanged — the reducer only ever swaps snapshot keys.
    expect(next.tonemap).toBe(state.tonemap);
    expect(next.debug).toBe(state.debug);
  });

  it('detaches the clone from the patch (a later patch mutation cannot bleed in)', () => {
    const state = makeSettingsFixture();
    const patch = {
      flow: { ...state.flow, flowSpeed: 1 },
    } as unknown as Partial<SettingsSnapshot>;

    const next = mergeSettingsSnapshot(state, patch);
    (patch.flow as { flowSpeed: number }).flowSpeed = 999;

    expect(next.flow.flowSpeed).toBe(1);
  });

  it('merges all ten clusters when given a full snapshot', () => {
    const state = makeSettingsFixture();
    const firstStructureId = Object.keys(state.structures.items)[0]! as StructureId;
    const full: SettingsSnapshot = {
      galaxyCatalogs: { ...state.galaxyCatalogs, sizePx: state.galaxyCatalogs.sizePx + 1 },
      structures: {
        ...state.structures,
        items: {
          ...state.structures.items,
          [firstStructureId]: {
            ...state.structures.items[firstStructureId],
            enabled: !state.structures.items[firstStructureId].enabled,
          },
        },
      },
      volumes: { ...state.volumes, enabled: !state.volumes.enabled },
      filaments: { ...state.filaments, intensity: 0.123 },
      milkyWay: { ...state.milkyWay, enabled: !state.milkyWay.enabled },
      flow: { ...state.flow, flowSpeed: 7 },
      orbitTrails: { ...state.orbitTrails, enabled: !state.orbitTrails.enabled },
      starCatalogs: { ...state.starCatalogs, enabled: !state.starCatalogs.enabled },
      bodies: { ...state.bodies },
      labels: { ...state.labels, focusedOnly: !state.labels.focusedOnly },
    };

    const next = mergeSettingsSnapshot(state, full);

    expect(next.galaxyCatalogs.sizePx).toBe(full.galaxyCatalogs.sizePx);
    expect(next.structures.items).toEqual(full.structures.items);
    expect(next.volumes.enabled).toBe(full.volumes.enabled);
    expect(next.filaments.intensity).toBe(0.123);
    expect(next.milkyWay.enabled).toBe(full.milkyWay.enabled);
    expect(next.flow.flowSpeed).toBe(7);
    expect(next.orbitTrails.enabled).toBe(full.orbitTrails.enabled);
    expect(next.starCatalogs.enabled).toBe(full.starCatalogs.enabled);
    expect(next.bodies).toEqual(full.bodies);
  });
});
