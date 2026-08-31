/**
 * resolveClipFoci — unit tests for the id-bearing Effect rewrite pass.
 *
 * Every test exercises one contract:
 *
 *   - `moveTargetId` and `dollyToId` rewrite to concrete `setVec`/`set` actions
 *     whose `to` values come from `focusFraming`.
 *   - `focusId(id)` rewrites to `{ kind: 'focus', ref }`.
 *   - `focusId(null)` rewrites to `{ kind: 'focus', ref: null }`.
 *   - Nesting under `seq`, `all`, `fork` is recursed into correctly.
 *   - Leaves that carry no focus id pass through unchanged.
 *
 * ### Fixture strategy
 *
 * We build a minimal `ResolveDeps` that resolves a single structure id
 * ('cluster-virgo') to a known `StructureInfo` record. That structure's
 * `worldPos` and `physicalRadiusMpc` are chosen so `focusFraming` returns
 * predictable values we can assert against using `structureFocusDistance`.
 * This avoids duplicating `focusFraming`'s framing math in the tests and
 * makes the assertions self-documenting.
 *
 * `resolveFocusId` and `extractSelectionRow` are NOT mocked — we use their
 * real implementations so the chain `id → ref → row → framing` is integration-
 * tested end to end. Only the `ResolveDeps` bag itself is a fixture.
 */

import { describe, it, expect } from 'vitest';
import { resolveClipFoci } from '../../../../src/services/engine/animation/resolveClipFoci';
import {
  moveTargetId,
  dollyToId,
  focus,
  lookAtId,
  strafeId,
  spinToId,
  aimAlong,
  seq,
  all,
  fork,
  hold,
  hide,
  flyPath,
  atFocus,
  atPoint,
} from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { GALACTIC_DISC_FORWARD } from '../../../../src/services/engine/camera/cameraFraming';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FOV_Y = 0.8; // radians — arbitrary; shared by all tests

// The sim instant threaded to `extractSelectionRow`'s body arm — arbitrary
// here, since no fixture in this file resolves a body ref (only structures).
const SIM_DAYS = 2451545; // J2000, an arbitrary fixed instant

// The live camera pose at resolve time — `lookAtId` bears from its target,
// `strafeId` scales degrees into Mpc by its distance. Most tests park the
// target at the origin, which makes bearing assertions trivial.
const ORIGIN: [number, number, number] = [0, 0, 0];
const POSE: CameraPose = { target: ORIGIN, yaw: 0, pitch: 0, distance: 5 };

/**
 * A minimal structure that `focusFraming` will resolve to a predictable pose.
 * Using `worldPos: [10, 0, 0]` makes the `target` assertion simple.
 * `physicalRadiusMpc` is used as the framing radius (no `apparentRadiusMpc`
 * field present so `focusFraming` falls back to `physicalRadiusMpc`).
 */
const VIRGO: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'cluster-virgo',
  name: 'Virgo Cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 4,
} as StructureInfo;

/**
 * `ResolveDeps` that resolves 'cluster-virgo' via the structure path used by
 * `resolveFocusId` (the `${category}-${seedId}` prefix test). No catalogs
 * are needed because no galaxy ids are tested here — only structures.
 */
const DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: (id) => (id === 'cluster-virgo' ? VIRGO : null) },
  stars: { current: () => null },
};

// Pre-computed expected framing values (mirrors what focusFraming returns for VIRGO):
const EXPECTED_TARGET: [number, number, number] = [10, 0, 0];
const EXPECTED_DISTANCE = structureFocusDistance(4, FOV_Y);

