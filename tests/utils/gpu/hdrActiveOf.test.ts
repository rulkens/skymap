import { describe, it, expect, vi } from 'vitest';
import { hdrActiveOf } from '../../../src/utils/gpu/hdrActiveOf';
import type { RenderTargets } from '../../../src/@types/rendering/RenderTargets';
import type { RenderTargetSpec } from '../../../src/@types/engine/frame/RenderTargetSpec';

// hdrActiveOf's only live read path is `specOf('swap')`; `specs` is passed
// through so `specOf` has something to resolve against, and the rest of the
// interface is unused by the function under test.
function makeStub(specs: readonly RenderTargetSpec[]): RenderTargets {
  return {
    specs,
    specOf: (id: string) => {
      const spec = specs.find((s) => s.id === id);
      if (!spec) throw new Error(`fixture renderTargets: no spec row for '${id}'`);
      return spec;
    },
    sizeOf: vi.fn(),
    viewOf: vi.fn(),
    depthViewOf: vi.fn(),
    reconcile: vi.fn(),
    setSwapFormat: vi.fn(),
    destroy: vi.fn(),
  };
}

const CLEAR = { r: 0, g: 0, b: 0, a: 1 };

describe('hdrActiveOf', () => {
  it('is true only for an rgba16float swap row', () => {
    const sdr = makeStub([
      { id: 'hdr', format: 'rgba16float', depth: null, scale: 1, clearValue: CLEAR },
      { id: 'swap', format: 'bgra8unorm', depth: null, scale: 1, clearValue: CLEAR },
    ]);
    const hdr = makeStub([
      { id: 'hdr', format: 'rgba16float', depth: null, scale: 1, clearValue: CLEAR },
      { id: 'swap', format: 'rgba16float', depth: null, scale: 1, clearValue: CLEAR },
    ]);

    expect(hdrActiveOf(sdr)).toBe(false);
    expect(hdrActiveOf(hdr)).toBe(true);
  });
});
