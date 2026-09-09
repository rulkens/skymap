import type { DebugViewWeights } from './DebugViewWeights';
import type { FieldDustSlices } from './FieldDustSlices';
import type { IsmMapChannelWeights } from './IsmMapChannelWeights';

/** The per-frame view lanes this builder reads — a structural subset of the tool's FrameView. */
export type FieldHeaderFrameLanes = {
  readonly view: Float32Array; // deriveFrameView.ts:53 — a raw mat4, not a Mat4 alias
  readonly aspect: number;
  readonly analyticExposure: number;
  readonly debugViews: DebugViewWeights;
  readonly galaxyWeight: number;
  readonly ismMapChannels: IsmMapChannelWeights;
  readonly dustSlices: FieldDustSlices;
  readonly starGrainFeatureScale: number;
};
