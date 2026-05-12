import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { LabelProducerOutput } from './LabelProducerOutput';

/** A subsystem that contributes label + marker-line content. */
export type LabelProducer = {
  /** Stable identifier — used for debugging and de-duplication. */
  readonly id: string;
  /** Per-frame entry point.  Pure of state; reads `state`, returns fresh output. */
  produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput;
};
