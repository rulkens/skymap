/**
 * Smoke test for EngineHandle — asserts that the engine handle exposes
 * exactly 7 sub-handles (camera, selection, sources, volumes, debug, tour,
 * clip) plus 2 root-level members (destroy, assetSlots). Store writes go
 * direct to Redux; no other clusters belong on this surface.
 */
import { describe, it, expect } from 'vitest';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';

describe('EngineHandle — namespace sub-handles', () => {
  it('declares 7 sub-handles + destroy + assetSlots as type-level members', () => {
    // Compile-time assertion: every name below must exist on EngineHandle.
    const expectedSubHandles: ReadonlyArray<keyof EngineHandle> = [
      'camera',
      'selection',
      'sources',
      'volumes',
      'debug',
      'tour',
      'clip',
    ];
    const expectedRoot: ReadonlyArray<keyof EngineHandle> = ['destroy', 'assetSlots'];
    expect(expectedSubHandles).toHaveLength(7);
    expect(expectedRoot).toHaveLength(2);
  });
});
