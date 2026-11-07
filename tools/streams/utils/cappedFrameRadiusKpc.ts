import {
  STREAM_FOCUS_DISTANCE_PER_RADIUS,
  STREAM_FOCUS_MAX_SUN_DISTANCE_KPC,
  STREAM_FOCUS_MIN_SUN_DISTANCE_KPC,
} from '../data/streamFrameCap.constants';

/**
 * The frame radius a focus may use: the stream's own, kept inside the streams' fully-shown range whichever
 * side of the anchor the camera settles. Out: anchor distance + arrival ≤ max. In: arrival − anchor distance
 * ≥ min. Where both cannot hold the floor wins (the stream stays visible); an anchor already past the out
 * range keeps its radius, since no framing brings it back.
 */
export function cappedFrameRadiusKpc(radiusKpc: number, anchorSunDistanceKpc: number): number {
  const floor =
    (STREAM_FOCUS_MIN_SUN_DISTANCE_KPC + anchorSunDistanceKpc) / STREAM_FOCUS_DISTANCE_PER_RADIUS;
  const room = STREAM_FOCUS_MAX_SUN_DISTANCE_KPC - anchorSunDistanceKpc;
  const cap = room <= 0 ? radiusKpc : room / STREAM_FOCUS_DISTANCE_PER_RADIUS;
  return Math.max(Math.min(radiusKpc, cap), floor);
}
