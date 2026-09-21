/**
 * Core-cluster settings selectors — orientation, camera, tonemap, hdr,
 * bloom, debug, and the eleven clip-path-tuning leaves. Every Layer's own
 * cluster selectors live in `src/layers/<layer>/state/<slice>/selectors.ts`
 * instead; this module is the one-file-per-cluster-group override of the
 * repo's one-function-per-file rule.
 */

import { selectSettings } from './selectSettings';
import type { RootState } from '../../store/types';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SplineMode } from '../../@types/animation/SplineMode';
import type { PassByDir } from '../../@types/animation/PassByDir';
import type { ClipPathTuningActive } from '../../@types/settings/ClipPathTuningActive';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';

// --- orientation (bare scalar) ------------------------------------------------

/**
 * Camera orientation frame — which astronomical pole is "up". A primitive
 * (string-union) read, so no memoization; the consuming camera code reads it to
 * pick the frame-local-to-world basis from `ORIENTATION_FRAMES`.
 */
export const selectOrientation = (state: RootState): OrientationFrameId =>
  selectSettings(state).orientation;

// --- camera cluster -------------------------------------------------------------

/**
 * Vertical field of view, in degrees — the "Field of view" knob. A primitive
 * read, so no memoization. `runFrame` converts it to radians and writes it onto
 * `cameraRuntime.outputs.projection.fovYRad` once per frame.
 */
export const selectFovDeg = (state: RootState): number => selectSettings(state).camera.fovDeg;

// --- tonemap cluster ----------------------------------------------------------

export const selectExposure = (state: RootState): number => selectSettings(state).tonemap.exposure;

export const selectToneMapCurve = (state: RootState): ToneMapCurve =>
  selectSettings(state).tonemap.curve;

// --- hdr cluster ----------------------------------------------------------

export const selectHdrEnabled = (state: RootState): boolean => selectSettings(state).hdr.enabled;

export const selectHdrKnee = (state: RootState): number => selectSettings(state).hdr.knee;

export const selectHdrHeadroom = (state: RootState): number => selectSettings(state).hdr.headroom;

// --- bloom cluster ------------------------------------------------------------

export const selectBloomEnabled = (state: RootState): boolean =>
  selectSettings(state).bloom.enabled;

export const selectBloomStrength = (state: RootState): number =>
  selectSettings(state).bloom.strength;

export const selectBloomThreshold = (state: RootState): number =>
  selectSettings(state).bloom.threshold;

// --- debug cluster ------------------------------------------------------------

export const selectDebugOverlays = (state: RootState): Record<DebugOverlayKey, boolean> =>
  selectSettings(state).debug.overlays;

export const selectTerrainPickMarkerRadiusM = (state: RootState): number =>
  selectSettings(state).debug.terrainPickMarkerRadiusM;

export const selectDisabledPasses = (state: RootState): Record<string, boolean> =>
  selectSettings(state).debug.disabledPasses;

export const selectClipPathInspectId = (state: RootState): ClipId | null =>
  selectSettings(state).debug.clipPathInspect.clipId;

export const selectClipPathScrub = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.scrub01;

export const selectClipPathAlign = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.align;

export const selectClipPathRampSec = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.rampSec;

export const selectClipPathLinger = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.linger;

export const selectClipPathLingerSec = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.lingerSec;

export const selectClipPathSpline = (state: RootState): SplineMode =>
  selectSettings(state).debug.clipPathInspect.spline;

export const selectClipPathTurnDelay = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.turnDelay;

export const selectClipPathLookAhead = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.lookAhead;

export const selectClipPathPassByOffset = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.passByOffset;

export const selectClipPathPassByDir = (state: RootState): PassByDir =>
  selectSettings(state).debug.clipPathInspect.passByDir;

export const selectClipPathTuningActive = (state: RootState): ClipPathTuningActive =>
  selectSettings(state).debug.clipPathInspect.active;
