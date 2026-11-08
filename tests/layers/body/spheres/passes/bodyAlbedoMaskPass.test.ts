/**
 * bodyAlbedoMaskPass — Mars's albedo mask feeds its red-lead wash at every range: inside the
 * relief shell the engraved ground replaces the markings' ink, not their colour.
 */

import { describe, it, expect } from 'vitest';

import { bodyAlbedoMaskPass } from '../../../../../src/layers/body/spheres/passes/bodyAlbedoMaskPass';
import { ANTIQUE_RELIEF_MAX_ALT_M } from '../../../../../src/data/rendering/antiqueRelief';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import type { BodyRuntime } from '../../../../../src/layers/body/@types/BodyRuntime';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const MARS_R = SCENE_CELESTIAL_BODIES.find((b) => b.id === 'mars')!.surface.datumRadiusM;

function enabledAt(altitudeM: number): boolean {
  const pass = bodyAlbedoMaskPass({} as BodyRuntime);
  const ctx = {
    bodyPose: () => ({ eyeRelBodyM: [MARS_R + altitudeM, 0, 0] }),
  } as unknown as FrameView;
  const view = { slab: { frame: { kind: 'body-m', hostId: 'mars' } } } as unknown as SlabView;
  return pass.enabled!({} as PassState, ctx, view);
}

describe('bodyAlbedoMaskPass', () => {
  it('draws the mask while Mars is a globe', () => {
    expect(enabledAt(2 * ANTIQUE_RELIEF_MAX_ALT_M)).toBe(true);
  });

  it('keeps drawing it inside the relief shell, where the ground is engraved', () => {
    expect(enabledAt(0.5 * ANTIQUE_RELIEF_MAX_ALT_M)).toBe(true);
  });
});
