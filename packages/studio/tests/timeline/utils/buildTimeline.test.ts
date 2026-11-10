import { describe, it, expect } from 'vitest';

import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { ClipCompileError } from '../../../../../src/services/engine/animation/ClipCompileError';
import {
  aimAt,
  all,
  atPoint,
  dollyTo,
  flyPath,
  fork,
  hold,
  lookAtId,
  moveTarget,
  oscillate,
  rate,
  seq,
  tween,
} from '../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../src/utils/animation/focusId';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { TimelineCompile } from '../../../src/@types/rows/TimelineCompile';
import type { TimelineRow } from '../../../src/@types/rows/TimelineRow';

/** The real compiler over `resolved`, in the shape the timeline model takes. */
function compiled(resolved: ClipData): TimelineCompile {
  try {
    const clip = compileClip(resolved);
    return { ok: true, spans: clip.spans, durationSec: clip.durationSec };
  } catch (error) {
    if (!(error instanceof ClipCompileError)) throw error;
    const { reason, paths, channel, message, spans } = error;
    return { ok: false, spans, error: { reason, paths, message, ...(channel ? { channel } : {}) } };
  }
}

const rowOf = (rows: readonly TimelineRow[], id: string): TimelineRow => {
  const row = rows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`no row ${id} in ${rows.map((r) => r.id).join(', ')}`);
  return row;
};

