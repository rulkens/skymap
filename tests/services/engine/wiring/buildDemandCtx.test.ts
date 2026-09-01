/**
 * buildDemandCtx — unit tests for the demand-context builder.
 *
 * The builder maps `EngineState` into the read surfaces a demand predicate
 * consults. These tests target the two non-trivial surfaces: `slotState`
 * (slot accessor + idle fallback) and `request` (the transient request-flag
 * set). `settings` is a direct passthrough and needs no behaviour test.
 *
 * Mocking strategy: inject a minimal `state` carrying only the slices the
 * builder reads — `settings`, `requests`, and `assetSlots`. No GPU
 * resources are involved.
 */

import { describe, it, expect } from 'vitest';
import { buildDemandCtx } from '../../../../src/services/engine/wiring/buildDemandCtx';
import { Source } from '../../../../src/data/sources';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RequestKey } from '../../../../src/@types/loading/RequestKey';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { SourceType } from '../../../../src/@types/data/SourceType';

/**
 * Build a minimal EngineState with only the fields buildDemandCtx reads.
 * `requests` defaults to empty, and the slot maps/fields to empty so
 * `slotState` falls back to 'idle' unless a test supplies a slot.  `tier`
 * lives top-level on `settings` (the builder itself never reads it).
 */
function makeState(
  opts: {
    requests?: Set<RequestKey>;
    points?: Map<SourceType, AssetSlot<unknown, unknown>>;
    famousGalaxiesMetaState?: LoadState<unknown>['kind'];
    pose?: { target: [number, number, number]; yaw: number; pitch: number; distance: number };
    simDays?: number;
  } = {},
): EngineState {
  const famousGalaxiesMeta =
    opts.famousGalaxiesMetaState === undefined
      ? null
      : ({ state: () => ({ kind: opts.famousGalaxiesMetaState }) } as unknown as AssetSlot<
          unknown,
          unknown
        >);
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
      volumes: { items: {} },
    },
    requests: opts.requests ?? new Set<RequestKey>(),
    assetSlots: {
      points: opts.points ?? new Map(),
      famousGalaxiesMeta,
    },
    cameraRuntime: {
      lastPose: { current: absoluteArm(pose) },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: opts.simDays ?? 0 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  } as unknown as EngineState;
}

describe('buildDemandCtx', () => {
  it('settings is the engine settings passthrough', () => {
    const state = makeState();
    const ctx = buildDemandCtx(state);
    // Identity passthrough — predicates read the live settings object.
    expect(ctx.settings).toBe(state.settings);
  });

  it('slotState returns idle for an absent slot', () => {
    // A not-yet-minted slot (null field, missing map entry) reads as 'idle' —
    // never loaded is exactly what idle means.
    const ctx = buildDemandCtx(makeState());
    expect(ctx.slotState('famousGalaxiesMeta')).toBe('idle');
    expect(ctx.slotState(Source.SDSS)).toBe('idle');
  });

  it('slotState reflects a present slot', () => {
    const ctx = buildDemandCtx(makeState({ famousGalaxiesMetaState: 'ready' }));
    expect(ctx.slotState('famousGalaxiesMeta')).toBe('ready');
  });

  it('request reflects the request flag set', () => {
    const state = makeState({ requests: new Set<RequestKey>(['paletteOpened']) });
    const ctx = buildDemandCtx(state);
    expect(ctx.request('paletteOpened')).toBe(true);

    const empty = buildDemandCtx(makeState());
    expect(empty.request('paletteOpened')).toBe(false);
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

  it('carries the live sim instant from cameraRuntime.lastRenderedSimDays', () => {
    // The proximity gate derives host body positions at this instant, so the
    // builder must forward the clock's last-rendered value verbatim (not the
    // epoch). A wiring that hard-coded J2000 here would fail.
    const ctx = buildDemandCtx(makeState({ simDays: 8000 }));
    expect(ctx.simDays).toBe(8000);
  });
});
