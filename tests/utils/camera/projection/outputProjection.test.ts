/**
 * outputProjection composes the dome frame onto the camera: the master's centre
 * must look up the tilt from forward and its bottom edge at the front horizon,
 * or the look's placements land on the wrong part of the sky.
 */
import { describe, expect, it } from 'vitest';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import { outputProjection } from '../../../../src/utils/camera/projection/outputProjection';
import { rayOfPx } from '../../../../src/utils/camera/projection/rayOfPx';
import { viewBasis } from '../../../../src/utils/camera/projection/viewBasis';
import { DOME_PARAMS } from '../../../../src/data/rendering/domeParams';
import { createOrbitCamera } from '../../../../src/utils/camera/orbitCamera/createOrbitCamera';

const ctx = {
  cam: createOrbitCamera({
    target: [0, 0, 0],
    distance: 10,
    yaw: 0.7,
    pitch: -0.4,
    roll: 0.3,
    fovYRad: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 100,
  }),
  frustum: { tanLeft: -0.8, tanRight: 0.8, tanDown: -0.8, tanUp: 0.8 },
  canvasSize: { width: 2048, height: 2048 },
} as Pick<FrameView, 'cam' | 'frustum' | 'canvasSize'>;

describe('outputProjection', () => {
  it('is the main pinhole in mono', () => {
    expect(outputProjection(ctx, 'mono')).toEqual({
      kind: 'rectilinear',
      basis: viewBasis(ctx.cam),
      frustum: ctx.frustum,
      size: ctx.canvasSize,
    });
  });

  it('puts the dome zenith tilt above forward and the front horizon at the bottom', () => {
    const proj = outputProjection(ctx, 'dome');
    const { forward: f, up: u } = viewBasis(ctx.cam);
    const t = (DOME_PARAMS.tiltDeg * Math.PI) / 180;
    const zenith = f.map((v, i) => v * Math.cos(t) + u[i]! * Math.sin(t));
    const front = f.map((v, i) => v * Math.sin(t) - u[i]! * Math.cos(t));
    rayOfPx(proj, [1024, 1024])!.forEach((v, i) => expect(v).toBeCloseTo(zenith[i]!, 9));
    rayOfPx(proj, [1024, 2048])!.forEach((v, i) => expect(v).toBeCloseTo(front[i]!, 9));
  });
});
