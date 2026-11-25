import type { FrameRateZone } from '../../../../@types/FrameRateZone';
import { FRAME_RATE_RECOVERY_FPS } from './FRAME_RATE_RECOVERY_FPS';
import { FRAME_RATE_ZONE_BELOW } from './FRAME_RATE_ZONE_BELOW';

/**
 * frameRateZone — the zone to show next, given the one shown now. A slower zone
 * shows at once; a faster one only once the rate clears its threshold by
 * FRAME_RATE_RECOVERY_FPS, so a rate hovering on 20 holds one colour. Paused, or
 * 0 fps (not measured yet), is normal: no colour until a sample says so.
 */
export function frameRateZone(
  previous: FrameRateZone,
  fps: number,
  running: boolean,
): FrameRateZone {
  if (!running || fps <= 0) return 'normal';
  const zoneAt = (rate: number): FrameRateZone =>
    rate < FRAME_RATE_ZONE_BELOW.bad ? 'bad' : rate < FRAME_RATE_ZONE_BELOW.warn ? 'warn' : 'good';
  const now = zoneAt(fps);
  const recovering =
    (previous === 'warn' && now === 'good') || (previous === 'bad' && now !== 'bad');
  return recovering ? zoneAt(fps - FRAME_RATE_RECOVERY_FPS) : now;
}
