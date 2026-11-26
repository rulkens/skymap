/** The horizon tile level each globe tier repacks from (spec §7): small z2, medium z3, which hold
 *  the posts of z4 and z5. No large: the registry caps the horizon kind at medium (`bodyTextureRegistry`). */
export const HORIZON_GLOBE_LEVELS = [
  { tier: 'small', level: 2 },
  { tier: 'medium', level: 3 },
] as const;
