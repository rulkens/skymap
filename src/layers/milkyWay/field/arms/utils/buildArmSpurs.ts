/**
 * buildArmSpurs — interarm spurs ("feathers"): short `GalaxyFieldArmRecord`s
 * rooted along each parent arm, rendered by the shared ridge vocabulary like
 * an ordinary arm (`deriveArmSpurs` derives one arm's; the particle cloud
 * is `deriveArmSpurCloudCount`'s side). Pure, no engine state.
 */
import { mulberry32 } from '../../../../../utils/random/mulberry32';
import type { GalaxyArmSpurTuning } from '../@types/GalaxyArmSpurTuning';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import { deriveArmSpurs } from './deriveArmSpurs';

/** "SPUR" — this tier's own rng salt, the `deriveArmCloudCount.ts`/"ARMC" precedent. */
const ARM_SPUR_SEED_SALT = 0x53505552;

/**
 * Every arm's spurs, one rng stream advanced across arms in `geometry.arms`
 * order (not re-salted per arm) — the same "continue the stream" idiom
 * `describeGalaxy`'s `clumpStream`/`waveStream` use across their own arm
 * loop, so a change to arm count still reruns a deterministic prefix of the
 * same sequence rather than reshuffling every arm's spurs.
 */
export function buildArmSpurs(
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
  seed: number,
): readonly GalaxyFieldArmRecord[] {
  if (!tuning.enabled || geometry.numArms <= 0) return [];
  const rng = mulberry32((seed ^ ARM_SPUR_SEED_SALT) >>> 0);
  const out: GalaxyFieldArmRecord[] = [];
  for (const arm of geometry.arms) {
    out.push(...deriveArmSpurs(arm, geometry, tuning, rng));
  }
  return out;
}
