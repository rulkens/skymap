import type { AppState } from '../../../../@types/AppState';
import type { GridBox } from '../../../../@types/GridBox';
import type { TraceView } from '../../../render/tracePass';
import type { McpmCameraView } from '../../../render/writeMcpmCamera';

export function traceViewFor(s: AppState, box: GridBox, cam: McpmCameraView): TraceView {
  return {
    eyeMpc: cam.eyeMpc,
    targetMpc: cam.targetMpc,
    upMpc: cam.upMpc,
    fovYRad: cam.fovYRad,
    aspect: cam.viewportPx[0] / cam.viewportPx[1],
    trimDensity: s.view.raymarch.trimDensity,
    sampleWeight: s.view.raymarch.sampleWeight,
    opticalThickness: s.view.raymarch.opticalThickness,
    stepVoxels: s.view.raymarch.stepVoxels,
    additive: s.view.raymarch.additive,
    // Scaled to the grid AND the step length, never fixed: the box diagonal is longer
    // than any axis, and sub-1 stepVoxels needs proportionally more steps — a bound
    // short of the crossing truncates the march silently, with no visual cue that it did.
    maxSteps: Math.ceil(
      (2 * Math.max(box.dims[0], box.dims[1], box.dims[2])) /
        Math.max(s.view.raymarch.stepVoxels, 0.25),
    ),
  };
}
