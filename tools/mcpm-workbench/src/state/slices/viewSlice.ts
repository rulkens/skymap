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
  camera: { yaw: 0.6, pitch: 0.35, distance: 600, autoRotate: false, targetOffsetMpc: [0, 0, 0] },
  raymarch: {
    opticalThickness: 0.25,
    paletteId: 'inferno',
    trimDensity: 1e-5,
    sampleWeight: 0.01,
    stepVoxels: 1,
    additive: true,
    previewPacked: false,
  },
  // Fork defaults per task-V2A-report.md, except sampleWeight/traceMax (V2B fix
  // round 1): the tracking majorant is σ_max = sigmaT · sampleWeight · traceMax,
  // mean free path ≈ 1/σ_max, so a majorant must clear the field's real peak or
  // delta tracking undersamples the densest voxels. packLogTraceVoxels.ts's own
  // docblock is the field's measured tail (MCPM: max≈40000, p99≈320) — sizing
  // traceMax at that max with sampleWeight 1e-4 gives σ_max = 4/voxel, mfp ≈
  // 0.25 voxel, so the 512-step tracking cap covers ~128 voxels of a ray —
  // half the default 256-voxel long axis. Grazing rays through the full
  // diagonal of a large grid can still exhaust the cap; a piloting pass with
  // eyes on the actual image is still owed (not part of this fix).
  pathTracer: {
    sigmaT: 1.0,
    albedo: 0.9,
    sigmaE: 1.0,
    anisotropy: 0.3,
    ambientTrace: 0.02,
    bounces: 4,
    traceMax: 4e4,
    exposure: 1.0,
    compressive: false,
    trimDensity: 1e-5,
    sampleWeight: 1e-4,
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

export function setCameraTargetOffset(prev: ViewSlice, targetOffsetMpc: Vec3): ViewSlice {
  return { ...prev, camera: { ...prev.camera, targetOffsetMpc } };
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
