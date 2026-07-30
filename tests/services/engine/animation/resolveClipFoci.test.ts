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
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FOV_Y = 0.8; // radians — arbitrary; shared by all tests

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

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
    const outer = resolved.timeline[0];
    if (outer!.kind !== 'all') throw new Error('expected all');
    expect(outer.children[1]).toMatchObject({ kind: 'setVec', ch: 'target' });
  });

  it('id-bearing leaf nested under fork is rewritten', () => {
    const id = focusId('cluster-virgo');
    const clip: ClipData = {
      timeline: [fork(focus(id))],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
    const outer = resolved.timeline[0];
    if (outer!.kind !== 'fork') throw new Error('expected fork');
    expect(outer.child).toEqual({ kind: 'focus', ref: { type: 'structure', id: 'cluster-virgo' } });
  });

  it('non-focus leaves inside seq pass through unchanged', () => {
    const clip: ClipData = {
      timeline: [seq([hold(2), hide(['flow'])])],
    };
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);

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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, { ...POSE, target: [10, 0, 10] });

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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);

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
    expect(() => resolveClipFoci(clip, DEPS, FOV_Y, { ...POSE, target: [10, -20, 0] })).toThrow(
      /vertical/,
    );
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
    expect(() => resolveClipFoci(clip, DEPS, FOV_Y, POSE)).toThrow(/no-such-object/);
  });

  it('throws when moveTargetId cannot resolve the id', () => {
    const id = focusId('cluster-unknown-xyz');
    const clip: ClipData = { timeline: [moveTargetId(id, 2)] };
    expect(() => resolveClipFoci(clip, DEPS, FOV_Y, POSE)).toThrow(/cluster-unknown-xyz/);
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
    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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

    const resolved = resolveClipFoci(clip, DEPS, FOV_Y, POSE);
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
