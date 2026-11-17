import type { FieldDustSlices } from '../../dust/@types/FieldDustSlices';

/** The lanes derived per frame by `deriveFieldFrameLanes`; the rest ride `FieldHostTuning['render']`. */
export type FieldHeaderFrameLanes = {
  readonly analyticExposure: number;
  readonly dustSlices: FieldDustSlices;
  readonly starGrainFeatureScale: number;
};
