/**
 * validateSingleWriter — unit tests for the base-layer single-writer check.
 *
 * Tests are structured in two layers:
 *
 *   1. ISOLATION — call `validateSingleWriter` directly on hand-built
 *      `Record<Channel, BaseSegment[]>` literals. These tests are independent
 *      of `compileClip` and pin the overlap predicate precisely.
 *
 *   2. INTEGRATION — call `compileClip(...)` and assert it throws / does not
 *      throw. These tests confirm the wiring in `compileClip` works end to end.
 *
 * The brief's three semantic cases are covered:
 *
 *   - Sequential ramps (`seq`) produce touching windows `[0,4)` then `[4,8)`.
 *     Touching endpoints must NOT be treated as overlap.
 *   - Concurrent ramps (`all`) on the same channel produce two `[0,4)` windows —
 *     a genuine overlap that must throw, naming the channel and both windows.
 *   - A base writer + a velocity ramp + an oscillation on one channel must NOT
 *     clash: only `baseTracks` segments participate in the check.
 */

import { describe, it, expect } from 'vitest';
import { validateSingleWriter } from '../../../../src/services/engine/animation/validateSingleWriter';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import {
  dollyTo,
  tween,
  rate,
  oscillate,
  seq,
  all,
} from '../../../../src/services/engine/animation/effectHelpers';
import type { BaseSegment } from '../../../../src/@types/animation/CompiledClip';
import type { Channel } from '../../../../src/@types/animation/Channel';

// ---------------------------------------------------------------------------
// Helper — build an empty baseTracks record (every channel an empty array).
// ---------------------------------------------------------------------------

function emptyTracks(): Record<Channel, BaseSegment[]> {
  return { distance: [], yaw: [], pitch: [], target: [] };
}

// ---------------------------------------------------------------------------
// Isolation — validateSingleWriter called directly on hand-built literals
// ---------------------------------------------------------------------------

describe('validateSingleWriter isolation', () => {
  it('passes for an empty baseTracks record', () => {
    expect(() => validateSingleWriter(emptyTracks())).not.toThrow();
  });

  it('passes for a single segment on a channel', () => {
    const tracks = emptyTracks();
    tracks.distance = [
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 0,
        endSec: 4,
        to: 300,
        ease: 'easeInOutCubic',
        space: 'log',
      },
    ];
    expect(() => validateSingleWriter(tracks)).not.toThrow();
  });

  it('passes for two touching (non-overlapping) segments: [0,4) and [4,8)', () => {
    const tracks = emptyTracks();
    tracks.distance = [
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 0,
        endSec: 4,
        to: 300,
        ease: 'easeInOutCubic',
        space: 'log',
      },
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 4,
        endSec: 8,
        to: 950,
        ease: 'easeInOutCubic',
        space: 'log',
      },
    ];
    expect(() => validateSingleWriter(tracks)).not.toThrow();
  });

  it('throws for two identical windows [0,4) on the same channel, naming channel and both windows', () => {
    const tracks = emptyTracks();
    tracks.distance = [
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 0,
        endSec: 4,
        to: 300,
        ease: 'easeInOutCubic',
        space: 'log',
      },
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 0,
        endSec: 4,
        to: 950,
        ease: 'easeInOutCubic',
        space: 'log',
      },
    ];
    expect(() => validateSingleWriter(tracks)).toThrow(/distance/);
    expect(() => validateSingleWriter(tracks)).toThrow(/\[0,4\)/);
  });

  it('throws naming both windows when they partially overlap: [0,6) and [4,8)', () => {
    const tracks = emptyTracks();
    tracks.yaw = [
      {
        segKind: 'tween',
        channel: 'yaw',
        startSec: 0,
        endSec: 6,
        to: 1,
        ease: 'easeInOutCubic',
        space: 'add',
      },
      {
        segKind: 'tween',
        channel: 'yaw',
        startSec: 4,
        endSec: 8,
        to: 2,
        ease: 'easeInOutCubic',
        space: 'add',
      },
    ];
    expect(() => validateSingleWriter(tracks)).toThrow(/yaw/);
    expect(() => validateSingleWriter(tracks)).toThrow(/\[0,6\)/);
    expect(() => validateSingleWriter(tracks)).toThrow(/\[4,8\)/);
  });

  it('passes when the clash is on one channel but another channel is clean', () => {
    // Overlap on 'pitch', clean on 'distance' — the throw names 'pitch'.
    const tracks = emptyTracks();
    tracks.distance = [
      {
        segKind: 'tween',
        channel: 'distance',
        startSec: 0,
        endSec: 4,
        to: 300,
        ease: 'easeInOutCubic',
        space: 'log',
      },
    ];
    tracks.pitch = [
      {
        segKind: 'tween',
        channel: 'pitch',
        startSec: 0,
        endSec: 4,
        to: 0.5,
        ease: 'easeInOutCubic',
        space: 'add',
      },
      {
        segKind: 'tween',
        channel: 'pitch',
        startSec: 0,
        endSec: 4,
        to: 1.0,
        ease: 'easeInOutCubic',
        space: 'add',
      },
    ];
    expect(() => validateSingleWriter(tracks)).toThrow(/pitch/);
    // 'distance' should NOT appear in the message since it is clean.
    expect(() => validateSingleWriter(tracks)).not.toThrow(/distance/);
  });
});

// ---------------------------------------------------------------------------
// Integration — via compileClip (confirms the wiring is in place)
// ---------------------------------------------------------------------------

describe('validateSingleWriter via compileClip integration', () => {
  // Brief case 1: seq produces touching windows — must NOT throw.
  it('seq([dollyTo(300,4), dollyTo(950,4)]) compiles without throw', () => {
    expect(() =>
      compileClip({
        timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])],
      }),
    ).not.toThrow();
  });

  // Brief case 2: all on the same channel — two [0,4) windows — must throw.
  it('all([dollyTo(300,4), dollyTo(950,4)]) throws; message names distance and both [0,4) windows', () => {
    expect(() =>
      compileClip({
        timeline: [all([dollyTo(300, 4), dollyTo(950, 4)])],
      }),
    ).toThrow(/distance/);

    expect(() =>
      compileClip({
        timeline: [all([dollyTo(300, 4), dollyTo(950, 4)])],
      }),
    ).toThrow(/\[0,4\)/);
  });

  // Brief case 3: base + velocity + oscillation on the same channel — no clash.
  // tween('yaw',...) → base, rate('yaw',...) → velTracks, oscillate('yaw',...) → oscTracks.
  it('base + rate + oscillate on the same channel do not clash (different layers)', () => {
    expect(() =>
      compileClip({
        timeline: [
          all([
            tween('yaw', { to: 1, over: 4 }),
            rate('yaw', { to: 0.1, over: 4 }),
            oscillate('yaw', { amp: 0.1, period: 2 }),
          ]),
        ],
      }),
    ).not.toThrow();
  });
});
