/**
 * Component-budget ceiling. `galaxyFieldMixture.ts` reserves exactly this
 * many slots (`pushArmRidges`' `reservedComponents`) before sizing the ridge
 * chain, so a huge derived count (`deriveArmCloudCount`) clamps here rather
 * than overflowing `GALAXY_FIELD_MAX_COMPONENTS`. Sized so the coverage
 * slider leads and this stays a backstop — at 400 the Milky Way preset
 * saturated around coverage 2.7, reading as a dead slider rather than a
 * budget hit.
 */
export const ARM_CLOUD_MAX_COUNT = 2000;
