import type { FrameNeedsRenderInputs } from '../../../../@types/render/FrameNeedsRenderInputs';

export function frameNeedsRender(inputs: FrameNeedsRenderInputs): boolean {
  return (
    inputs.dirty ||
    inputs.simRunning ||
    (inputs.pathTracerOn && inputs.pathTracerSampleCount < inputs.pathTracerSampleCap) ||
    inputs.nowMs < inputs.holdUntilMs
  );
}
