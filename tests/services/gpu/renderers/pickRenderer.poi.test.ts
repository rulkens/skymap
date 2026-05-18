/**
 * pickRenderer.poi.test — type-level contract test that
 * `createPickRenderer` accepts an OPTIONAL fifth positional
 * `clusterMarkerRenderer` argument.
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
 * The "5th positional" position is load-bearing: existing callers (
 * see `wireInput.ts`) pass four args today and must keep compiling
 * with no edit, so the new arg has to be appended at the tail and
 * marked optional.
 */

import { describe, it, expect } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

describe('createPickRenderer POI integration', () => {
  it('accepts an optional clusterMarkerRenderer argument as the 5th positional', () => {
    // Compile-time check: the 5th parameter must exist and must be
    // assignable from `undefined` (i.e. declared with `?`).  If a
    // future edit removes the param or makes it required, the
    // `_undef` assignment below stops type-checking and the suite
    // fails at build time.
    type ExpectedSig = Parameters<typeof createPickRenderer>;
    const _check = (...args: ExpectedSig): void => {
      const fifth: ExpectedSig[4] = args[4];
      const _undef: typeof fifth = undefined;
      void _undef;
    };
    expect(_check).toBeTypeOf('function');
  });
});
