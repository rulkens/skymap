import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';

/**
 * The field tuning with the dust cloud switched off: a zero cloud count, so
 * the whole scene (central galaxy AND every extra) places no dust particles.
 * Patches the outgoing copy, never the stored tuning.
 */
export function withoutDustCloud(tuning: GalaxyFieldTuning): GalaxyFieldTuning {
  return { ...tuning, dust: { ...tuning.dust, cloud: { ...tuning.dust.cloud, count: 0 } } };
}
