/**
 * deriveMilkyWayCloudAlpha's approach fade — regression coverage for the
 * galactic-centre blowout: the GC gets its OWN approach band
 * (`milkyWayApproachGc`), wider than the Sun's, whose `floor` keeps the
 * impostor dimly visible there instead of vanishing outright (nothing else
 * covers the extincted bulge). The Sun's own descent (`milkyWayApproachSun`)
 * must still reach 0, unaffected by the GC.
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
  it('holds at the dim floor within 100 pc of Sgr A* instead of culling the cloud', () => {
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx(nearGalacticCentre(100 * PC)));
    expect(alpha).not.toBeNull();
    expect(alpha).toBeCloseTo(SCALE_FADE_BANDS.milkyWayApproachGc.floor, 6);
  });

  it('partially fades between the galactic-centre approach band edges', () => {
    const distMpc = 1000 * PC; // between goneAt (200 pc) and fullAt (4 kpc)
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx(nearGalacticCentre(distMpc)));
    const expected = fadeBand(SCALE_FADE_BANDS.milkyWayApproachGc, distMpc);
    expect(expected).toBeGreaterThan(SCALE_FADE_BANDS.milkyWayApproachGc.floor!);
    expect(expected).toBeLessThan(1);
    expect(alpha).toBeCloseTo(expected, 6);
  });

  it('stays at full alpha past 2 kpc from the Sun with the galactic centre nowhere near', () => {
    // The pre-fix calibration point this repoint must reproduce bit-for-bit:
    // deep in the disc, well outside the Sun's own approach band, with Sgr A*
    // itself far outside its own band too.
    const alpha = deriveMilkyWayCloudAlpha(makeState(), makeCtx([0, 0, 0.005]));
    expect(alpha).toBe(1);
  });
});
