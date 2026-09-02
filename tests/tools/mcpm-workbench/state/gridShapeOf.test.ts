/**
 * gridShapeOf — the canonical projection `gridShapeKeyFor` serializes from, and the
 * field-level source of truth `watchSceneSaga`'s hand-enumerated trigger list has to stay
 * in sync with. This hand-lists the four fields as a tripwire: unlike
 * `gridShapeKeyFor.test.ts`/`watchSceneSaga.test.ts` (which only check "differs when a
 * field changes" and would stay green if a field silently dropped OUT of the projection),
 * this catches that drop directly. `paddingMpc` is deliberately NOT one of the four
 * (review-final.md minor 13): deriveGridBox always fits with padding 0, so it can never
 * move the derived box.
 */
import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import { gridShapeOf } from '../../../../tools/mcpm-workbench/src/state/gridShapeOf';

describe('gridShapeOf', () => {
  it('projects exactly the four grid-shape fields', () => {
    const shape = gridShapeOf(defaultAppState.grid);

    expect(Object.keys(shape).sort()).toEqual(
      ['manualCenterMpc', 'manualRotation', 'manualSizeMpc', 'manualVoxelSizeMpc'].sort(),
    );
  });
});
