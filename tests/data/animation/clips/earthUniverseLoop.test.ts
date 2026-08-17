/**
 * earthUniverseLoop tests — two load-bearing invariants a future edit could
 * silently break: (1) the opening bearing actually looks sunward, not just
 * "some direction near Earth", and (2) the loop seam is bit-identical modulo
 * one full yaw turn, so `loop: true` never produces a visible jump.
 */

import { describe, it, expect } from 'vitest';
import { earthUniverseLoop } from '../../../../src/data/animation/clips/earthUniverseLoop';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('earthUniverseLoop', () => {
  it('opens with the camera aimed sunward (toward the render origin) from Earth', () => {
    const start = earthUniverseLoop(CONST_J2000).data.start as CameraPose;
    const earth = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;
    const sMag = Math.hypot(earth[0], earth[1], earth[2]);
    const sunward: Vec3 = [earth[0] / sMag, earth[1] / sMag, earth[2] / sMag];

    // Decode (yaw, pitch) through the SAME ecliptic basis the clip encoded
    // under (updatePosition's convention: dir = basis · yawPitchToDir(yaw,
    // pitch) is the target→eye direction), so the camera's AIM is -dir.
    const basis = ORIENTATION_FRAMES.ecliptic;
    const [lx, ly, lz] = yawPitchToDir(start.yaw, start.pitch);
    const dirWorld: Vec3 = [
      basis[0] * lx + basis[3] * ly + basis[6] * lz,
      basis[1] * lx + basis[4] * ly + basis[7] * lz,
      basis[2] * lx + basis[5] * ly + basis[8] * lz,
    ];
    const aim: Vec3 = [-dirWorld[0], -dirWorld[1], -dirWorld[2]];

    expect(aim[0]).toBeCloseTo(sunward[0], 6);
    expect(aim[1]).toBeCloseTo(sunward[1], 6);
    expect(aim[2]).toBeCloseTo(sunward[2], 6);
  });

  it('loops seamlessly: pose(durationSec) equals pose(0) with yaw offset by exactly 2π', () => {
    const clip = earthUniverseLoop(CONST_J2000);
    expect(clip.data.loop).toBe(true);

    const compiled = compileClip(clip.data);
    const pose0 = evaluateClip(clip.data, 0);
    const poseEnd = evaluateClip(clip.data, compiled.durationSec);

    expect(poseEnd.yaw).toBeCloseTo(pose0.yaw + Math.PI * 2, 10);
    expect(poseEnd.distance).toBeCloseTo(pose0.distance, 10);
    expect(poseEnd.pitch).toBeCloseTo(pose0.pitch, 10);
    expect(poseEnd.target[0]).toBeCloseTo(pose0.target[0], 10);
    expect(poseEnd.target[1]).toBeCloseTo(pose0.target[1], 10);
    expect(poseEnd.target[2]).toBeCloseTo(pose0.target[2], 10);
  });
});