// ---------------------------------------------------------------------------
// Test 1 — rewrites moveTargetId / dollyToId to concrete camera actions
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites moveTargetId/dollyToId to concrete camera actions', () => {
  it('all([moveTargetId, dollyToId]) resolves to all([setVec ch:target, set ch:distance])', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [
        all([moveTargetId(id, 3, 'easeInOutCubic'), dollyToId(id, 3, { ease: 'easeInOutCubic' })]),
      ],
    };

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const outer = resolved.timeline[0];
    expect(outer).toBeDefined();
    expect(outer!.kind).toBe('all');
    // Narrow to the all arm to access children.
    if (outer!.kind !== 'all') throw new Error('not an all');

    const [targetAction, distanceAction] = outer.children;

    // moveTargetId → setVec ch:'target'
    expect(targetAction).toMatchObject({
      kind: 'setVec',
      ch: 'target',
      to: EXPECTED_TARGET,
      over: 3,
      ease: 'easeInOutCubic',
    });

    // dollyToId → set ch:'distance'
    expect(distanceAction).toMatchObject({
      kind: 'set',
      ch: 'distance',
      to: EXPECTED_DISTANCE,
      over: 3,
      ease: 'easeInOutCubic',
    });
  });

  it('dollyToId scale multiplies the resolved framing distance', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [dollyToId(id, 2, { scale: 0.5 })],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    expect(resolved.timeline[0]).toMatchObject({
      kind: 'set',
      ch: 'distance',
      to: EXPECTED_DISTANCE * 0.5,
      over: 2,
    });
  });

  it('ease and over are preserved on the resolved action', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [moveTargetId(id, 7, 'easeInCubic')],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    expect(resolved.timeline[0]).toMatchObject({
      kind: 'setVec',
      ch: 'target',
      over: 7,
      ease: 'easeInCubic',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2 — rewrites focusId cue to a focus ref cue
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites a focusId cue to a focus ref cue', () => {
  it('focusId(id) resolves to { kind:"focus", ref: SelectionRef }', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [focus(id)],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    expect(resolved.timeline[0]).toEqual({
      kind: 'focus',
      ref: { type: 'structure', id: 'cluster-virgo' },
    });
  });
});

// ---------------------------------------------------------------------------
// Test 3 — focusId(null) resolves to focus(null)
// ---------------------------------------------------------------------------

describe('resolveClipFoci resolves focusId(null) to focus(null)', () => {
  it('focusId(null) → { kind:"focus", ref: null }', () => {
    const clip: ClipData = {
      timeline: [focus(null)],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    expect(resolved.timeline[0]).toEqual({ kind: 'focus', ref: null });
  });
});

// ---------------------------------------------------------------------------
// Test 4 — recurses into seq / all / fork
// ---------------------------------------------------------------------------

describe('resolveClipFoci recurses into seq/all/fork', () => {
  it('id-bearing leaf nested under seq is rewritten', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [seq([hold(1), dollyToId(id, 2)])],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const outer = resolved.timeline[0];
    if (outer!.kind !== 'seq') throw new Error('expected seq');
    expect(outer.children[1]).toMatchObject({
      kind: 'set',
      ch: 'distance',
      to: EXPECTED_DISTANCE,
    });
  });

  it('id-bearing leaf nested under all is rewritten', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [all([hold(1), moveTargetId(id, 2)])],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const outer = resolved.timeline[0];
    if (outer!.kind !== 'all') throw new Error('expected all');
    expect(outer.children[1]).toMatchObject({ kind: 'setVec', ch: 'target' });
  });

  it('id-bearing leaf nested under fork is rewritten', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [fork(focus(id))],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const outer = resolved.timeline[0];
    if (outer!.kind !== 'fork') throw new Error('expected fork');
    expect(outer.child).toEqual({ kind: 'focus', ref: { type: 'structure', id: 'cluster-virgo' } });
  });

  it('non-focus leaves inside seq pass through unchanged', () => {
    const clip: ClipData = {
      timeline: [seq([hold(2), hide(['flow'])])],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    // No id-bearing effects — the output must equal the input structurally.
    expect(resolved.timeline).toEqual(clip.timeline);
  });
});

