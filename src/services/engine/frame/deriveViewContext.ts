/**
 * deriveViewContext — one rig view of this frame as a whole `ReadyFrameContext`:
 * the main context's pose and arm re-derived through a `ViewSpec`, so every
 * view shares one deterministic camera and a surface camera keeps its body arm.
 * Captures stay on `cubemapFaceContext`: own eye and axes, not camera-relative.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { ViewSpec } from '../../../@types/engine/frame/ViewSpec';
import { deriveFrameContext } from './frameContext';

export function deriveViewContext(
  state: EngineState,
  main: ReadyFrameContext,
  spec: ViewSpec,
): ReadyFrameContext | null {
  const { cam } = main;
  const ctx = deriveFrameContext(
    state,
    // Only `.width`/`.height` are read, and the spec's size wins over them.
    spec.sizePx as unknown as HTMLCanvasElement,
    { target: cam.target, yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, roll: cam.roll },
    // The arm `runFrame` derived `main` from: it assigns the stepped runtime
    // before deriving, and `main.cam` carries no arm of its own.
    state.cameraRuntime.outputs.displayed,
    { fovYRad: cam.fovYRad, aspect: cam.aspect, near: cam.near, far: cam.far },
    // `assembleOrbitCamera` always sets both; optional only on `OrbitCameraInit`.
    cam.poseBasis!,
    cam.upBasis!,
    main.visibleSourceMask,
    main.nowMs,
    main.simDays,
    undefined,
    spec,
  );
  if (!ctx.isReady) return null;
  // `runFrame` stamps these on the main ctx once per frame; a view shares them.
  return {
    ...ctx,
    focusBlend: main.focusBlend,
    focus: main.focus,
    layersSettling: main.layersSettling,
  };
}
