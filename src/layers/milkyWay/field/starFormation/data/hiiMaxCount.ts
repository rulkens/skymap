/**
 * Component-budget ceiling for the whole tier. HII draws into its own
 * target (`createGalaxyEngine.ts`'s `hiiTex`/`hiiCompsBuf`), not a
 * reservation against `GALAXY_FIELD_MAX_COMPONENTS` — a plain per-galaxy
 * admission ceiling: `planRegions` sorts regions brightest-first and drops
 * the faintest ones once their sprite cost would cross it, bounding a
 * single galaxy's worst-case component count regardless of how many SF
 * events its catalog produced.
 */
export const HII_MAX_COUNT = 600;
