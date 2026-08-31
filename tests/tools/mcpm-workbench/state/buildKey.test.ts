/**
 * buildKey — Viewport.tsx's rebuild-dirty check: two AppState snapshots must produce
 * DIFFERENT keys whenever any field a gizmo/slider edit can write into `grid` moves, or that
 * edit silently stops reaching the running sim (the regression this test exists to catch:
 * `manualRotation` was omitted until F2.5's rotate rings shipped — a rotate drag changed the
 * PENDING box `deriveGridBox` returns but never triggered a rebuild, so the running sim kept
 * simulating the old orientation forever).
 */
import { describe, expect, it } from 'vitest';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import { buildKey } from '../../../../tools/mcpm-workbench/src/state/buildKey';

describe('buildKey', () => {
  it('differs when only grid.manualRotation changes', () => {
    const before = buildKey(defaultAppState);
    const rotation: Vec4 = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const rotated = {
      ...defaultAppState,
      grid: { ...defaultAppState.grid, manualRotation: rotation },
    };

    expect(JSON.stringify(buildKey(rotated))).not.toBe(JSON.stringify(before));
  });

  // V1: manualVoxelSizeMpc replaced divisor as the resolution field — a missed
  // swap in this list means a resolution edit stops triggering a sim rebuild.
  it('differs when only grid.manualVoxelSizeMpc changes', () => {
    const before = buildKey(defaultAppState);
    const resized = {
      ...defaultAppState,
      grid: {
        ...defaultAppState.grid,
        manualVoxelSizeMpc: defaultAppState.grid.manualVoxelSizeMpc + 1,
      },
    };

    expect(JSON.stringify(buildKey(resized))).not.toBe(JSON.stringify(before));
  });
});
