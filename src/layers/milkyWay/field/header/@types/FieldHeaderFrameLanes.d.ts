import type { DebugViewWeights } from './DebugViewWeights';
import type { FieldDustSlices } from '../../dust/@types/FieldDustSlices';
import type { IsmMapChannelWeights } from './IsmMapChannelWeights';

/** The per-frame view lanes this builder reads — a structural subset of the tool's `FieldFrameLanes`. */
export type FieldHeaderFrameLanes = {
  readonly analyticExposure: number;
  readonly debugViews: DebugViewWeights;
  readonly galaxyWeight: number;
  readonly ismMapChannels: IsmMapChannelWeights;
  readonly dustSlices: FieldDustSlices;
  readonly starGrainFeatureScale: number;
};
