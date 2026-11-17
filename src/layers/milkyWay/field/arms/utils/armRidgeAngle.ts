/**
 * Math-derivation exception (comments.md): the arm-ridge angle, shared truth for
 * "where the ridge is" that the ridge chain, the arm particle cloud and the dust
 * lane all place themselves against. Its own module so `deriveArmCloudCount` can use
 * it without cycling through `galaxyFieldMixture.ts`.
 */
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

/** Ridge angle: log-spiral phase + meander + (gated) high-frequency wave — shared by `sfEventCatalog.ts` and the dust lane rather than re-derived. */
export function armRidgeAngle(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): number {
  const angle =
    arm.phase +
    arm.pitch * logR +
    arm.meanderAmp * Math.sin(arm.meanderFreq * logR * 2 + arm.meanderPhase);
  // waveAmount is 0 for most presets, so no separate gate is needed here,
  // unlike the WGSL source's `if` (which skips four sin() calls per star).
  return (
    angle +
    geometry.waveAmount *
      (Math.sin(arm.waveF1 * logR + arm.waveP1) * 0.16 +
        Math.sin(arm.waveF2 * logR + arm.waveP2) * 0.09)
  );
}
