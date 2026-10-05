import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { Label3DProducerOutput } from './Label3DProducerOutput';

/** A subsystem that contributes world-anchored Label3D content. */
export type Label3DProducer = {
  readonly id: string;
  produceLabels3D(state: EngineState, ctx: FrameView): Label3DProducerOutput;
};
