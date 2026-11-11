import type { SkyView } from '../../@types/engine/SkyView';

/** Field-wise, since the row builds a fresh record every frame. */
export function skyViewChanged(prev: SkyView, next: SkyView): boolean {
  if (prev === null || next === null) return prev !== next;
  return (
    prev.azimuthRad !== next.azimuthRad ||
    prev.spot.body !== next.spot.body ||
    prev.spot.lonRad !== next.spot.lonRad ||
    prev.spot.latRad !== next.spot.latRad
  );
}
