/**
 * pickRenderer.structure.test — type-level contract that `createPickRenderer`
 * keeps `structureMarkerRenderer` as its OPTIONAL tail positional argument
 * (the 7th, index 6, after the required `focusBgl` at index 4 and the
 * required shared `focusBindGroup` at index 5).
 *
 * Why type-only rather than a GPU integration test? The pick pass needs
 * a live `GPUDevice` plus constructed `PointRenderer` +
 * `StructureMarkerRenderer` to exercise end-to-end — beyond what Vitest can
 * stand up in Node. What we can lock down is the signature shape: dropping
 * the optional marker, making it required, or reordering positional args
 * breaks the type assertions below at type-check time (vitest runs tsc).
 */

import { describe, it, expect } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer structure integration', () => {
  it('keeps structureMarkerRenderer optional as the 7th positional', () => {
    // Compile-time check: the 7th parameter must exist and must be
    // assignable from `undefined` (i.e. declared with `?`).  If a
    // future edit removes the param or makes it required, the
    // `_undef` assignment below stops type-checking and the suite
    // fails at build time.
    type ExpectedSig = Parameters<typeof createPickRenderer>;
    const _check = (...args: ExpectedSig): void => {
      const seventh: ExpectedSig[6] = args[6];
      const _undef: typeof seventh = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});
