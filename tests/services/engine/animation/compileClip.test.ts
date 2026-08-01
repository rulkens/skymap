/**
 * compileClip — unit tests for the ClipData → CompiledClip flatten.
 *
 * Each test exercises one structural property of the compiler. Assertions are
 * deliberate about exact times, exact track families, and `durationSec` to
 * catch a regression if the walk logic drifts. The inputs use `effectHelpers`
 * constructors exclusively — no raw `{ kind: … }` literals.
 */

import { describe, it, expect } from 'vitest';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import {
  dollyTo,
  moveTargetId,
  spinToId,
  aimAlong,
  spin,
  rate,
  oscillate,
  hold,
  hide,
  fade,
  frameTo,
  seq,
  all,
  fork,
  wait,
  flyPath,
  atPoint,
  atFocus,
} from '../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../src/utils/animation/focusId';

// ---------------------------------------------------------------------------
// Test 1 — seq accumulates windows
// ---------------------------------------------------------------------------

describe('compileClip seq accumulates windows', () => {
  it('three-child seq: segments land at [0,4), gap [4,7), [7,11); durationSec===11', () => {
    const clip = compileClip({
      timeline: [seq([dollyTo(300, 4), hold(3), dollyTo(950, 4)])],
    });

    expect(clip.durationSec).toBe(11);

    const distSegs = clip.baseTracks['distance'];
    expect(distSegs).toHaveLength(2);

    const [first, second] = distSegs;
    expect(first!.startSec).toBe(0);
    expect(first!.endSec).toBe(4);
    expect(first!.to).toBe(300);

    expect(second!.startSec).toBe(7);
    expect(second!.endSec).toBe(11);
    expect(second!.to).toBe(950);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — all shares block start
// ---------------------------------------------------------------------------

describe('compileClip all shares block start', () => {
  it('two concurrent children both get window [0,4); durationSec===4', () => {
    const clip = compileClip({
      timeline: [all([dollyTo(300, 4), spin('yaw', { by: 1, over: 4 })])],
    });

    expect(clip.durationSec).toBe(4);

    const distSegs = clip.baseTracks['distance'];
    expect(distSegs).toHaveLength(1);
    expect(distSegs[0]!.startSec).toBe(0);
    expect(distSegs[0]!.endSec).toBe(4);

    const yawSegs = clip.baseTracks['yaw'];
    expect(yawSegs).toHaveLength(1);
    expect(yawSegs[0]!.startSec).toBe(0);
    expect(yawSegs[0]!.endSec).toBe(4);
    // spin stores the `by` delta in `to`
    expect(yawSegs[0]!.to).toBe(1);
    expect(yawSegs[0]!.segKind).toBe('spin');
  });
});

// ---------------------------------------------------------------------------
// Test 3 — rate → velTracks, oscillate → oscTracks, set/spin → baseTracks
// ---------------------------------------------------------------------------

describe('compileClip routes to the correct track families', () => {
  it('rate lands in velTracks, oscillate in oscTracks, dollyTo+spin in baseTracks', () => {
    const clip = compileClip({
      timeline: [
        dollyTo(200, 3),
        spin('yaw', { by: Math.PI, over: 5 }),
        rate('yaw', { to: 0.5, over: 2 }),
        oscillate('pitch', { amp: 0.05, period: 6 }),
      ],
    });

    // dollyTo → baseTracks.distance
    expect(clip.baseTracks['distance']).toHaveLength(1);
    expect(clip.baseTracks['distance'][0]!.segKind).toBe('tween');

    // spin → baseTracks.yaw
    expect(clip.baseTracks['yaw']).toHaveLength(1);
    expect(clip.baseTracks['yaw'][0]!.segKind).toBe('spin');

    // rate → velTracks
    expect(clip.velTracks).toHaveLength(1);
    expect(clip.velTracks[0]!.channel).toBe('yaw');
    expect(clip.velTracks[0]!.to).toBe(0.5);

    // oscillate → oscTracks; a bare bob is perpetual: the maximal [-∞, +∞)
    // window, no fade.
    expect(clip.oscTracks).toHaveLength(1);
    expect(clip.oscTracks[0]!.channel).toBe('pitch');
    expect(clip.oscTracks[0]!.amp).toBe(0.05);
    expect(clip.oscTracks[0]!.period).toBe(6);
    expect(clip.oscTracks[0]!.startSec).toBe(-Infinity);
    expect(clip.oscTracks[0]!.endSec).toBe(Infinity);
    expect(clip.oscTracks[0]!.fade).toBe(0);

    // baseTracks for unused channels are empty arrays, not absent
    expect(clip.baseTracks['pitch']).toEqual([]);
    expect(clip.baseTracks['target']).toEqual([]);
  });

  it('a windowed oscillate carries [at, at+over) + fade, shifted by a leading wait', () => {
    const clip = compileClip({
      // A 2s wait lead-in then a 3s hold puts the bob at 5; over:8 → [5, 13).
      // Perpetual bobs would stay [-∞, +∞); this one is finite, so the wait
      // shifts it like any other window.
      timeline: [
        seq([wait(2), hold(3), oscillate('pitch', { amp: 0.04, period: 14, over: 8, fade: 1.5 })]),
      ],
    });

    expect(clip.oscTracks).toHaveLength(1);
    expect(clip.oscTracks[0]!.startSec).toBe(5);
    expect(clip.oscTracks[0]!.endSec).toBe(13);
    expect(clip.oscTracks[0]!.fade).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — a leading wait shifts every following window
// ---------------------------------------------------------------------------

describe('compileClip leading wait shifts every following window', () => {
  it('a 2s wait shifts the distance segment to start at 2; durationSec includes the wait', () => {
    const clip = compileClip({
      timeline: [wait(2), dollyTo(400, 5)],
    });

    // The authored dolly occupies 5 s; the wait adds 2 s before it.
    expect(clip.durationSec).toBe(7);

    const distSegs = clip.baseTracks['distance'];
    expect(distSegs).toHaveLength(1);
    expect(distSegs[0]!.startSec).toBe(2);
    expect(distSegs[0]!.endSec).toBe(7);
  });

  it('a 2s wait shifts velTracks and cues by 2 as well', () => {
    // After the wait the cursor sits at 2: hide fires at 2 (duration 0), and
    // the rate follows immediately, so its ramp is [2, 5).
    const clip = compileClip({
      timeline: [wait(2), hide(['flow'], 0), rate('yaw', { to: 1, over: 3 })],
    });

    expect(clip.velTracks[0]!.startSec).toBe(2);
    expect(clip.velTracks[0]!.endSec).toBe(5);

    expect(clip.cues[0]!.atSec).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — orders cues by atSec ascending
// ---------------------------------------------------------------------------

describe('compileClip orders cues by atSec', () => {
  it('hide at t=0 then fade at t>0 produces cues[0].atSec===0 ascending', () => {
    // We emit hide first (at t=0), then a later fade after a hold.
    // The timeline in a seq processes left to right, so hide fires at 0 and
    // fade fires after the hold.
    const clip = compileClip({
      timeline: [seq([hide(['flow'], 0), hold(3), fade(['flow'], 0.5, 2)])],
    });

    expect(clip.cues).toHaveLength(2);
    expect(clip.cues[0]!.atSec).toBe(0);
    expect(clip.cues[0]!.effect.kind).toBe('hide');
    expect(clip.cues[1]!.atSec).toBe(3);
    expect(clip.cues[1]!.effect.kind).toBe('fade');
    // Ascending order is maintained even if the internal walk emits them in a
    // different order (the sort in compileClip ensures this).
    expect(clip.cues[0]!.atSec).toBeLessThan(clip.cues[1]!.atSec);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — fork duration excluded from durationSec
// ---------------------------------------------------------------------------

describe('compileClip ignores fork duration in durationSec', () => {
  it('a perpetual fork(spin) does NOT extend durationSec', () => {
    // Without fork: a looping spin would in principle run forever.
    // With fork: it is fire-and-forget; the awaited duration is only the
    // hold(5) that follows it.
    const clip = compileClip({
      timeline: [seq([fork(spin('yaw', { by: Math.PI * 2, over: 60, loop: true })), hold(5)])],
    });

    // fork contributes 0 to the awaited duration; hold(5) contributes 5.
    expect(clip.durationSec).toBe(5);

    // The forked spin's segment IS still emitted into baseTracks.
    const yawSegs = clip.baseTracks['yaw'];
    expect(yawSegs).toHaveLength(1);
    expect(yawSegs[0]!.segKind).toBe('spin');
    expect(yawSegs[0]!.startSec).toBe(0);
    expect(yawSegs[0]!.endSec).toBe(60);
  });

  it('fork inside all: other children still drive durationSec', () => {
    // all([fork(bigSpin), dollyTo(100, 4)]) → durationSec === 4
    const clip = compileClip({
      timeline: [
        all([fork(spin('yaw', { by: Math.PI * 4, over: 120, loop: true })), dollyTo(100, 4)]),
      ],
    });

    expect(clip.durationSec).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — loop flag survives compilation for spin segments
// ---------------------------------------------------------------------------

describe('compileClip carries loop flag on spin segments', () => {
  it('a spin with loop:true compiles to a segment with loop===true', () => {
    const clip = compileClip({
      timeline: [spin('yaw', { by: 6.28, over: 30, loop: true })],
    });

    const yawSegs = clip.baseTracks['yaw'];
    expect(yawSegs).toHaveLength(1);
    expect(yawSegs[0]!.segKind).toBe('spin');
    expect(yawSegs[0]!.loop).toBe(true);
  });

  it('a spin without loop compiles to a segment whose loop is undefined', () => {
    const clip = compileClip({
      timeline: [spin('yaw', { by: 6.28, over: 30 })],
    });

    const yawSegs = clip.baseTracks['yaw'];
    expect(yawSegs).toHaveLength(1);
    expect(yawSegs[0]!.segKind).toBe('spin');
    expect(yawSegs[0]!.loop).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 8 — compileClip throws on unresolved focus-bound effects
// ---------------------------------------------------------------------------

describe('compileClip throws on an unresolved focus-bound effect', () => {
  it('compileClip throws on an unresolved focus-bound effect', () => {
    // A clip that contains moveTargetId — unresolved because resolveClipFoci
    // has not run. compileClip must throw with a message naming resolveClipFoci
    // rather than silently no-op or producing a broken CompiledClip.
    expect(() =>
      compileClip({
        timeline: [moveTargetId(focusId('m87'), 5)],
      }),
    ).toThrow('resolveClipFoci');
  });

  it('compileClip throws on an unresolved spinToId', () => {
    expect(() =>
      compileClip({
        timeline: [spinToId(focusId('m87'), { over: 5 })],
      }),
    ).toThrow('resolveClipFoci');
  });

  it('compileClip throws on an unresolved aimAlong', () => {
    expect(() =>
      compileClip({
        timeline: [aimAlong([1, 0, 0], 5)],
      }),
    ).toThrow('resolveClipFoci');
  });
});

// ---------------------------------------------------------------------------
// Test 8b — frameTo compiles to one cue and awaits no time
// ---------------------------------------------------------------------------

describe('compileClip frameTo', () => {
  it('compiling a clip with frameTo emits one cue at the beat and 0 awaited duration', () => {
    // A 2s wait then a frameTo: the reorientation fires at t=2 as a point-in-
    // time cue and adds no awaited time, so durationSec is just the wait's 2s.
    const clip = compileClip({
      timeline: [wait(2), frameTo('galactic', { over: 1 })],
    });

    expect(clip.cues).toHaveLength(1);
    expect(clip.cues[0]!.atSec).toBe(2);
    expect(clip.cues[0]!.effect.kind).toBe('frameTo');
    expect(clip.durationSec).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 9 — flyPath compiles to a path track; guards its invariants
// ---------------------------------------------------------------------------

describe('compileClip flyPath', () => {
  it('compiles a resolved flyPath to one path track spanning its window', () => {
    const compiled = compileClip({
      start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
      // linger:0 opts out of the default dwell so the window stays a flat 6s.
      timeline: [
        flyPath([atPoint([10, 0, 0], 10), atPoint([20, 0, 0], 100)], { over: 6, linger: 0 }),
      ],
    });
    expect(compiled.pathTracks).toHaveLength(1);
    expect(compiled.pathTracks[0]!.startSec).toBe(0);
    expect(compiled.pathTracks[0]!.endSec).toBe(6);
    expect(compiled.durationSec).toBe(6);
  });

  it('throws on an unresolved (id-form) waypoint', () => {
    expect(() =>
      compileClip({
        timeline: [flyPath([atFocus(focusId('m87'))], { over: 4 })],
      }),
    ).toThrow('resolveClipFoci');
  });

  it('throws when a base writer overlaps the flyPath window (composite exclusivity)', () => {
    // A flyPath owns all camera channels for [0,4); a concurrent dollyTo on
    // `distance` in the same window is a clash, caught at compile time.
    expect(() =>
      compileClip({
        start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
        timeline: [all([flyPath([atPoint([10, 0, 0], 10)], { over: 4 }), dollyTo(50, 4)])],
      }),
    ).toThrow(/flyPath window/);
  });
});
