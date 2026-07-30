/**
 * flyPathDemo tests — the stage-03-shaped `flyPath` clip resolves its named
 * group waypoints, compiles to one path track, and evaluates as a smooth path
 * from the live start pose through to the final group (Sculptor).
 *
 * The clip mixes `atFocus` (catalog-resolved) and `atPoint` (hand-placed)
 * waypoints, so unlike `flyout` it must run through `resolveClipFoci` before it
 * can compile. We supply a minimal `ResolveDeps` that resolves the three group
 * ids to known structures (mirroring the resolveClipFoci suite's fixture), so
 * the test does not depend on linked catalog data.
 */

import { describe, it, expect } from 'vitest';
import { flyPathDemo } from '../../../../src/data/animation/clips/flyPathDemo';
import { resolveClipFoci } from '../../../../src/services/engine/animation/resolveClipFoci';
import { resolveClipStart } from '../../../../src/state/camera/cameraSlice';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

const FOV_Y = 0.8;
const TEST_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5 };

/** Reconstruct the eye position from a pose via the orbit convention. */
function eyeOf(p: CameraPose): [number, number, number] {
  const cp = Math.cos(p.pitch);
  const dir: [number, number, number] = [
    cp * Math.sin(p.yaw),
    Math.sin(p.pitch),
    cp * Math.cos(p.yaw),
  ];
  return [
    p.target[0] + p.distance * dir[0],
    p.target[1] + p.distance * dir[1],
    p.target[2] + p.distance * dir[2],
  ];
}

const GROUPS: Record<string, StructureInfo> = {
  'group-m81-group': {
    type: 'structure',
    category: 'group',
    id: 'group-m81-group',
    name: 'M81 Group',
    worldPos: [10, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  } as StructureInfo,
  'group-cen-a-group': {
    type: 'structure',
    category: 'group',
    id: 'group-cen-a-group',
    name: 'Centaurus A Group',
    worldPos: [0, 10, 0],
    featured: true,
    physicalRadiusMpc: 3,
  } as StructureInfo,
  'group-sculptor-group': {
    type: 'structure',
    category: 'group',
    id: 'group-sculptor-group',
    name: 'Sculptor Group',
    worldPos: [0, 0, 10],
    featured: true,
    physicalRadiusMpc: 2,
  } as StructureInfo,
};

const DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: (id) => GROUPS[id] ?? null },
  stars: { current: () => null },
};

/** Resolve foci + live start, then compile — the play-time pipeline. */
function prepared() {
  const foci = resolveClipFoci(flyPathDemo.data, DEPS, FOV_Y, TEST_POSE);
  return resolveClipStart(foci, TEST_POSE);
}

describe('flyPathDemo clip', () => {
  it('resolves its named group waypoints and compiles to one path track', () => {
    const compiled = compileClip(prepared());
    expect(compiled.pathTracks).toHaveLength(1);
    // The clip authors `linger: 0.65`, so the dwell ADDS time: the take runs
    // longer than the authored 20s cruise budget.
    expect(compiled.durationSec).toBeGreaterThan(20);
  });

  it('starts at the live eye and flies the camera through to the Sculptor group', () => {
    const resolved = prepared();
    const dur = compileClip(resolved).durationSec; // real (dwelled) take length

    // The camera (eye) starts where it is — the live pose's eye at [0,0,5].
    const start = eyeOf(evaluateClip(resolved, 0));
    expect(start[0]).toBeCloseTo(0, 4);
    expect(start[2]).toBeCloseTo(5, 4);

    // …and ends SETTLED FRAMED on the Sculptor group: the look-at target is the
    // group centre at the framing distance (the eye stops short, it does not fly
    // through the centre like the en-route waypoints).
    const end = evaluateClip(resolved, dur);
    expect(end.target[0]).toBeCloseTo(0, 2);
    expect(end.target[1]).toBeCloseTo(0, 2);
    expect(end.target[2]).toBeCloseTo(10, 2); // Sculptor worldPos
    expect(end.distance).toBeCloseTo(structureFocusDistance(2, FOV_Y), 2);
  });

  it('moves the camera continuously through the take (no freeze, no teleport)', () => {
    const resolved = prepared();
    const dur = compileClip(resolved).durationSec;
    let prev = eyeOf(evaluateClip(resolved, 0));
    let moved = 0;
    for (let i = 1; i <= 60; i++) {
      const eye = eyeOf(evaluateClip(resolved, (i / 60) * dur));
      const step = Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]);
      expect(step).toBeLessThan(8); // no single step jumps across the path
      moved += step;
      prev = eye;
    }
    expect(moved).toBeGreaterThan(10); // the camera actually traversed it
  });
});
