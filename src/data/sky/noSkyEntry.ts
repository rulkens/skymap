import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';

/** No entry on offer: off a body arm or a terrain host, and before the first frame reports. */
export const NO_SKY_ENTRY: SkyEntryFacts = { spot: null, pointLocalM: null, altitudeM: Infinity };
