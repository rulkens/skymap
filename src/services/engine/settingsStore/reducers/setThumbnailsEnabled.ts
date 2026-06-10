/**
 * setThumbnailsEnabled — pure reducer for the galaxy-thumbnail overlay toggle.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `thumbnails` object, every sibling cluster left at its existing reference.
 * That ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place (`state.thumbnails.enabled = enabled`) would defeat both,
 * hence the spread.
 *
 * The reducer stores the boolean verbatim — the thumbnail master gate has no
 * clamp or derived companion; it is a plain on/off flag the render loop reads
 * each frame to decide whether to enqueue per-galaxy thumbnail quads.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setThumbnailsEnabled(
  state: EngineSettingsState,
  enabled: boolean,
): EngineSettingsState {
  return { ...state, thumbnails: { ...state.thumbnails, enabled } };
}