describe('buildTimeline', () => {
  it("an overlapped seq's second child starts overlap seconds early", () => {
    const draft: ClipData = {
      timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: 1 })],
    };
    const { rows, durationSec } = buildTimeline(draft, compiled(draft), []);
    expect(rowOf(rows, 'e:0.0')).toMatchObject({ startSec: 0, endSec: 4, duration: '4 s' });
    expect(rowOf(rows, 'e:0.1')).toMatchObject({ startSec: 3, endSec: 7 });
    expect(rowOf(rows, 'e:0').label.value).toBe('Distance ×2 · blend 1 s');
    expect(durationSec).toBe(7);
  });

  it('collapsing a group hides its descendants and keeps the group row', () => {
    const draft: ClipData = { timeline: [all([dollyTo(1, 2), tween('yaw', { to: 1, over: 2 })])] };
    const { rows } = buildTimeline(draft, compiled(draft), ['e:0']);
    expect(rows.map((r) => r.id)).toEqual(['start', 'e:0']);
    expect(rowOf(rows, 'e:0')).toMatchObject({ expandable: true, collapsed: true });
  });

  it('fork children are background rows with their own window', () => {
    const draft: ClipData = {
      timeline: [fork(oscillate('pitch', { amp: 0.1, period: 8 })), hold(5)],
    };
    const { rows } = buildTimeline(draft, compiled(draft), []);
    expect(rowOf(rows, 'e:0')).toMatchObject({ background: false, duration: 'end', depth: 0 });
    expect(rowOf(rows, 'e:0.0')).toMatchObject({
      background: true,
      depth: 1,
      parentId: 'e:0',
      startSec: 0,
      tailEndSec: 5,
      duration: 'end',
    });
    expect(rowOf(rows, 'e:1').background).toBe(false);
  });

  it('a rate holds its speed until the next rate on its channel, else to the clip end', () => {
    const draft: ClipData = {
      timeline: [
        seq([
          rate('yaw', { to: 0.1, over: 1 }),
          hold(2),
          rate('yaw', { to: 0, over: 1 }),
          rate('pitch', { to: 0.1, over: 1 }),
          hold(3),
        ]),
      ],
    };
    const { rows } = buildTimeline(draft, compiled(draft), []);
    expect(rowOf(rows, 'e:0.0').tailEndSec).toBe(3);
    expect(rowOf(rows, 'e:0.2').tailEndSec).toBe(8);
    expect(rowOf(rows, 'e:0.3').tailEndSec).toBe(8);
  });

  it('a folded group over a culprit is flagged, the culprit stays the only invalid row', () => {
    const draft: ClipData = { timeline: [seq([all([dollyTo(300, 4), dollyTo(500, 4)])])] };
    const { rows } = buildTimeline(draft, compiled(draft), ['e:0']);
    expect(rows.map((r) => r.id)).toEqual(['start', 'e:0']);
    expect(rowOf(rows, 'e:0')).toMatchObject({ errors: [], hidesErrors: true });
    const unfolded = buildTimeline(draft, compiled(draft), []).rows;
    expect(unfolded.every((r) => r.hidesErrors === false)).toBe(true);
  });

  it('waypoint rows span consecutive knot times and the last is Settle', () => {
    const draft: ClipData = {
      timeline: [
        flyPath([atPoint([0, 0, 0], 10), atPoint([5, 0, 0], 8), atPoint([9, 2, 0], 6)], {
          over: 6,
        }),
      ],
    };
    const { rows } = buildTimeline(draft, compiled(draft), []);
    const waypoints = rows.filter((r) => r.kind === 'waypoint');
    expect(waypoints.map((r) => r.label.name)).toEqual(['Pass', 'Pass', 'Settle']);
    expect(waypoints.map((r) => r.glyph)).toEqual(['pass', 'pass', 'settle']);
    expect(waypoints[0]!.startSec).toBe(rowOf(rows, 'e:0').startSec);
    expect(waypoints[1]!.startSec).toBe(waypoints[0]!.endSec);
    expect(waypoints[2]!.startSec).toBe(waypoints[1]!.endSec);
    expect(waypoints[2]!.endSec).toBe(rowOf(rows, 'e:0').endSec);
    expect(waypoints[2]).toMatchObject({ id: 'w:0/2', parentId: 'e:0', depth: 1 });
  });

  it('a flyPath row carries one knot per waypoint, so its lane can draw them while collapsed', () => {
    const draft: ClipData = {
      timeline: [
        flyPath([atPoint([0, 0, 0], 10), atPoint([5, 0, 0], 8), atPoint([9, 2, 0], 6)], {
          over: 6,
        }),
      ],
    };
    const { rows } = buildTimeline(draft, compiled(draft), ['e:0']);
    const fly = rowOf(rows, 'e:0');
    expect(fly.knotSecs).toHaveLength(3);
    expect(fly.knotSecs!.at(-1)).toBe(fly.endSec);
    expect(
      rowOf(buildTimeline({ timeline: [dollyTo(1, 2)] }, null, []).rows, 'e:0').knotSecs,
    ).toBeUndefined();
  });

  it("a group writes the union of its children's families", () => {
    const draft: ClipData = {
      timeline: [all([dollyTo(1, 2), tween('yaw', { to: 1, over: 2 }), moveTarget([0, 0, 0], 2)])],
    };
    const { rows } = buildTimeline(draft, compiled(draft), []);
    expect(rowOf(rows, 'e:0').writes).toEqual(['distance', 'lookAt', 'turn']);
    expect(rowOf(rows, 'e:0').family).toBeNull();
    expect(rowOf(rows, 'e:0.0').family).toBe('distance');
  });

  it('an invalid compile marks exactly the culprit rows', () => {
    const draft: ClipData = { timeline: [all([dollyTo(300, 4), dollyTo(500, 6)])] };
    const timeline = buildTimeline(draft, compiled(draft), []);
    expect(timeline.error).toMatchObject({ reason: 'twoWriters', channel: 'distance' });
    expect(timeline.durationSec).toBeNull();
    const marked = timeline.rows.filter((r) => r.errors.length > 0).map((r) => r.id);
    expect(marked).toEqual(['e:0.0', 'e:0.1']);
    expect(rowOf(timeline.rows, 'e:0.1')).toMatchObject({
      errors: ['twoWriters'],
      startSec: 0,
      endSec: 6,
    });
  });

  it('without a compile every row is unresolved', () => {
    const draft: ClipData = { timeline: [seq([dollyTo(300, 4), hold(2)])] };
    const timeline = buildTimeline(draft, null, []);
    for (const row of timeline.rows) {
      expect(row, row.id).toMatchObject({
        startSec: null,
        endSec: null,
        tailEndSec: null,
        duration: '–',
      });
    }
    expect(timeline.cueSecs).toEqual([]);
    expect(timeline.durationSec).toBeNull();
  });

  it('an error inside a resolved lookAtId marks the lookAtId row', () => {
    const draft: ClipData = {
      timeline: [all([lookAtId(focusId('a'), 2), lookAtId(focusId('b'), 2)])],
    };
    // What `resolveClipFoci` makes of it: each lookAtId becomes an `all` of two tweens.
    const resolved: ClipData = {
      timeline: [all([aimAt({ yaw: 1, pitch: 0 }, 2), aimAt({ yaw: 2, pitch: 0 }, 2)])],
    };
    const { rows, error } = buildTimeline(draft, compiled(resolved), []);
    expect(error?.paths.every((p) => p.length === 3)).toBe(true);
    expect(rows.filter((r) => r.errors.length > 0).map((r) => r.id)).toEqual(['e:0.0', 'e:0.1']);
    expect(rowOf(rows, 'e:0.0').kind).toBe('lookAtId');
  });

  it('a kind without its own glyph shows its channel family glyph', () => {
    const draft: ClipData = {
      timeline: [dollyTo(300, 4), tween('yaw', { to: 1, over: 2 }), hold(1)],
    };
    const { rows } = buildTimeline(draft, compiled(draft), []);
    expect(rows.map((r) => r.glyph)).toEqual(['start', 'dist', 'turn', 'hold']);
  });

  it('cueSecs lists each effect start and the clip end', () => {
    const draft: ClipData = { timeline: [dollyTo(300, 4), hold(2), dollyTo(500, 3)] };
    expect(buildTimeline(draft, compiled(draft), []).cueSecs).toEqual([0, 4, 6, 9]);
  });
});
