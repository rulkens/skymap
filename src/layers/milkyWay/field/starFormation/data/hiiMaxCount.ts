/**
 * Component-budget ceiling for the whole tier. HII draws into its own
 * targets off the field renderer's `hiiComps`, not a
 * reservation against `GALAXY_FIELD_MAX_COMPONENTS` — a plain per-galaxy
 * admission ceiling: `planRegions` sorts regions brightest-first and drops
 * the faintest ones once their sprite cost would cross it, bounding a
 * single galaxy's worst-case component count regardless of how many SF
 * events its catalog produced.
 */
export const HII_MAX_COUNT = 600;
