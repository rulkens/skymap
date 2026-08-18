import type { ViewSlice } from '../../../@types/ViewSlice';
import type { ScalarFieldPaletteId } from '../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * defaultViewSlice — raymarch + galaxies on, framing a box a few hundred Mpc across
 * (the sim's own scale, not the runtime's power-of-ten ladder). `inferno`
 * matches the runtime MCPM volume entry's default palette (`src/data/sources/mcpm.ts`)
 * so a workbench/app comparison isn't also a palette diff. `trimDensity`/
 * `sampleWeight`/`stepVoxels` are the fork's shipped raymarch defaults (vendor
 * main.cpp:764,:770) — keep them exact so a workbench/fork comparison isn't
 * also a knob diff. `additive` is the deliberate exception (see ViewSlice).
 */
export const defaultViewSlice: ViewSlice = {
  layers: { raymarch: true, agents: false, galaxies: true, pathTracer: false },
  galaxies: { intensity: 0.6, pointSizePx: 2 },
  fps: 0,
  camera: { yaw: 0.6, pitch: 0.35, distance: 600, autoRotate: false, targetMpc: [0, 0, 0] },
  raymarch: {
    opticalThickness: 0.25,
    paletteId: 'inferno',
    trimDensity: 1e-5,
    sampleWeight: 0.01,
    stepVoxels: 1,
    additive: true,
    previewPacked: false,
    // S10: shipped default 3 = main-app volume-row parity (renderTargets.ts's
    // `scale: 3`) — slide to 1 for full-res, no offscreen target.
    divisor: 3,
  },
  // Fork's shipped tracking defaults (vendor main.cpp:770,784): traceMax=100,
  // sampleWeight=0.01 — NOT a majorant sized at the field's max (4e4). That
  // sizing shrinks the Woodcock step to 0.25 voxel (rhoMax=4/voxel), so the
  // 512-step tracking cap only reaches ~128 voxels into a 256-long-axis box
  // (CPU repro: 0% of first-scatters past halfway, 81.5% cap-exhaustion at
  // mean density). traceMax=100 instead CLAMPS the rare hot tail (up to 4e4):
  // accept probability saturates at 1 once eventRho > rhoMax (volpath.wesl's
  // `xi <= eventRho * rhoMaxInv`, xi<1), biasing the hottest cores but giving
  // ~1-voxel mean steps that cross the whole box. sampleWeight also feeds the
  // emission palette (traceToRho) — 0.01 un-does the 100x darkening of 1e-4.
  pathTracer: {
    sigmaT: 1.0,
    albedo: 0.9,
    sigmaE: 1.0,
    anisotropy: 0.3,
    ambientTrace: 0.02,
    bounces: 4,
    traceMax: 100,
    exposure: 1.0,
    compressive: false,
    trimDensity: 1e-5,
    sampleWeight: 0.01,
  },
};

export function setLayerEnabled(
  prev: ViewSlice,
  layer: keyof ViewSlice['layers'],
  on: boolean,
): ViewSlice {
  return { ...prev, layers: { ...prev.layers, [layer]: on } };
}

export function setGalaxyIntensity(prev: ViewSlice, intensity: number): ViewSlice {
  return { ...prev, galaxies: { ...prev.galaxies, intensity } };
}

export function setGalaxyPointSize(prev: ViewSlice, pointSizePx: number): ViewSlice {
  return { ...prev, galaxies: { ...prev.galaxies, pointSizePx } };
}

export function setFps(prev: ViewSlice, fps: number): ViewSlice {
  return { ...prev, fps };
}

const PITCH_LIMIT = 1.5;

export function setCameraYawPitch(prev: ViewSlice, yaw: number, pitch: number): ViewSlice {
  return {
    ...prev,
    camera: { ...prev.camera, yaw, pitch: Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch)) },
  };
}

export function setCameraDistance(prev: ViewSlice, distance: number): ViewSlice {
  return { ...prev, camera: { ...prev.camera, distance: Math.max(1, distance) } };
}

export function setCameraTarget(prev: ViewSlice, targetMpc: Vec3): ViewSlice {
  return { ...prev, camera: { ...prev.camera, targetMpc } };
}

export function setAutoRotate(prev: ViewSlice, autoRotate: boolean): ViewSlice {
  return { ...prev, camera: { ...prev.camera, autoRotate } };
}

export function setOpticalThickness(prev: ViewSlice, opticalThickness: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, opticalThickness } };
}

export function setPaletteId(prev: ViewSlice, paletteId: ScalarFieldPaletteId): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, paletteId } };
}

export function setTrimDensity(prev: ViewSlice, trimDensity: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, trimDensity } };
}

export function setSampleWeight(prev: ViewSlice, sampleWeight: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, sampleWeight } };
}

export function setStepVoxels(prev: ViewSlice, stepVoxels: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, stepVoxels } };
}

export function setAdditive(prev: ViewSlice, additive: boolean): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, additive } };
}

export function setDivisor(prev: ViewSlice, divisor: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, divisor } };
}

/** T18: Viewport both sets this true on the ControlsPanel toggle and flips it
 * back to false itself once the packed preview goes stale — see ViewSlice. */
export function setPreviewPacked(prev: ViewSlice, previewPacked: boolean): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, previewPacked } };
}

type PathTracerNumericKey = Exclude<keyof ViewSlice['pathTracer'], 'compressive'>;

export function setPathTracerParam(
  prev: ViewSlice,
  key: PathTracerNumericKey,
  value: number,
): ViewSlice {
  return { ...prev, pathTracer: { ...prev.pathTracer, [key]: value } };
}

export function setPathTracerCompressive(prev: ViewSlice, compressive: boolean): ViewSlice {
  return { ...prev, pathTracer: { ...prev.pathTracer, compressive } };
}
