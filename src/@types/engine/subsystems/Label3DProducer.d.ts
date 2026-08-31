import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { Label3DProducerOutput } from './Label3DProducerOutput';

/** A subsystem that contributes world-anchored Label3D content. */
export type Label3DProducer = {
  readonly id: string;
  produceLabels3D(state: EngineState, ctx: ReadyFrameContext): Label3DProducerOutput;
};
