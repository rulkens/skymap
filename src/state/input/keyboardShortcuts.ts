/**
 * keyboardShortcuts — the app's global keyboard-shortcut table: `KEYBOARD_SHORTCUTS`
 * is the ordered source of truth, `SHORTCUTS_BY_KEY` is the lookup a saga routes
 * a matched key string through.
 *
 * A shortcut is DATA (see `KeyboardShortcut`): `keys` for `createKeyboardListener`
 * to register with hotkeys-js, `run(state)` for the consuming saga to resolve
 * against the current store state and dispatch, and a static `preventDefault`
 * flag the listener applies synchronously in the DOM event tick (see that type's
 * doc comment for why `run` can't own the swallow decision).
 *
 * `SHORTCUTS_BY_KEY` is DERIVED, not hand-maintained: several entries bind more
 * than one physical key to the same behaviour (`command+k,ctrl+k`; `h,e`), and
 * hotkeys-js reports back whichever single key actually fired. Expanding each
 * entry's comma-separated `keys` into individual record entries — all pointing
 * at the SAME `KeyboardShortcut` object — means a routing saga can look up any
 * fired key directly, with no re-derivation and no risk of the two tables
 * drifting apart.
 *
 * Tour keys (`right` / `left` / `space`) are always registered; whether they do
 * anything is gated inside `run` by `selectTourActive`, not by conditionally
 * registering the shortcut. They OMIT `preventDefault` (default `false`) so
 * that Space stays free to activate a focused button and the arrow keys stay
 * free to scroll, whether or not a tour is running.
 */

import { stepRate } from '../../utils/time/stepRate';
import { logCameraState } from '../camera/logCameraState';
import { goHome } from '../selection/goHome';
import { selectSelectedRef } from '../selection/selectors';
import { clearSelection, updateSelectionFocus } from '../selection/selectionSlice';
import { selectTourActive } from '../tour/selectors';
import { advanceTour, exitTour, prevBeat, togglePause } from '../tour/tourActions';
import { stopClip } from '../camera/clipActions';
import { selectPaletteOpen } from '../ui/selectors';
import { setPaletteOpen, toggleDebugPanelOpen, toggleUiHidden } from '../ui/uiSlice';
import { selectTimeState } from '../time/selectors';
import { pause, resume, setRate } from '../time/timeSlice';
import { goLiveNowAction } from '../time/goLiveNowAction';
import type { KeyboardShortcut } from '../../@types/state/input/KeyboardShortcut';

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { keys: 'command+k,ctrl+k', run: () => setPaletteOpen(true), preventDefault: true },
  {
    keys: '/',
    run: (s) => (selectPaletteOpen(s) ? null : setPaletteOpen(true)),
    preventDefault: true,
  },
  // `stopClip` alongside `exitTour`: a tour beat's clip plays via a direct
  // `playClip` call (see `visitBeatSaga`), never through `startClip`, so the
  // two stops target disjoint playback paths and can't fight over the same
  // clip. Both are no-ops when their respective thing isn't running (same as
  // `exitTour` already was), so no precedence check is needed here.
  { keys: 'escape', run: () => [clearSelection(), exitTour(), stopClip()] },
  {
    keys: 'f',
    run: (s) => {
      const ref = selectSelectedRef(s);
      return ref ? updateSelectionFocus(ref) : null;
    },
  },
  { keys: 'h,e', run: () => goHome() },
  { keys: 'tab', run: () => toggleUiHidden(), preventDefault: true },
  { keys: 'l', run: () => logCameraState() },
  { keys: 'd', run: () => toggleDebugPanelOpen() },
  { keys: '[', run: (s) => setRate({ rateIndex: stepRate(s, -1), nowMs: performance.now() }) },
  { keys: ']', run: (s) => setRate({ rateIndex: stepRate(s, +1), nowMs: performance.now() }) },
  {
    keys: '\\',
    run: (s) =>
      selectTimeState(s).paused
        ? resume({ nowMs: performance.now() })
        : pause({ nowMs: performance.now() }),
  },
  { keys: 'shift+n', run: () => goLiveNowAction() },
  // Tour keys — always registered, gated on an active tour by `run` (returns
  // null outside a tour). `preventDefault` is OMITTED: Space must stay free to
  // activate a focused button and the arrow keys must stay free to scroll,
  // whether or not a tour is running.
  { keys: 'right', run: (s) => (selectTourActive(s) ? advanceTour() : null) },
  { keys: 'left', run: (s) => (selectTourActive(s) ? prevBeat() : null) },
  { keys: 'space', run: (s) => (selectTourActive(s) ? togglePause() : null) },
];

export const SHORTCUTS_BY_KEY: Record<string, KeyboardShortcut> = KEYBOARD_SHORTCUTS.reduce(
  (byKey, shortcut) => {
    for (const key of shortcut.keys.split(',')) byKey[key] = shortcut;
    return byKey;
  },
  {} as Record<string, KeyboardShortcut>,
);
