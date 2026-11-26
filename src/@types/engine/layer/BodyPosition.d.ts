import type { SurfaceFixedSite } from '../../scene/SurfaceFixedSite';
import type { OrbitalElements } from '../../scene/OrbitalElements';
import type { EphemerisCorrection } from '../../scene/EphemerisCorrection';
import type { BarycentricPair } from '../../scene/BarycentricPair';
import type { SampledBody } from '../../scene/SampledBody';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

/** One variant per position table a moved row lands in. */
export type BodyPosition =
  | { readonly kind: 'site'; readonly site: SurfaceFixedSite }
  | {
      readonly kind: 'orbit';
      readonly elements: OrbitalElements;
      /** The row's fitted Horizons correction; absent = pure Kepler. */
      readonly correction?: EphemerisCorrection;
      /** Set when `elements` describe a pair barycentre; the body sits the other way from `secondaryId`. */
      readonly pair?: BarycentricPair;
    }
  | { readonly kind: 'anchor'; readonly positionMpc: Vec3 }
  | { readonly kind: 'sampled'; readonly sampled: SampledBody };
