/**
 * buildClipPathLines tests — the debug overlay sampler that turns a compiled
 * flyPath's eye path into a marker-line polyline.
 *
 * The camera (eye) flies the path's spline; this helper samples that eye path
 * and emits one `MarkerLine` per segment so the route is visible in the scene.
 * Contracts:
 *   - One polyline per track: N samples → N-1 connected segments.
 *   - The polyline starts at the live eye and ends at the framed destination
 *     (the eye settles short of the final waypoint's centre).
 *   - Segments are contiguous (each segment's end is the next's start).
 */

import { describe, it, expect } from 'vitest';
import { buildClipPathLines } from '../../../../src/services/engine/presentation/buildClipPathLines';
import { buildPathTrack } from '../../../../src/services/engine/animation/buildPathTrack';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

function track() {
  return buildPathTrack({
    start: START, // eye at [0,0,1]
    startSec: 0,
    over: 4,
    ease: 'linear',
    waypoints: [
      { at: [10, 0, 0], distance: 10 },
      { at: [20, 0, 0], distance: 3 },
    ],
  });
}

describe('buildClipPathLines', () => {
  it('emits a contiguous polyline from the live eye to the last waypoint', () => {
    const lines = buildClipPathLines([track()]);
    expect(lines.length).toBeGreaterThan(8);

    // Starts at the live eye [0,0,1].
    expect(lines[0]!.fromWorld[0]).toBeCloseTo(0, 3);
    expect(lines[0]!.fromWorld[2]).toBeCloseTo(1, 3);

    // Ends framed: the eye settles 3 short of [20,0,0] along the +X approach.
    const last = lines[lines.length - 1]!;
    expect(last.toWorld[0]).toBeCloseTo(17, 2);
    expect(last.toWorld[1]).toBeCloseTo(0, 2);

    // Contiguous: each segment's end is the next segment's start.
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i]!.toWorld[0]).toBeCloseTo(lines[i + 1]!.fromWorld[0], 9);
      expect(lines[i]!.toWorld[1]).toBeCloseTo(lines[i + 1]!.fromWorld[1], 9);
      expect(lines[i]!.toWorld[2]).toBeCloseTo(lines[i + 1]!.fromWorld[2], 9);
    }
  });

  it('gives each line a finite width and a stable, path-keyed id', () => {
    const lines = buildClipPathLines([track()]);
    expect(lines[0]!.pixelWidth).toBeGreaterThan(0);
    // Ids are unique across the set (the director keys its upload on them).
    const ids = new Set(lines.map((l) => l.id));
    expect(ids.size).toBe(lines.length);
  });

  it('returns nothing for an empty track list', () => {
    expect(buildClipPathLines([])).toEqual([]);
  });
});
