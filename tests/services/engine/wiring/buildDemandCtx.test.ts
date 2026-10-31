/**
 * buildDemandCtx — unit tests for the demand-context builder.
 *
 * Targets the two non-trivial surfaces: `slotState` (slot accessor + idle fallback) and `request` (the
 * transient request-flag set). `settings` is a direct passthrough. A minimal `state` carries only
 * `settings`, `ui` and `slotsByKey`.
 */

import { describe, it, expect } from 'vitest';
import { buildDemandCtx } from '../../../../src/services/engine/wiring/buildDemandCtx';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { UiState } from '../../../../src/@types/ui/UiState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { SelectionState } from '../../../../src/@types/store/SelectionState';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';

function makeState(
  opts: {
    paletteOpen?: boolean;
    famousGalaxiesMetaState?: LoadState<unknown>['kind'];
    pose?: { target: [number, number, number]; yaw: number; pitch: number; distance: number };
    simDays?: number;
    selection?: Partial<SelectionState>;
  } = {},
): EngineState {
  const slotsByKey = new Map<AssetKey, AssetSlot<unknown, unknown>>(
    opts.famousGalaxiesMetaState === undefined
      ? []
      : [
          [
            'famousGalaxiesMeta',
            { state: () => ({ kind: opts.famousGalaxiesMetaState }) } as unknown as AssetSlot<
              unknown,
              unknown
            >,
          ],
        ],
  );
  const pose = opts.pose ?? {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 100,
  };
  return {
    settings: {
      marker: 'sentinel',
      galaxyCatalogs: { items: {} },
      cosmicWebDensity: { items: {} },
    },
    ui: { paletteOpen: opts.paletteOpen ?? false } as UiState,
    terrainHeightAt: datumOnlyTerrainHeight,
    cameraRuntime: {
      register: { pose: absoluteArm(pose) },
      outputs: {
        displayed: absoluteArm(pose),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
        simDays: opts.simDays ?? 0,
        upBasis: ORIENTATION_FRAMES.ecliptic,
      },
    },
    slotsByKey,
    selection: { hover: null, select: null, focus: null, ...opts.selection },
  } as unknown as EngineState;
}

describe('buildDemandCtx', () => {
  it('slotState reflects a present slot', () => {
    const ctx = buildDemandCtx(makeState({ famousGalaxiesMetaState: 'ready' }));
    expect(ctx.slotState('famousGalaxiesMeta')).toBe('ready');
  });

  it('derives cameraPosMpc as the world eye position, not the focus target', () => {
    // The eye sits at target + distance·dir. At yaw=0,pitch=0 the direction is
    // +Z, so a target offset plus distance lands the eye at [tx, ty, tz+d]. This
    // pins that the builder reports the derived eye — a wiring that returned the
    // raw target ([1,2,3]) or the distance scalar would fail here.
    const ctx = buildDemandCtx(
      makeState({ pose: { target: [1, 2, 3], yaw: 0, pitch: 0, distance: 10 } }),
    );
    expect(ctx.cameraPosMpc[0]).toBeCloseTo(1);
    expect(ctx.cameraPosMpc[1]).toBeCloseTo(2);
    expect(ctx.cameraPosMpc[2]).toBeCloseTo(13);
  });

  it('carries the live sim instant from cameraRuntime.outputs.simDays', () => {
    // The proximity gate derives host body positions at this instant, so the
    // builder must forward the clock's last-rendered value verbatim (not the
    // epoch). A wiring that hard-coded J2000 here would fail.
    const ctx = buildDemandCtx(makeState({ simDays: 8000 }));
    expect(ctx.simDays).toBe(8000);
  });

  it('selectedKinds holds the select and focus kinds, never hover', () => {
    const ctx = buildDemandCtx(
      makeState({
        selection: {
          select: { type: 'satellite', noradId: 25544 },
          focus: { type: 'body', id: SCENE_EARTH.id },
          hover: { type: 'milkyWay' },
        },
      }),
    );
    expect([...ctx.selectedKinds].sort()).toEqual(['body', 'satellite']);
  });
});
