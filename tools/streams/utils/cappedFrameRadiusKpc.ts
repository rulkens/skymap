import {
  STREAM_FOCUS_DISTANCE_PER_RADIUS,
  STREAM_FOCUS_MAX_SUN_DISTANCE_KPC,
} from '../data/streamFrameCap.constants';

/**
 * The frame radius a focus may use: the stream's own, cut so the camera stays within the streams' fully-on
 * range whichever side of the anchor it settles (`anchor distance + arrival distance`). A stream whose anchor
 * already lies past that range keeps its radius: no framing could bring it back.
 */
export function cappedFrameRadiusKpc(radiusKpc: number, anchorSunDistanceKpc: number): number {
  const room = STREAM_FOCUS_MAX_SUN_DISTANCE_KPC - anchorSunDistanceKpc;
  if (room <= 0) return radiusKpc;
  return Math.min(radiusKpc, room / STREAM_FOCUS_DISTANCE_PER_RADIUS);
}
