/**
 * ownerFromStack — both Chrome stack-frame shapes, and the skip-the-ledger's-
 * own-frame behavior every ledger allocation relies on (the wrapped
 * createBuffer/createTexture call's own frame is always first).
 */

import { describe, it, expect } from 'vitest';
import { ownerFromStack } from '../../../../src/utils/gpu/memory/ownerFromStack';

describe('ownerFromStack', () => {
  it('extracts the basename from a named-function frame', () => {
    const stack = [
      'Error',
      '    at trackGpuMemory (http://localhost:5173/src/services/gpu/memory/trackGpuMemory.ts?t=1:40:10)',
      '    at loadCatalog (http://localhost:5173/src/state/galaxyCatalog/catalogStore.ts?t=1:250:10)',
    ].join('\n');
    expect(ownerFromStack(stack, 'trackGpuMemory')).toBe('catalogStore');
  });

  it('extracts the basename from an anonymous frame (no function name)', () => {
    const stack = [
      'Error',
      '    at http://localhost:5173/src/services/gpu/memory/trackGpuMemory.ts?t=1:40:10',
      '    at http://localhost:5173/src/layers/galaxyCatalog/render/galaxyPointRenderer.ts?t=1:88:4',
    ].join('\n');
    expect(ownerFromStack(stack, 'trackGpuMemory')).toBe('galaxyPointRenderer');
  });

  it('returns null when every frame is the ledger itself or unparseable', () => {
    const stack = [
      'Error',
      '    at trackGpuMemory (http://localhost:5173/src/services/gpu/memory/trackGpuMemory.ts?t=1:40:10)',
      '    at <anonymous>',
    ].join('\n');
    expect(ownerFromStack(stack, 'trackGpuMemory')).toBeNull();
  });
});
