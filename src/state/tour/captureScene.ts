/**
 * captureScene — a SELECTOR that takes a detached snapshot of the ten
 * tour-owned settings clusters, `settings.orientation`, AND `selection.focus`
 * off the live store state.
 *
 * The cinematic tour captures the scene before playing a beat (which may call
 * `focus()`, mutate visibility knobs, or fire a `frameTo` cue), then restores
 * the capture in `guidedTourSaga`'s `finally`. The saga reads it with
 * `yield* select(captureScene)` — a pure store read, so capture needs no
 * engine effect at all (the matching restore, by contrast, dispatches and so
 * lives in `restoreSceneSaga`).
 *
 * `captureSettings` handles the deep-clone of the ten settings clusters;
 * this selector adds `orientation` and the focus slot on top, making the
 * snapshot wide enough to fully rewind to the pre-beat state. `orientation`
 * is captured HERE rather than inside `captureSettings` — see
 * `SceneSnapshot`'s header for why it must not ride inside `settings`.
 *
 * The settings half is a `structuredClone` (see `captureSettings`).
 * `orientation` is a bare string union, so a plain read is already detached —
 * no clone needed. The focus half is a plain reference copy: `SelectionRef`
 * values are immutable identity tokens — the slice replaces the slot on
 * write, never mutates in place — so holding the reference is sufficient to
 * restore back to the captured identity.
 *
 * Selection fields beyond `focus` (`hover`, `select`) are ephemeral UI
 * responses, not tour-owned intent — the tour does not drive them and must not
 * stomp them on restore.
 */

import type { RootState } from '../../store/types';
import type { SceneSnapshot } from '../../@types/engine/settings/SceneSnapshot';
import { captureSettings } from './captureSettings';

export function captureScene(state: RootState): SceneSnapshot {
  return {
    settings: captureSettings(state),
    orientation: state.settings.orientation,
    focus: state.selection.focus,
  };
}
