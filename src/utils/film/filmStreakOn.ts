/**
 * filmStreakOn — whether the anamorphic streak runs. One home for the
 * condition: the render-target rows allocate on it and the bloom encodes on it,
 * so a pass never reads a row that was not allocated.
 */

import type { FilmSettings } from '../../@types/settings/FilmSettings';

export function filmStreakOn(film: FilmSettings): boolean {
  return film.enabled && film.glow.streakStrength > 0;
}
