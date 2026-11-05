import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { LabelName } from '../../animation/LabelName';
import type { Label3DProducerOutput } from './Label3DProducerOutput';

/** A subsystem that contributes world-anchored Label3D content. */
export type Label3DProducer = {
  readonly id: string;
  /** The row's label entry; `runLabel3DProducers` recedes the producer's labels by it. */
  readonly label?: LabelName;
  produceLabels3D(state: EngineState, ctx: FrameView): Label3DProducerOutput;
};
