import type { RenderTargetSpec } from '../../@types/engine/frame/RenderTargetSpec';
import type { EngineState } from '../../@types/engine/state/EngineState';

/** A row's first-touch clear colour for this frame; constant rows ignore the state. */
export function clearValueOf(spec: RenderTargetSpec, state: EngineState): GPUColor {
  return typeof spec.clearValue === 'function' ? spec.clearValue(state) : spec.clearValue;
}
