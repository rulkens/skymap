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
});
