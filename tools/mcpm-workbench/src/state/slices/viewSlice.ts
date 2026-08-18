import type { ViewSlice } from '../../../@types/ViewSlice';
import type { ScalarFieldPaletteId } from '../../../../../src/@types/data/volume/ScalarFieldPaletteId';

/**
 * defaultViewSlice — trace raymarch, framing a box a few hundred Mpc across
 * (the sim's own scale, not the runtime's power-of-ten ladder). `inferno`
 * matches the runtime MCPM volume entry's default palette (`src/data/sources/mcpm.ts`)
 * so a workbench/app comparison isn't also a palette diff.
 */
export const defaultViewSlice: ViewSlice = {
  mode: 'traceRaymarch',
  camera: { yaw: 0.6, pitch: 0.35, distance: 600, autoRotate: false },
  raymarch: { opticalThickness: 1, paletteId: 'inferno' },
};

export function setViewMode(prev: ViewSlice, mode: ViewSlice['mode']): ViewSlice {
  return { ...prev, mode };
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

export function setAutoRotate(prev: ViewSlice, autoRotate: boolean): ViewSlice {
  return { ...prev, camera: { ...prev.camera, autoRotate } };
}

export function setOpticalThickness(prev: ViewSlice, opticalThickness: number): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, opticalThickness } };
}

export function setPaletteId(prev: ViewSlice, paletteId: ScalarFieldPaletteId): ViewSlice {
  return { ...prev, raymarch: { ...prev.raymarch, paletteId } };
}
