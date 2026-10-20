import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { LabelName } from '../../animation/LabelName';
import type { Label2DProducerOutput } from './Label2DProducerOutput';

/** A subsystem that contributes label + marker-line content. */
export type Label2DProducer = {
  /** Stable identifier — used for debugging and de-duplication. */
  readonly id: string;
  /** The row's label entry; the director recedes the producer's labels by it. */
  readonly label?: LabelName;
  /** Per-frame entry point.  Pure of state; reads `state`, returns fresh output. */
  produceLabels(state: EngineState, ctx: FrameView): Label2DProducerOutput;
};
