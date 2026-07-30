import { describe, it, expect, vi } from 'vitest';
import { hdrActiveOf } from '../../../src/utils/gpu/hdrActiveOf';
import type { RenderTargets } from '../../../src/@types/rendering/RenderTargets';
import type { RenderTargetSpec } from '../../../src/@types/engine/frame/RenderTargetSpec';

// hdrActiveOf only reads `.specs`; the rest of the interface is unused by
// the function under test, so these are inert stubs.
function makeStub(specs: readonly RenderTargetSpec[]): RenderTargets {
  return {
    specs,
    viewOf: vi.fn(),
    depthViewOf: vi.fn(),
    resize: vi.fn(),
    setSwapFormat: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('hdrActiveOf', () => {
  it('is true only for an rgba16float swap row', () => {
    const sdr = makeStub([
      { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
      { id: 'swap', format: 'bgra8unorm', depth: null, scale: 1 },
    ]);
    const hdr = makeStub([
      { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
      { id: 'swap', format: 'rgba16float', depth: null, scale: 1 },
    ]);

    expect(hdrActiveOf(sdr)).toBe(false);
    expect(hdrActiveOf(hdr)).toBe(true);
  });
});
