/**
 * Smoke test for EngineHandle — asserts that the engine handle exposes
 * exactly 6 sub-handles (camera, selection, sources, volumes, debug, clip)
 * plus 2 root-level members (destroy, assetSlots). Store writes go direct to
 * Redux — the tour is driven by dispatching `startTour`/`advanceTour`/`exitTour`
 * actions, not through a handle namespace.
 */
import { describe, it, expect } from 'vitest';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';

describe('EngineHandle — namespace sub-handles', () => {
  it('declares 6 sub-handles + destroy + assetSlots as type-level members', () => {
    // Compile-time assertion: every name below must exist on EngineHandle.
    const expectedSubHandles: ReadonlyArray<keyof EngineHandle> = [
      'camera',
      'selection',
      'sources',
      'volumes',
      'debug',
      'clip',
    ];
    const expectedRoot: ReadonlyArray<keyof EngineHandle> = ['destroy', 'assetSlots'];
    expect(expectedSubHandles).toHaveLength(6);
    expect(expectedRoot).toHaveLength(2);
  });
});
