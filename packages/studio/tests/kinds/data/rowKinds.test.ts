import { describe, it, expect } from 'vitest';

import { ROW_KINDS } from '../../../src/kinds/data/rowKinds';
import {
  aimAlong,
  all,
  atFocus,
  atPoint,
  dollyTo,
  dollyToId,
  fade,
  flyPath,
  focus,
  fork,
  frameTo,
  geodesic,
  hide,
  hold,
  lookAtId,
  moveTarget,
  moveTargetId,
  oscillate,
  rate,
  scene,
  seq,
  show,
  spin,
  spinToId,
  strafeId,
  tween,
  wait,
} from '../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../src/utils/animation/focusId';
import { setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { RowKind } from '../../../src/@types/rows/RowKind';
import type { RowSubjects } from '../../../src/@types/rows/RowSubjects';

const M31 = focusId('m31');

/** One sample per kind with every optional param the kind's fields may name filled in. */
const SAMPLES: { readonly [K in RowKind]: RowSubjects[K] } = {
  set: dollyTo(300, 4),
  setVec: moveTarget([12, -3, 0], 3),
  spin: spin('yaw', { by: 1.1, over: 6, loop: true }),
  rate: rate('yaw', { to: 0.024, over: 11 }),
  osc: oscillate('pitch', { amp: 0.09, period: 16, over: 10, fade: 2 }),
  aimAlong: aimAlong([0.6, 0.8, 0], 2),
  flyPath: flyPath([atFocus(M31), atPoint([1, 2, 3], 5)], { over: 24 }),
  geodesic: geodesic(
    { target: [0, 0, 0], distance: 950 },
    { rho: 1.4, velocity: 1, minMs: 1000, maxMs: 9000, ease: 'linear' },
    0.8,
    6,
  ),
  moveTargetId: moveTargetId(M31, 3),
  dollyToId: dollyToId(M31, 3, { scale: 0.8 }),
  lookAtId: lookAtId(M31, 2),
  strafeId: strafeId(M31, 30, 3),
  spinToId: spinToId(M31, { over: 2, turns: 1 }),
  focusId: focus(M31),
  show: show(['flow', 'label:milkyWay'], 1),
  hide: hide(['flow'], 0),
  fade: fade(['flow'], 0, 3),
  scene: scene(setFlowEnabled(true)),
  focus: { kind: 'focus', ref: { type: 'structure', id: 'galaxy-cluster-virgo' } },
  frameTo: frameTo('galactic', { over: 2 }),
  hold: hold(2),
  wait: wait(2),
  seq: seq([dollyTo(1, 2), dollyTo(2, 2)], { overlap: 1 }),
  all: all([dollyTo(1, 2), tween('yaw', { to: 1, over: 2 })]),
  fork: fork(oscillate('pitch', { amp: 0.09, period: 16 })),
  start: { target: [0, 0, 0], yaw: 0.5, pitch: -0.3, distance: 10 },
  waypoint: {
    ...atPoint([1, 2, 3], 5, { yaw: 1, pitch: 0, over: 2, linger: 0.5 }),
    last: false,
    pathLinger: 0.7,
  },
};
/** A waypoint's fields span both arms: the point sample above, and a subject one. */
const SUBJECT_WAYPOINT: RowSubjects['waypoint'] = { ...atFocus(M31), last: true, pathLinger: 0.7 };

const entries = Object.keys(SAMPLES) as RowKind[];

// The mapped `SAMPLES` type pairs each kind with its own subject; the loop loses that pairing.
const labelOf = (kind: RowKind) =>
  (ROW_KINDS[kind].label as (subject: unknown) => ReturnType<typeof ROW_KINDS.hold.label>)(
    SAMPLES[kind],
  );

describe('ROW_KINDS', () => {
  it('every kind labels a helper-built effect with a non-empty name of at most 11 characters', () => {
    for (const kind of entries) {
      const { name } = labelOf(kind);
      expect(name.length, kind).toBeGreaterThan(0);
      expect(name.length, `${kind}: "${name}"`).toBeLessThanOrEqual(11);
    }
  });

  it('labels follow the naming table', () => {
    expect(ROW_KINDS.set.label(dollyTo(300, 4))).toEqual({
      name: 'Distance',
      op: '→',
      value: '300 Mpc',
    });
    expect(ROW_KINDS.fade.label(fade(['flow'], 0, 3))).toEqual({
      name: 'Fade',
      op: '→',
      value: '0 %',
      qualifier: 'flow',
    });
    const bob = ROW_KINDS.osc.label(oscillate('pitch', { amp: 0.09, period: 16 }));
    expect(bob).toMatchObject({ name: 'Bob tilt', op: '±', value: '5.2° /16 s' });
    expect(ROW_KINDS.moveTargetId.label(moveTargetId(M31, 3))).toEqual({
      name: 'Look-at',
      op: '→',
      value: '',
      subject: 'm31',
    });
    expect(ROW_KINDS.waypoint.label(SAMPLES.waypoint).name).toBe('Pass');
    expect(ROW_KINDS.waypoint.label({ ...SAMPLES.waypoint, last: true }).name).toBe('Settle');
    const overlapped = seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: 1 });
    expect(ROW_KINDS.seq.label(overlapped)).toEqual({
      name: 'Sequence',
      op: '',
      value: '',
      qualifier: 'blend 1 s',
    });
  });

  it("a group writes the union of its children's families", () => {
    const group = all([dollyTo(1, 2), tween('yaw', { to: 1, over: 2 }), moveTarget([0, 0, 0], 2)]);
    expect(ROW_KINDS.all.writes(group)).toEqual(['distance', 'lookAt', 'turn']);
    expect(ROW_KINDS.fork.writes(fork(show(['flow'])))).toEqual(['layers']);
  });

  it("every field's param exists on its kind's helper-built sample", () => {
    for (const kind of entries) {
      for (const field of ROW_KINDS[kind].fields) {
        const arms = kind === 'waypoint' ? [SAMPLES.waypoint, SUBJECT_WAYPOINT] : [SAMPLES[kind]];
        expect(
          arms.some((arm) => typeof arm === 'object' && field.param in arm),
          `${kind}.${field.param}`,
        ).toBe(true);
      }
    }
  });

  it('a subject-bound kind reads its resolved effect and ignores any other kind', () => {
    const aim: Effect = all([
      tween('yaw', { to: Math.PI / 2, over: 2 }),
      tween('pitch', { to: -0.5, over: 2 }),
    ]);
    const objects = { famous: [], aliases: [], structures: [], layerRows: [], refNames: {} };
    expect(ROW_KINDS.lookAtId.resolved?.(aim, objects)).toBe('90°, −29°');
    expect(ROW_KINDS.lookAtId.resolved?.(hold(1), objects)).toBe('');
    expect(ROW_KINDS.moveTargetId.resolved?.(moveTarget([10, 0, 0], 3), objects)).toBe(
      '10, 0, 0 Mpc',
    );
  });
});
