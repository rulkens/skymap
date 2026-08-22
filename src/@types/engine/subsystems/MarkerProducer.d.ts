import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { StructureMarkerDescriptor } from '../../rendering/StructureMarkerDescriptor';

export type MarkerProducer = {
  readonly id: string;
  produceMarkers(state: EngineState, ctx: ReadyFrameContext): readonly StructureMarkerDescriptor[];
};
