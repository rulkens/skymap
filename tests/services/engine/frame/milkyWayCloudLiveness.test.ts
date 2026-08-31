/**
 * deriveMilkyWayCloudAlpha's approach fade — regression coverage for the
 * galactic-centre blowout: the GC gets its OWN approach band
 * (`milkyWayApproachGc`), wider than the Sun's, closing fully at the Centre.
 * The Sun's own descent (`milkyWayApproachSun`) is unaffected by the GC.
 */

import { describe, it, expect } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveMilkyWayCloudAlpha } from '../../../../src/services/engine/frame/milkyWayCloudLiveness';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PC = SCALE_UNITS.PC_TO_MPC;
const SGR_A_STAR_POS = deriveBodyStates(CONST_J2000).get('sgr-a-star')!.positionMpc;

// Comfortably above the disc's apparent-size gate (12 px) and with every
// clip/focus/fade term pinned at 1, so the returned alpha isolates the
// approach band under test.
const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS = { width: 1280, height: 720 };

function makeState(): EngineState {
  return {
    settings: { milkyWay: { enabled: true } },
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

function makeCtx(camPosMpc: Vec3): ReadyFrameContext {
  return {
    nowMs: 0,
    focusBlend: 0,
    simDays: CONST_J2000,
    drawCamPos: camPosMpc,
    fovYRad: FOV_Y_RAD,
    canvasSize: CANVAS,
    vp: new Float32Array(16) as unknown as Mat4,
  } as unknown as ReadyFrameContext;
}

/** A point `distMpc` from Sgr A*, offset along its own local x-axis. */
function nearGalacticCentre(distMpc: number): Vec3 {
  return [SGR_A_STAR_POS[0] + distMpc, SGR_A_STAR_POS[1], SGR_A_STAR_POS[2]];
}

describe('deriveMilkyWayCloudAlpha — galactic-centre approach fade', () => {
  it('culls the cloud entirely within 100 pc of Sgr A*', () => {
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx(nearGalacticCentre(100 * PC)));
    expect(alpha).toBeNull();
  });

  it('partially fades between the galactic-centre approach band edges', () => {
    const distMpc = 1000 * PC; // between goneAt (200 pc) and fullAt (4 kpc)
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx(nearGalacticCentre(distMpc)));
    const expected = fadeBand(SCALE_FADE_BANDS.milkyWayApproachGc, distMpc);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
    expect(alpha).toBeCloseTo(expected, 6);
  });

  it('stays at full alpha outside both approach bands', () => {
    // The GC band's 12 kpc fullAt reaches past the Sun (R₀ = 8.2 kpc), so a
    // pose outside BOTH bands must sit on the far side of the Sun from the
    // Centre: 5 kpc anti-GC-ward is 13.2 kpc from Sgr A* and 5 kpc from the
    // Sun — outside each band's fullAt.
    const r0 = Math.hypot(SGR_A_STAR_POS[0], SGR_A_STAR_POS[1], SGR_A_STAR_POS[2]);
    const awayFromGc = SGR_A_STAR_POS.map((c) => (-c / r0) * 0.005) as unknown as Vec3;
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx(awayFromGc));
    expect(alpha).toBe(1);
  });
});
