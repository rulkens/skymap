/**
 * frameOrderBoot — `checkFrameOrder` over the REAL artifacts the app boots
 * with, which is the check `startLoop` runs once before the first frame. The
 * per-rule cases live in `checkFrameOrder.test.ts`; this one binds them to
 * production data, so a Layer that contributes a pass and forgets its
 * `FRAME_ORDER` line fails here instead of silently never drawing. Target ids
 * include every Layer's `targets` too, via `composeRenderTargetRows` — the
 * same composed table the `renderTargets` GPU-handle row allocates.
 */

import { describe, it, expect } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { CORE_COMPUTES } from '../../../../src/services/engine/frame/computes';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { APP_COMPOSITION } from '../../../../src/compositions/app';

describe('checkFrameOrder — boot', () => {
  it('the app’s FRAME_ORDER passes the boot check', () => {
    // The swap format only decides the swap ROW's format, never an id, so any
    // valid format yields the same rows `startLoop` reads off the assembled
    // table.
    const targets = composeRenderTargetRows(
      'bgra8unorm',
      APP_COMPOSITION.layers.map((layer) => layer.targets ?? []),
    );
    expect(() =>
      checkFrameOrder(FRAME_ORDER, CONTENT_PASSES, CORE_COMPUTES, targets),
    ).not.toThrow();
  });
});
