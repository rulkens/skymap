import type { PipelineStep } from './PipelineStep';

export type AssetProvenance = {
  readonly source: 'nationalGeodataApi' | 'userPhotoCapture';
  /** ISO date of the SOURCE material (flight date, shoot date) — not the bake date. */
  readonly sourceVintage: string;
  /** Ordered; each step names the external tool and the version that produced it. */
  readonly pipeline: readonly PipelineStep[];
};
