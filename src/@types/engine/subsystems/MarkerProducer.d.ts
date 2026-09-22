import type { PassState } from '../frame/PassState';
import type { FrameView } from '../frame/FrameView';
import type { StructureMarkerDescriptor } from '../../rendering/StructureMarkerDescriptor';

export type MarkerProducer = {
  readonly id: string;
  produceMarkers(state: PassState, ctx: FrameView): readonly StructureMarkerDescriptor[];
};
