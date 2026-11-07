import type { SkySpot } from '../camera/pose/SkySpot';
import type { Vec3 } from '../math/Vec3';

/**
 * SkyEntryFacts — where "Look up from here" would stand: the view-centre ground hit on the
 * engaged terrain host. `spot`/`pointLocalM` (body-fixed metres) are null on a miss, off a
 * terrain host, or above `SKY_ENTRY_MAX_ALT_M`, where nothing reads them and no ray is cast.
 */
export type SkyEntryFacts = {
  readonly spot: SkySpot | null;
  readonly pointLocalM: Vec3 | null;
  /** The eye over the live ground under it, metres; +∞ off a body arm. */
  readonly altitudeM: number;
};
