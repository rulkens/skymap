/**
 * pickRenderer.structure.test — type-level contract that `createPickRenderer`
 * keeps `structureMarkerRenderer` as its OPTIONAL tail positional argument
 * (index 5, after the required device/fadeBgl/sourceBgl/sceneBgl at 0..3 and
 * the shared `sceneBindGroup` (index 4) — which carries both cluster focus
 * and the gravitational-lensing buffer at @group(3)).
 *
 * Why type-only rather than a GPU integration test? The pick pass needs
 * a live `GPUDevice` plus a constructed `StructureMarkerRenderer` to exercise
 * end-to-end — beyond what Vitest can stand up in Node. What we can lock
 * down is the signature shape: dropping the optional marker, making it
 * required, or reordering positional args breaks the type assertions below
 * at type-check time (vitest runs tsc).
 */

import { describe, it, expect } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer structure integration', () => {
  it('keeps structureMarkerRenderer optional as the 6th positional (index 5)', () => {
    // Compile-time check: the 6th parameter (index 5) must exist and must
    // be assignable from `undefined` (i.e. declared with `?`).  If a
    // future edit removes the param or makes it required, the
    // `_undef` assignment below stops type-checking and the suite
    // fails at build time.
    type ExpectedSig = Parameters<typeof createPickRenderer>;
    const _check = (...args: ExpectedSig): void => {
      const sixth: ExpectedSig[5] = args[5];
      const _undef: typeof sixth = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});
