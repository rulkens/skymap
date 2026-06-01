/**
 * pickRenderer.poi.test — type-level contract test that
 * `createPickRenderer` keeps `clusterMarkerRenderer` as its OPTIONAL
 * tail positional argument.
 *
 * Why a type-only test rather than a GPU integration test?  The pick
 * pass needs a live `GPUDevice` and a constructed `PointRenderer` +
 * `ClusterMarkerRenderer` to exercise end-to-end; that's well beyond
 * what Vitest can stand up in a Node environment.  What we *can*
 * lock down here is the public signature shape: if a future refactor
 * accidentally drops the optional marker, makes it required, or
 * reorders positional args, the type assertions below fail to compile
 * and the test fails at type-check time (vitest runs through tsc).
 *
 * The optional marker is now the 6th positional (index 5): cluster
 * focus mode inserted the required `focusBgl` as the 5th (index 4), so
 * `clusterMarkerRenderer` shifted one slot right but stays at the tail
 * and stays optional.
 */

import { describe, it, expect } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer POI integration', () => {
  it('keeps clusterMarkerRenderer optional as the 6th positional', () => {
    // Compile-time check: the 6th parameter must exist and must be
    // assignable from `undefined` (i.e. declared with `?`).  If a
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
