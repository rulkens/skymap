/**
 * filmLetterboxOn — whether the letterbox bars draw: the look on and its
 * letterbox switch on. One home for the condition the `letterbox` pass gates on.
 */

import type { FilmSettings } from '../../@types/settings/FilmSettings';

export function filmLetterboxOn(film: FilmSettings): boolean {
  return film.enabled && film.letterbox;
}
