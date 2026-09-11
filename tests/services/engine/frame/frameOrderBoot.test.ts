/**
 * frameOrderBoot — `checkFrameOrder` over the REAL artifacts the app boots
 * with, which is the check `startLoop` runs once before the first frame. The
 * per-rule cases live in `checkFrameOrder.test.ts`; this one binds them to
 * production data, so a Layer that contributes a pass and forgets its
 * `FRAME_ORDER` line fails here instead of silently never drawing.
 */

import { describe, it, expect } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { renderTargetRows } from '../../../../src/services/gpu/renderTargets';

describe('checkFrameOrder — boot', () => {
  it('the app’s FRAME_ORDER passes the boot check', () => {
    // The swap format only decides the swap ROW's format, never an id, so any
    // valid format yields the same id list `startLoop` reads off the assembled
    // rows.
    const targetIds = renderTargetRows('bgra8unorm').map((row) => row.id);
    expect(() => checkFrameOrder(FRAME_ORDER, CONTENT_PASSES, targetIds)).not.toThrow();
  });
});
