import type { LonLatDeg } from './LonLatDeg';
import type { SceneBodyId } from './SceneBodyId';

/** SampledBody — a body driven by a loaded track instead of orbital elements. */
export type SampledBody = {
  readonly id: SceneBodyId;
  /** Absent for a body that was never launched; present, the body rises from `pad` on Earth
   *  between `iso` and the track's first sample. */
  readonly launch?: { readonly iso: string; readonly pad: LonLatDeg };
};