// ---------------------------------------------------------------------------
// Test 4b — lookAtId resolves to an aimAt bearing from the live orbit target
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites lookAtId to an aimAt bearing', () => {
  it('resolves to concurrent yaw/pitch tweens aiming from the orbit target at the subject', () => {
    // Virgo frames at [10,0,0]. Looking from the origin, the camera must aim
    // along +X: orbitAnglesLookingAlong([1,0,0]) → yaw −π/2, pitch 0.
    const clip: ClipData = { timeline: [lookAtId(focusId('cluster-virgo'), 3, 'easeOutCubic')] };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);

    const outer = resolved.timeline[0]!;
    if (outer.kind !== 'all') throw new Error('expected aimAt to produce an all block');
    expect(outer.children[0]).toMatchObject({
      kind: 'set',
      ch: 'yaw',
      over: 3,
      ease: 'easeOutCubic',
    });
    expect((outer.children[0] as { to: number }).to).toBeCloseTo(-Math.PI / 2, 10);
    expect(outer.children[1]).toMatchObject({
      kind: 'set',
      ch: 'pitch',
      over: 3,
      ease: 'easeOutCubic',
    });
    expect((outer.children[1] as { to: number }).to).toBeCloseTo(0, 10);
  });

  it('the bearing is measured from the passed pose target, not the origin', () => {
    // From [10,0,10] the subject at [10,0,0] lies along −Z: yaw π, pitch 0.
    const clip: ClipData = { timeline: [lookAtId(focusId('cluster-virgo'), 2)] };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, { ...POSE, target: [10, 0, 10] }, SIM_DAYS);

    const outer = resolved.timeline[0]!;
    if (outer.kind !== 'all') throw new Error('expected aimAt to produce an all block');
    const yaw = (outer.children[0] as { to: number }).to;
    // atan2(0, +1) = 0 for dir = -forward = [0,0,1] → yaw 0.
    expect(yaw).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// Test 4c — strafeId resolves to a lateral moveTarget
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites strafeId to a lateral moveTarget', () => {
  it('moves the target along the bearing-right axis by tan(byDeg) × distance', () => {
    // Virgo frames at [10,0,0]; from the origin the bearing forward is +X, so
    // bearing-right (forward × worldUp) is +Z. byDeg 45 at pose distance 5 →
    // tan(45°) × 5 = 5 Mpc: the target strafes to [0,0,5].
    const clip: ClipData = {
      timeline: [strafeId(focusId('cluster-virgo'), 45, 3, 'easeOutCubic')],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);

    const eff = resolved.timeline[0]!;
    expect(eff).toMatchObject({ kind: 'setVec', ch: 'target', over: 3, ease: 'easeOutCubic' });
    const to = (eff as { to: [number, number, number] }).to;
    expect(to[0]).toBeCloseTo(0, 10);
    expect(to[1]).toBeCloseTo(0, 10);
    expect(to[2]).toBeCloseTo(5, 10);
  });

  it('throws when the bearing is vertical (right axis undefined)', () => {
    // Subject straight above the pose target: forward ∥ worldUp, no lateral
    // direction exists. A descriptive throw beats a NaN target.
    const clip: ClipData = { timeline: [strafeId(focusId('cluster-virgo'), 10, 3)] };
    expect(() =>
      resolveClipFoci(clip, DEPS, FOV_Y, { ...POSE, target: [10, -20, 0] }, SIM_DAYS),
    ).toThrow(/vertical/);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — throws on unresolvable id
// ---------------------------------------------------------------------------

describe('resolveClipFoci throws on unresolvable id', () => {
  it('throws when a non-null focusId does not resolve', () => {
    // 'no-such-object' passes the [a-z0-9_-]+ char-class gate and routes to
    // resolveFamous, which scans famousGalaxiesMeta (empty in DEPS) and returns null —
    // the only id format for which resolveFocusId itself returns null against
    // this fixture. Structure-prefixed ids (cluster-*, etc.) return a non-null
    // phantom ref without any existence check, so they would not trigger the throw.
    const id = focusId('no-such-object');
    const clip: ClipData = { timeline: [focus(id)] };
    expect(() => resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS)).toThrow(/no-such-object/);
  });

  it('throws when moveTargetId cannot resolve the id', () => {
    const id = focusId('cluster-unknown-xyz');
    const clip: ClipData = { timeline: [moveTargetId(id, 2)] };
    expect(() => resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS)).toThrow(/cluster-unknown-xyz/);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — ClipData fields other than timeline pass through unchanged
// ---------------------------------------------------------------------------

describe('resolveClipFoci preserves ClipData metadata', () => {
  it('the start pose passes through unchanged', () => {
    const clip: ClipData = {
      start: { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 },
      timeline: [hold(1)],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    expect(resolved.start).toBe(clip.start);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — flyPath: id-form waypoints resolve, at-form pass through, opts kept
// ---------------------------------------------------------------------------

describe('resolveClipFoci resolves flyPath waypoints', () => {
  it('rewrites atFocus to at-form and leaves atPoint untouched, preserving over/angles', () => {
    const clip: ClipData = {
      timeline: [
        flyPath(
          [atFocus(focusId('cluster-virgo'), { over: 2 }), atPoint([5, 5, 5], 3, { pitch: 0.2 })],
          { over: 5, ease: 'easeInOutCubic' },
        ),
      ],
    };

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const fp = resolved.timeline[0]!;
    if (fp.kind !== 'flyPath') throw new Error('expected a flyPath effect');

    // Waypoint 0: the focus id resolved to Virgo's framed pose; over preserved.
    const w0 = fp.waypoints[0]!;
    if (!('at' in w0)) throw new Error('waypoint 0 should be resolved to at-form');
    expect(w0.at).toEqual(EXPECTED_TARGET);
    expect(w0.distance).toBeCloseTo(EXPECTED_DISTANCE, 6);
    expect(w0.over).toBe(2);

    // Waypoint 1: the concrete point passed through unchanged.
    const w1 = fp.waypoints[1]!;
    if (!('at' in w1)) throw new Error('waypoint 1 should remain at-form');
    expect(w1.at).toEqual([5, 5, 5]);
    expect(w1.distance).toBe(3);
    expect(w1.pitch).toBe(0.2);

    // The path-level over/ease pass through.
    expect(fp.over).toBe(5);
    expect(fp.ease).toBe('easeInOutCubic');
  });

  it('carries path-level align/rampSec/linger/spline/turnDelay and per-waypoint linger through the rewrite', () => {
    // Regression: the rewrite once rebuilt the flyPath as {kind,waypoints,over,
    // ease}, silently dropping the pacing knobs — only the inspector masked it by
    // re-injecting via applyPathTuning. Normal playback must keep them.
    const clip: ClipData = {
      timeline: [
        flyPath(
          [
            atFocus(focusId('cluster-virgo'), { linger: 0.8 }), // per-target brake
            atPoint([5, 5, 5], 3),
          ],
          {
            over: 5,
            ease: 'easeInOutCubic',
            align: 1.1,
            rampSec: 0.9,
            linger: 0.4,
            lingerSec: 3,
            spline: { kind: 'causalHermite', turnDelay: 1.7 },
            passBy: { offset: 4, dir: 'above' },
          },
        ),
      ],
    };

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const fp = resolved.timeline[0]!;
    if (fp.kind !== 'flyPath') throw new Error('expected a flyPath effect');

    expect(fp.align).toBe(1.1);
    expect(fp.rampSec).toBe(0.9);
    expect(fp.linger).toBe(0.4);
    expect(fp.lingerSec).toBe(3);
    expect(fp.spline).toEqual({ kind: 'causalHermite', turnDelay: 1.7 });
    expect(fp.passBy).toEqual({ offset: 4, dir: 'above' });

    // The per-waypoint linger survives onto the resolved at-form waypoint. VIRGO
    // is a STRUCTURE, so its pass-by radius resolves to 0 (focusFraming) — a
    // flyPath flies into a cluster, never past it — and the offset loop skips it.
    const w0 = fp.waypoints[0]!;
    if (!('at' in w0)) throw new Error('waypoint 0 should be resolved to at-form');
    expect(w0.linger).toBe(0.8);
    expect(w0.radius).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — spinToId resolves to a bearing-aware yaw spin
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites spinToId to a bearing-aware yaw spin', () => {
  it('the landing yaw (liveYaw + by) faces the focus', () => {
    // Virgo sits at [10,0,0]; from the origin that is world +X. A nonzero live
    // yaw makes this a real test of `by`, not a coincidence of yaw already
    // being 0.
    const id = focusId('cluster-virgo');
    const livePose: CameraPose = { ...POSE, yaw: 0.5 };
    const clip: ClipData = { timeline: [spinToId(id, { over: 3 })] };

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, livePose, SIM_DAYS);
    const eff = resolved.timeline[0]!;
    if (eff.kind !== 'spin') throw new Error('expected a spin effect');
    expect(eff.ch).toBe('yaw');
    expect(eff.over).toBe(3);
    expect(eff.ease).toBe('easeInOutCubic');

    const landingYaw = livePose.yaw + eff.by;
    const dir = yawPitchToDir(landingYaw, livePose.pitch); // target→eye
    const aim: Vec3 = [-dir[0], -dir[1], -dir[2]];
    expect(aim[0]).toBeCloseTo(1, 10);
    expect(aim[1]).toBeCloseTo(0, 10);
    expect(aim[2]).toBeCloseTo(0, 10);
  });

  it('honours turns: turns:-1 yields a by exactly 2π less than turns:0', () => {
    const id = focusId('cluster-virgo');
    const livePose: CameraPose = { ...POSE, yaw: 0.5 };

    const byDefault = resolveSpinBy(spinToId(id, { over: 3 }), livePose);
    const byLongWay = resolveSpinBy(spinToId(id, { over: 3, turns: -1 }), livePose);

    expect(byLongWay).toBeCloseTo(byDefault - Math.PI * 2, 10);
  });

  it('lands the same world bearing under two different bases — the basis drops out', () => {
    // The cross product of two frames' poles is orthogonal to BOTH poles.
    // Placing the focus along it makes the bearing's pitch exactly 0 under
    // EITHER basis, so decoding the landing yaw at pitch 0 recovers the aim
    // exactly regardless of which basis resolved it — a ground-truth
    // expectation built from the poles, not from calling the resolver twice
    // and comparing its own output to itself.
    const poleOf = (basis: Mat3): Vec3 => [basis[3]!, basis[4]!, basis[5]!];
    const cross = (a: Vec3, b: Vec3): Vec3 => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const poleEcliptic = poleOf(ORIENTATION_FRAMES.ecliptic);
    const poleGalactic = poleOf(ORIENTATION_FRAMES.galactic);
    const raw = cross(poleEcliptic, poleGalactic);
    const m = Math.hypot(raw[0], raw[1], raw[2]);
    const forward: Vec3 = [raw[0] / m, raw[1] / m, raw[2] / m];

    const northStar: StructureInfo = {
      type: 'structure',
      category: 'cluster',
      id: 'cluster-northstar',
      name: 'North Star',
      worldPos: [forward[0] * 10, forward[1] * 10, forward[2] * 10],
      featured: true,
      physicalRadiusMpc: 3,
    } as StructureInfo;
    const deps: ResolveDeps = {
      ...DEPS,
      structures: { byId: (sid) => (sid === 'cluster-northstar' ? northStar : null) },
    };

    const id = focusId('cluster-northstar');
    const livePose: CameraPose = { target: [0, 0, 0], yaw: 1.0, pitch: 0, distance: 5 };
    const clip: ClipData = { timeline: [spinToId(id, { over: 3 })] };

    const resolvedEcliptic = resolveClipFoci(
      clip,
      deps,
      FOV_Y,
      livePose,
      SIM_DAYS,
      ORIENTATION_FRAMES.ecliptic,
    );
    const resolvedGalactic = resolveClipFoci(
      clip,
      deps,
      FOV_Y,
      livePose,
      SIM_DAYS,
      ORIENTATION_FRAMES.galactic,
    );
    const effE = resolvedEcliptic.timeline[0]!;
    const effG = resolvedGalactic.timeline[0]!;
    if (effE.kind !== 'spin' || effG.kind !== 'spin') throw new Error('expected spin effects');

    const decodeWorld = (yaw: number, pitch: number, basis: Mat3): Vec3 =>
      rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), basis);

    const dirE = decodeWorld(livePose.yaw + effE.by, livePose.pitch, ORIENTATION_FRAMES.ecliptic);
    const dirG = decodeWorld(livePose.yaw + effG.by, livePose.pitch, ORIENTATION_FRAMES.galactic);

    // Both landings decode to the SAME world direction — the basis dropped out.
    expect(dirG[0]).toBeCloseTo(dirE[0], 6);
    expect(dirG[1]).toBeCloseTo(dirE[1], 6);
    expect(dirG[2]).toBeCloseTo(dirE[2], 6);

    // And that shared direction is the true world sightline to the focus
    // (aim = -dir), computed independently from the poles above.
    expect(-dirE[0]).toBeCloseTo(forward[0], 6);
    expect(-dirE[1]).toBeCloseTo(forward[1], 6);
    expect(-dirE[2]).toBeCloseTo(forward[2], 6);
  });
});

/** Resolve a single spinToId effect and return its `by` delta. */
function resolveSpinBy(effect: ReturnType<typeof spinToId>, livePose: CameraPose): number {
  const clip: ClipData = { timeline: [effect] };
  const resolved = resolveClipFoci(clip, DEPS, FOV_Y, livePose, SIM_DAYS);
  const eff = resolved.timeline[0]!;
  if (eff.kind !== 'spin') throw new Error('expected a spin effect');
  return eff.by;
}

// ---------------------------------------------------------------------------
// Test 4d — aimAlong resolves to an aimAt bearing along a FIXED world
// direction, independent of the live pose (unlike lookAtId).
// ---------------------------------------------------------------------------

describe('resolveClipFoci rewrites aimAlong to an aimAt bearing', () => {
  it('resolves to concurrent yaw/pitch tweens aiming along the given world direction', () => {
    // Forward [1,0,0] under identity: dir = -forward, yaw = atan2(-1,0) = -π/2.
    const clip: ClipData = { timeline: [aimAlong([1, 0, 0], 3, 'easeOutCubic')] };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);

    const outer = resolved.timeline[0]!;
    if (outer.kind !== 'all') throw new Error('expected aimAt to produce an all block');
    expect(outer.children[0]).toMatchObject({
      kind: 'set',
      ch: 'yaw',
      over: 3,
      ease: 'easeOutCubic',
    });
    expect((outer.children[0] as { to: number }).to).toBeCloseTo(-Math.PI / 2, 10);
    expect(outer.children[1]).toMatchObject({
      kind: 'set',
      ch: 'pitch',
      over: 3,
      ease: 'easeOutCubic',
    });
    expect((outer.children[1] as { to: number }).to).toBeCloseTo(0, 10);
  });

  it('the bearing does NOT depend on the live pose target — unlike lookAtId', () => {
    // Two wildly different `from` poses (target AND yaw both differ) must
    // resolve to the identical bearing: aimAlong carries no target lookup, so
    // it is safe for a cold-open snap where the pre-clip pose is arbitrary.
    const clip: ClipData = { timeline: [aimAlong([1, 0, 0], 3)] };
    const nearby = resolveClipFoci(clip, DEPS, FOV_Y, POSE, SIM_DAYS);
    const farAway = resolveClipFoci(
      clip,
      DEPS,
      FOV_Y,
      { target: [500, -300, 900], yaw: 2.7, pitch: -0.4, distance: 4000 },
      SIM_DAYS,
    );

    const yawOf = (r: ClipData): number => {
      const outer = r.timeline[0]!;
      if (outer.kind !== 'all') throw new Error('expected an all block');
      return (outer.children[0] as { to: number }).to;
    };
    expect(yawOf(farAway)).toBeCloseTo(yawOf(nearby), 12);
  });

  it('lands the same world bearing under two different bases — the basis drops out', () => {
    // Uses the real production constant (not an arbitrary literal) so this
    // test also exercises the exact value both `openingTitle` and
    // `homeAgain` depend on — precision itself is pinned separately in
    // cameraFraming.test.ts (the derivation-guard test).
    const clip: ClipData = { timeline: [aimAlong(GALACTIC_DISC_FORWARD, 3)] };

    const resolvedEcliptic = resolveClipFoci(
      clip,
      DEPS,
      FOV_Y,
      POSE,
      SIM_DAYS,
      ORIENTATION_FRAMES.ecliptic,
    );
    const resolvedGalactic = resolveClipFoci(
      clip,
      DEPS,
      FOV_Y,
      POSE,
      SIM_DAYS,
      ORIENTATION_FRAMES.galactic,
    );
    const effE = resolvedEcliptic.timeline[0]!;
    const effG = resolvedGalactic.timeline[0]!;
    if (effE.kind !== 'all' || effG.kind !== 'all') throw new Error('expected all blocks');

    const bearingOf = (outer: typeof effE, basis: Mat3) => {
      const yaw = (outer.children[0] as { to: number }).to;
      const pitch = (outer.children[1] as { to: number }).to;
      return rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), basis);
    };
    const dirE = bearingOf(effE, ORIENTATION_FRAMES.ecliptic);
    const dirG = bearingOf(effG, ORIENTATION_FRAMES.galactic);

    expect(dirG[0]).toBeCloseTo(dirE[0], 6);
    expect(dirG[1]).toBeCloseTo(dirE[1], 6);
    expect(dirG[2]).toBeCloseTo(dirE[2], 6);
  });
});
