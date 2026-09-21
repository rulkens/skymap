import type { EngineState } from '../state/EngineState';
import type { FrameView } from '../frame/FrameView';
import type { StructureMarkerDescriptor } from '../../rendering/StructureMarkerDescriptor';

export type MarkerProducer = {
  readonly id: string;
  produceMarkers(state: EngineState, ctx: FrameView): readonly StructureMarkerDescriptor[];
};
