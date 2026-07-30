/**
 * buildClipPathLines — turns a precomputed `ClipPathSnapshot` into the debug
 * overlay's lines: a speed-coloured eye polyline, a flat-coloured camera-target
 * (look-at) polyline, then a scrub gizmo (camera sightline + frustum) at the
 * scrubbed instant.
 *
 * Returns a flat DebugLine[]: route (N−1 segments), then target path (N−1
 * segments), then the 9-line gizmo. Contracts:
 *   - The eye polyline starts at the live eye and ends at the framed destination.
 *   - Speed colour varies along the route (not a flat colour).
 *   - The target polyline is contiguous and a single flat colour.
 *   - The gizmo follows the scrub time.
 */

import { describe, it, expect } from 'vitest';
import { buildClipPathLines } from '../../../../src/services/engine/presentation/buildClipPathLines';
import { sampleClipPath } from '../../../../src/services/engine/animation/sampleClipPath';
import { flyPath, atPoint } from '../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
const DATA: ClipData = {
  start: START,
  timeline: [
    // linger:0 opts out of the default dwell so the route is a flat 4s take.
    flyPath([atPoint([10, 0, 0], 5), atPoint([20, 0, 0], 3)], {
      over: 4,
      ease: 'easeInOutCubic',
      linger: 0,
    }),
  ],
};
const VIEW = { fovYRad: 0.8, aspect: 1.5 };
const N = 24;

function snap() {
  return sampleClipPath('flyPathDemo', DATA, 4, N);
}

describe('buildClipPathLines', () => {
  it('emits a speed route (N−1) + target path (N−1) + the 9-line scrub gizmo', () => {
    const lines = buildClipPathLines(snap(), 0, VIEW);
    expect(lines).toHaveLength(2 * (N - 1) + 9);
    for (const l of lines) {
      expect(l.color).toHaveLength(4);
      expect(l.width).toBeGreaterThan(0);
    }
  });

  it('runs the route (first N−1) from the live eye to the framed destination, contiguously', () => {
    const route = buildClipPathLines(snap(), 0, VIEW).slice(0, N - 1);
    expect(route[0]!.from[0]).toBeCloseTo(0, 3);
    expect(route[0]!.from[2]).toBeCloseTo(1, 3); // live eye [0,0,1]
    const last = route[route.length - 1]!;
    expect(last.to[0]).toBeCloseTo(17, 2); // framed 3 short of [20,0,0]
    for (let i = 0; i < route.length - 1; i++) {
      expect(route[i]!.to[0]).toBeCloseTo(route[i + 1]!.from[0], 9);
      expect(route[i]!.to[1]).toBeCloseTo(route[i + 1]!.from[1], 9);
      expect(route[i]!.to[2]).toBeCloseTo(route[i + 1]!.from[2], 9);
    }
  });

  it('colours route segments by speed (not a flat colour)', () => {
    const route = buildClipPathLines(snap(), 0, VIEW).slice(0, N - 1);
    const colorKeys = new Set(route.map((l) => l.color.join(',')));
    expect(colorKeys.size).toBeGreaterThan(1);
  });

  it('runs the target (look-at) path contiguously, in one flat colour, after the route', () => {
    const target = buildClipPathLines(snap(), 0, VIEW).slice(N - 1, 2 * (N - 1));
    expect(target).toHaveLength(N - 1);
    // Contiguous: each segment's end is the next segment's start.
    for (let i = 0; i < target.length - 1; i++) {
      expect(target[i]!.to[0]).toBeCloseTo(target[i + 1]!.from[0], 9);
      expect(target[i]!.to[1]).toBeCloseTo(target[i + 1]!.from[1], 9);
      expect(target[i]!.to[2]).toBeCloseTo(target[i + 1]!.from[2], 9);
    }
    // Flat colour — one constant, unlike the speed-ramped route.
    const colorKeys = new Set(target.map((l) => l.color.join(',')));
    expect(colorKeys.size).toBe(1);
  });

  it('moves the gizmo sightline (first gizmo line) to the scrubbed instant', () => {
    // scrub01 is a [0,1] position, not seconds. Gizmo follows route + target paths.
    const gizmoStart = 2 * (N - 1);
    const atStart = buildClipPathLines(snap(), 0, VIEW)[gizmoStart]!; // first gizmo line = sightline
    expect(atStart.from[0]).toBeCloseTo(0, 2);
    expect(atStart.from[2]).toBeCloseTo(1, 2); // eye at live start

    const atEnd = buildClipPathLines(snap(), 1, VIEW)[gizmoStart]!;
    expect(atEnd.from[0]).toBeCloseTo(17, 1); // eye at framed destination
  });
});
