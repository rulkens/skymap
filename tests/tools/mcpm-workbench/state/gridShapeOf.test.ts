/**
 * gridShapeOf — the canonical projection buildKey/gridShapeKeyFor both serialize from. This
 * hand-lists the five fields as a tripwire: unlike buildKey.test.ts/gridShapeKeyFor.test.ts
 * (which only check "differs when a field changes" and would stay green if a field silently
 * dropped OUT of the projection), this catches that drop directly.
 */
import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import { gridShapeOf } from '../../../../tools/mcpm-workbench/src/state/gridShapeOf';

describe('gridShapeOf', () => {
  it('projects exactly the five grid-shape fields', () => {
    const shape = gridShapeOf(defaultAppState.grid);

    expect(Object.keys(shape).sort()).toEqual(
      [
        'manualCenterMpc',
        'manualRotation',
        'manualSizeMpc',
        'manualVoxelSizeMpc',
        'paddingMpc',
      ].sort(),
    );
  });
});
