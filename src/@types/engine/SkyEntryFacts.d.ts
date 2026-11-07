import type { SkySpot } from '../camera/pose/SkySpot';
import type { Vec3 } from '../math/Vec3';

/**
 * SkyEntryFacts — where "Look up from here" would stand: the view-centre ground hit on the
 * engaged terrain host, at any altitude (`selectSkyEntry` applies the ceiling). `spot` and
 * `pointLocalM` (body-fixed metres) are null on a miss or off a terrain host.
 */
export type SkyEntryFacts = {
  readonly spot: SkySpot | null;
  readonly pointLocalM: Vec3 | null;
  /** The eye over the live ground under it, metres; +∞ off a body arm. */
  readonly altitudeM: number;
};
