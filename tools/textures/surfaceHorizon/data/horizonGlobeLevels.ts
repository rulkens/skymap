/** The coarse tile level each globe tier repacks from (spec §7): small z4, medium z5. No large:
 *  the registry caps the horizon kind at medium (`bodyTextureRegistry`). */
export const HORIZON_GLOBE_LEVELS = [
  { tier: 'small', level: 4 },
  { tier: 'medium', level: 5 },
] as const;
