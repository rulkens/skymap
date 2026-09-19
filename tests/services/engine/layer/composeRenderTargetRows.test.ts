/**
 * composeRenderTargetRows — core's `renderTargetRows` plus every Layer's
 * `targets`, guarded by `concatUniqueRows` (the render-target table's fourth
 * caller, after passes/computes/asset keys in `createLayers`).
 */
import { describe, it, expect } from 'vitest';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { renderTargetRows } from '../../../../src/services/gpu/renderTargets';
import type { RenderTargetSpec } from '../../../../src/@types/engine/frame/RenderTargetSpec';

const SWAP_FORMAT: GPUTextureFormat = 'bgra8unorm';

const STUB_ROW: RenderTargetSpec = {
  id: 'stub-target',
  format: 'rgba16float',
  depth: null,
  scale: 1,
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
};

describe('composeRenderTargetRows', () => {
  it("appends each Layer's targets after core's rows", () => {
    const rows = composeRenderTargetRows(SWAP_FORMAT, [[STUB_ROW]]);
    const coreIds = renderTargetRows(SWAP_FORMAT).map((row) => row.id);
    expect(rows.map((row) => row.id)).toEqual([...coreIds, 'stub-target']);
  });

  it('throws when a Layer target reuses a core id', () => {
    const dupRow: RenderTargetSpec = { ...STUB_ROW, id: 'hdr' };
    expect(() => composeRenderTargetRows(SWAP_FORMAT, [[dupRow]])).toThrow(/'hdr'/);
  });
});
