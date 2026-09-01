import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
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
  galaxies: { intensity: 0.45, pointSizePx: 1 },
  // Reproduces the splat pass's hardcoded look exactly: intensity 1 is the identity
  // multiplier splatBlit.wesl always applied implicitly (no knob existed before this),
  // pointSizePx 1 is the single-pixel footprint splatTransform.wesl always wrote.
  agents: { intensity: 1, pointSizePx: 1 },
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
    paletteId: 'inferno',
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
    // Half the raymarch layer's default 3 — the compute-bound path tracer feels the
    // divisor's quadratic win harder, so a lower default still lands interactive.
    divisor: 2,
    // Rationale: ViewSlice.d.ts's sampleCap doc comment.
    sampleCap: 512,
  },
};

const PITCH_LIMIT = 1.5;

// 'divisor' and 'sampleCap' get their own setters (below), sibling-shaped to the
// raymarch layer's setDivisor — excluded here the same way 'compressive' is.
type PathTracerNumericKey = Exclude<
  keyof ViewSlice['pathTracer'],
  'compressive' | 'divisor' | 'sampleCap' | 'paletteId'
>;

export const viewSlice = createSlice({
  name: 'view',
  initialState: defaultViewSlice,
  reducers: {
    setLayerEnabled: (
      state,
      action: PayloadAction<{ layer: keyof ViewSlice['layers']; on: boolean }>,
    ) => {
      state.layers[action.payload.layer] = action.payload.on;
    },
    setGalaxyIntensity: (state, action: PayloadAction<number>) => {
      state.galaxies.intensity = action.payload;
    },
    setGalaxyPointSize: (state, action: PayloadAction<number>) => {
      state.galaxies.pointSizePx = action.payload;
    },
    setAgentIntensity: (state, action: PayloadAction<number>) => {
      state.agents.intensity = action.payload;
    },
    setAgentPointSize: (state, action: PayloadAction<number>) => {
      state.agents.pointSizePx = action.payload;
    },
    setFps: (state, action: PayloadAction<number>) => {
      state.fps = action.payload;
    },
    setCameraYawPitch: (state, action: PayloadAction<{ yaw: number; pitch: number }>) => {
      state.camera.yaw = action.payload.yaw;
      state.camera.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, action.payload.pitch));
    },
    setCameraDistance: (state, action: PayloadAction<number>) => {
      state.camera.distance = Math.max(1, action.payload);
    },
    setCameraTarget: (state, action: PayloadAction<Vec3>) => {
      state.camera.targetMpc = action.payload;
    },
    setAutoRotate: (state, action: PayloadAction<boolean>) => {
      state.camera.autoRotate = action.payload;
    },
    setOpticalThickness: (state, action: PayloadAction<number>) => {
      state.raymarch.opticalThickness = action.payload;
    },
    setRaymarchPaletteId: (state, action: PayloadAction<ScalarFieldPaletteId>) => {
      state.raymarch.paletteId = action.payload;
    },
    setTrimDensity: (state, action: PayloadAction<number>) => {
      state.raymarch.trimDensity = action.payload;
    },
    setSampleWeight: (state, action: PayloadAction<number>) => {
      state.raymarch.sampleWeight = action.payload;
    },
    setStepVoxels: (state, action: PayloadAction<number>) => {
      state.raymarch.stepVoxels = action.payload;
    },
    setAdditive: (state, action: PayloadAction<boolean>) => {
      state.raymarch.additive = action.payload;
    },
    setDivisor: (state, action: PayloadAction<number>) => {
      state.raymarch.divisor = action.payload;
    },
    /** T18: Viewport both sets this true on the ControlsPanel toggle and flips it
     * back to false itself once the packed preview goes stale — see ViewSlice. */
    setPreviewPacked: (state, action: PayloadAction<boolean>) => {
      state.raymarch.previewPacked = action.payload;
    },
    setPathTracerPaletteId: (state, action: PayloadAction<ScalarFieldPaletteId>) => {
      state.pathTracer.paletteId = action.payload;
    },
    setPathTracerParam: (
      state,
      action: PayloadAction<{ key: PathTracerNumericKey; value: number }>,
    ) => {
      state.pathTracer[action.payload.key] = action.payload.value;
    },
    setPathTracerCompressive: (state, action: PayloadAction<boolean>) => {
      state.pathTracer.compressive = action.payload;
    },
    setPathTracerDivisor: (state, action: PayloadAction<number>) => {
      state.pathTracer.divisor = action.payload;
    },
    setPathTracerSampleCap: (state, action: PayloadAction<number>) => {
      state.pathTracer.sampleCap = action.payload;
    },
  },
});

export const {
  setLayerEnabled,
  setGalaxyIntensity,
  setGalaxyPointSize,
  setAgentIntensity,
  setAgentPointSize,
  setFps,
  setCameraYawPitch,
  setCameraDistance,
  setCameraTarget,
  setAutoRotate,
  setOpticalThickness,
  setRaymarchPaletteId,
  setTrimDensity,
  setSampleWeight,
  setStepVoxels,
  setAdditive,
  setDivisor,
  setPreviewPacked,
  setPathTracerPaletteId,
  setPathTracerParam,
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerSampleCap,
} = viewSlice.actions;
