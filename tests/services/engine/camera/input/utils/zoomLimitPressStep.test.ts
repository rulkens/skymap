/**
 * zoomLimitPressStep — what the drain cannot reach on its own: a run pressed against one edge
 * must not carry into the other, whichever way a regime change got the eye there.
 */

import { describe, it, expect } from 'vitest';

import { zoomLimitPressStep } from '../../../../../../src/services/engine/camera/input/utils/zoomLimitPressStep';
import { ZOOM_LIMIT_PUSH_LN } from '../../../../../../src/data/input/zoomLimitPushLn';
import type { ZoomLimitPush } from '../../../../../../src/@types/camera/arms/ZoomLimitPush';

const OUT = { edge: 'out' } as ZoomLimitPush;
const stale = { lnZoom: ZOOM_LIMIT_PUSH_LN / 2, fresh: false };

describe('zoomLimitPressStep', () => {
  it('a press on the other edge starts the count over', () => {
    const nearlyFullIn = { edge: 'in', ln: ZOOM_LIMIT_PUSH_LN * 0.9 } as const;
    expect(zoomLimitPressStep(nearlyFullIn, OUT, stale)).toEqual({
      press: { edge: 'out', ln: ZOOM_LIMIT_PUSH_LN / 2 },
      push: null,
    });
    const nearlyFullOut = { edge: 'out', ln: ZOOM_LIMIT_PUSH_LN * 0.9 } as const;
    expect(zoomLimitPressStep(nearlyFullOut, OUT, stale).push).toBe(OUT);
  });
});
