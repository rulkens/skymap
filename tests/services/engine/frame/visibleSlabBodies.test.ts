/**
 * visibleSlabBodies — which of `[earth, ...planets]` clear the sub-pixel
 * apparent-diameter floor and so get a body slab row this frame.
 */

import { describe, it, expect } from 'vitest';

import { visibleSlabBodies } from '../../../../src/services/engine/frame/visibleSlabBodies';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

function makeState(): BodyState {
  return { positionMpc: [1000, 0, 0], orientation: [...IDENTITY], meanAnomalyRad: 0 };
}

describe('visibleSlabBodies', () => {
  it('drops a body below the sub-pixel floor and keeps one above it', () => {
    // Both bodies sit at distanceMpc = 1000 under a 90° vertical FOV and a
    // 1000px-tall viewport, so pxPerRad = 500 and the apparent-diameter
    // formula reduces to diameterPx = diameterKpc·5e-4. radiusM = 3e22 lands
    // just under the 1px floor (≈0.972px); radiusM = 3.2e22 lands just over
    // it (≈1.037px) — see the task-4 report for the derivation.
    const belowFloor: PlanetBody = {
      id: 'below',
      label: 'Below floor',
      radiusM: 3e22,
      albedo: [1, 1, 1],
    };
    const aboveFloor: PlanetBody = {
      id: 'above',
      label: 'Above floor',
      radiusM: 3.2e22,
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([
      ['below', makeState()],
      ['above', makeState()],
    ]);

    const visible = visibleSlabBodies({
      earth: null,
      planets: [belowFloor, aboveFloor],
      bodyStates,
      camPosMpc: [0, 0, 0],
      viewportHeightPx: 1000,
      fovYRad: Math.PI / 2,
    });

    expect(visible.map((body) => body.id)).toEqual(['above']);
  });

  it('includes earth alongside surviving planets, and drops a body missing a bodyState', () => {
    const earth = { id: 'earth', label: 'Earth', radiusM: 6.371e6 };
    const orphan: PlanetBody = {
      id: 'orphan',
      label: 'Orphan',
      radiusM: 3.2e22,
      albedo: [1, 1, 1],
    };
    const bodyStates = new Map<string, BodyState>([['earth', makeState()]]);

    const visible = visibleSlabBodies({
      earth,
      planets: [orphan],
      bodyStates,
      camPosMpc: [1000, 0, 0], // camera AT earth's stored position ⇒ distance 0 ⇒ Infinity px, always resolved
      viewportHeightPx: 1000,
      fovYRad: Math.PI / 2,
    });

    expect(visible.map((body) => body.id)).toEqual(['earth']);
  });
});
