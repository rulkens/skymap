import type { SurfaceFixedSite } from '../../scene/SurfaceFixedSite';
import type { OrbitalElements } from '../../scene/OrbitalElements';
import type { SampledBody } from '../../missions/SampledBody';

/** One variant per position table a moved row lands in; `anchor` arrives with the first row that needs it. */
export type BodyPosition =
  | { readonly kind: 'site'; readonly site: SurfaceFixedSite }
  | { readonly kind: 'orbit'; readonly elements: OrbitalElements }
  | { readonly kind: 'sampled'; readonly sampled: SampledBody };
