import { describe, expect, it } from 'vitest';

import { horizonRectOf } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonRectOf';
import { NO_HORIZON_RECT } from '../../../../../../src/layers/body/textures/data/horizonRects';

describe('horizonRectOf', () => {
  it("reads lit for 'empty', never the ancestor rect the walk passed", () => {
    expect(horizonRectOf('empty')).toEqual(NO_HORIZON_RECT);
  });
});
