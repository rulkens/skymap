/**
 * captureScene — take a detached snapshot of both the six tour-owned settings
 * clusters AND `selection.focus` off the live engine state.
 *
 * The cinematic tour captures the scene before playing a beat (which may call
 * `focus()` and mutate visibility knobs), then restores the capture in a
 * `finally`. `captureSettings` handles the deep-clone of the six settings
 * clusters; this wrapper adds the focus slot on top, making the snapshot wide
 * enough to fully rewind to the pre-beat state.
 *
 * The settings half is a `structuredClone` (see `captureSettings`). The focus
 * half is a plain reference copy: `SelectionRef` values are immutable identity
 * tokens — the slice replaces the slot on write, never mutates in place — so
 * holding the reference is sufficient to restore back to the captured identity.
 *
 * Selection fields beyond `focus` (`hover`, `select`) are ephemeral UI
 * responses, not tour-owned intent — the tour does not drive them and must not
 * stomp them on restore.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SceneSnapshot } from '../../../@types/engine/settings/SceneSnapshot';
import { captureSettings } from './captureSettings';

export function captureScene(state: Pick<EngineState, 'settings' | 'selection'>): SceneSnapshot {
  return {
    settings: captureSettings(state),
    focus: state.selection.focus,
  };
}
