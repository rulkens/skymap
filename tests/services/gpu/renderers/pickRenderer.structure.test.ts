/**
 * pickRenderer.structure.test — type-level contract that `createPickRenderer`
 * keeps `structureMarkerRenderer` as its OPTIONAL tail positional argument
 * (index 7, after the required device/fadeBgl/sourceBgl/focusBgl/lensingBgl
 * BGLs at 0..4 and the two required shared bind groups `focusBindGroup`
 * (index 5) + `lensingBindGroup` (index 6)).
 *
 * Why type-only rather than a GPU integration test? The pick pass needs
 * a live `GPUDevice` plus a constructed `StructureMarkerRenderer` to exercise
 * end-to-end — beyond what Vitest can stand up in Node. What we can lock
 * down is the signature shape: dropping the optional marker, making it
 * required, or reordering positional args breaks the type assertions below
 * at type-check time (vitest runs tsc).
 *
 * Note: the lensing refactor inserted `lensingBgl` (index 4) +
 * `lensingBindGroup` (index 6), shifting the optional tail params down by
 * two indices each.
 */

import { describe, it, expect } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer structure integration', () => {
  it('keeps structureMarkerRenderer optional as the 8th positional (index 7)', () => {
    // Compile-time check: the 8th parameter (index 7) must exist and must
    // be assignable from `undefined` (i.e. declared with `?`).  If a
    // future edit removes the param or makes it required, the
    // `_undef` assignment below stops type-checking and the suite
    // fails at build time.
    type ExpectedSig = Parameters<typeof createPickRenderer>;
    const _check = (...args: ExpectedSig): void => {
      const eighth: ExpectedSig[7] = args[7];
      const _undef: typeof eighth = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});
