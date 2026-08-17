/**
 * keyboardShortcuts — pure `run(state)` behaviour of each `KEYBOARD_SHORTCUTS`
 * entry. No DOM, no hotkeys-js, no store: each `run` is a pure function of a
 * minimal `RootState`-shaped fixture, so these tests assert action-creator
 * output equality directly.
 */

import { describe, it, expect } from 'vitest';

import { KEYBOARD_SHORTCUTS, SHORTCUTS_BY_KEY } from '../../../src/state/input/keyboardShortcuts';
import { goHome } from '../../../src/state/selection/goHome';
import { clearSelection, updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import {
  setPaletteOpen,
  toggleDebugPanelOpen,
  toggleUiHidden,
} from '../../../src/state/ui/uiSlice';
import { goLive, setRate, pause, resume } from '../../../src/state/time/timeSlice';
import { exitTour, advanceTour, prevBeat, togglePause } from '../../../src/state/tour/tourActions';
import { stopClip } from '../../../src/state/camera/clipActions';
import type { RootState } from '../../../src/store/types';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { UiState } from '../../../src/@types/ui/UiState';
import type { SelectionState } from '../../../src/@types/store/SelectionState';
import type { TimeState } from '../../../src/@types/time/TimeState';
import type { TourRuntimeState } from '../../../src/@types/animation/tour/TourRuntimeState';

const byKeys = (keys: string) => {
  const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.keys === keys);
  if (!shortcut) throw new Error(`no shortcut registered for keys '${keys}'`);
  return shortcut;
};

// Minimal RootState-shaped fixtures — only the slice each case's selector
// reads, hand-rolled the way sibling slice tests do (e.g. tourSlice.test.ts's
// `asState`).
const stateWith = (partial: Partial<RootState>): RootState => partial as unknown as RootState;

const ui = (paletteOpen: boolean): UiState => ({
  paletteOpen,
  uiHidden: false,
  debugPanelOpen: false,
  splash: { visible: false, dismissedVersion: null },
});

const selection = (select: SelectionRef | null): SelectionState => ({
  hover: null,
  select,
  focus: null,
  pending: { select: null, focus: null },
});

const time = (rateIndex: number, paused: boolean): TimeState => ({
  mode: 'manual',
  anchor: { simDays: 0, realMs: 0 },
  rateIndex,
  direction: 1,
  paused,
});

const tour = (active: boolean): TourRuntimeState => ({
  active,
  tourId: active ? 'webShowcase' : '',
  beatIndex: 0,
  paused: false,
  dwellNonce: 0,
  dwellSec: 0,
});

describe('KEYBOARD_SHORTCUTS', () => {
  it('Esc returns clearSelection, exitTour, and stopClip', () => {
    const run = byKeys('escape').run;
    expect(run(stateWith({}))).toEqual([clearSelection(), exitTour(), stopClip()]);
  });

  it('/ opens palette only when closed', () => {
    const run = byKeys('/').run;
    expect(run(stateWith({ ui: ui(false) }))).toEqual(setPaletteOpen(true));
    expect(run(stateWith({ ui: ui(true) }))).toBeNull();
  });

  it('f focuses selected ref, null when nothing selected', () => {
    const run = byKeys('f').run;
    const ref: SelectionRef = { type: 'milkyWay' };
    expect(run(stateWith({ selection: selection(ref) }))).toEqual(updateSelectionFocus(ref));
    expect(run(stateWith({ selection: selection(null) }))).toBeNull();
  });

  it('[ and ] clamp via stepRate', () => {
    // At the ladder's low end, `[` (delta -1) holds at 0; at the high end,
    // `]` (delta +1) holds at the last index (14, RATE_LADDER.length - 1).
    // Does NOT re-test stepRate's clamping arithmetic itself (Task 2's test).
    const stepDown = byKeys('[').run(stateWith({ time: time(0, false) })) as ReturnType<
      typeof setRate
    >;
    const stepUp = byKeys(']').run(stateWith({ time: time(14, false) })) as ReturnType<
      typeof setRate
    >;
    expect(stepDown.payload.rateIndex).toBe(0);
    expect(stepUp.payload.rateIndex).toBe(14);
  });

  it('\\ returns resume when paused, pause when running', () => {
    const run = byKeys('\\').run;
    const resumeResult = run(stateWith({ time: time(3, true) })) as ReturnType<typeof resume>;
    const pauseResult = run(stateWith({ time: time(3, false) })) as ReturnType<typeof pause>;
    expect(resumeResult.type).toBe(resume({ nowMs: 0 }).type);
    expect(pauseResult.type).toBe(pause({ nowMs: 0 }).type);
  });

  it('tab toggles the UI-hidden flag', () => {
    expect(byKeys('tab').run(stateWith({}))).toEqual(toggleUiHidden());
  });

  it('d toggles the debug panel', () => {
    expect(byKeys('d').run(stateWith({}))).toEqual(toggleDebugPanelOpen());
  });

  it('h,e goes home', () => {
    expect(byKeys('h,e').run(stateWith({}))).toEqual(goHome());
  });

  it('shift+n goes live', () => {
    const result = byKeys('shift+n').run(stateWith({})) as ReturnType<typeof goLive>;
    expect(result.type).toBe(goLive({ simDays: 0, nowMs: 0 }).type);
  });

  it('command+k,ctrl+k opens the palette, both comma-split keys resolving to the same entry', () => {
    expect(byKeys('command+k,ctrl+k').run(stateWith({}))).toEqual(setPaletteOpen(true));
    expect(SHORTCUTS_BY_KEY['command+k']).toBe(byKeys('command+k,ctrl+k'));
    expect(SHORTCUTS_BY_KEY['ctrl+k']).toBe(byKeys('command+k,ctrl+k'));
  });

  it('tour keys return null when no tour is active and their signal when active', () => {
    const cases = [
      { keys: 'right', action: advanceTour },
      { keys: 'left', action: prevBeat },
      { keys: 'space', action: togglePause },
    ] as const;

    for (const { keys, action } of cases) {
      const run = byKeys(keys).run;
      expect(run(stateWith({ tour: tour(false) }))).toBeNull();
      expect(run(stateWith({ tour: tour(true) }))).toEqual(action());
    }
  });
});
