/**
 * Smoke test for the H5 namespace restructure — asserts that the engine
 * handle exposes the 11 sub-handles + 2 root members.  Doesn't assert
 * on flat methods (those go away in Task 11) but the test file's full
 * baseline is exercised by other tests.
 */
import { describe, it, expect } from 'vitest';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';

describe('EngineHandle — namespace sub-handles', () => {
  it('declares 11 sub-handles + destroy + assetSlots as type-level members', () => {
    // Compile-time assertion: every name below must exist on EngineHandle.
    const expectedSubHandles: ReadonlyArray<keyof EngineHandle> = [
      'points',
      'tonemap',
      'camera',
      'selection',
      'sources',
      'bias',
      'thumbnails',
      'milkyWay',
      'filaments',
      'volumes',
      'input',
    ];
    const expectedRoot: ReadonlyArray<keyof EngineHandle> = [
      'destroy',
      'assetSlots',
    ];
    expect(expectedSubHandles).toHaveLength(11);
    expect(expectedRoot).toHaveLength(2);
  });
});
