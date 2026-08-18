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
  layers: { raymarch: true, agents: false, galaxies: true },
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
