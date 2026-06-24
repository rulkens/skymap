import type { Action } from '@reduxjs/toolkit';
import type { SelectionRef } from '../engine/SelectionRef';

/**
 * BeatData — a single beat in a tour: a focus target, optional caption, dwell
 * time, and optional effects to dispatch.
 *
 * `focus` is a SelectionRef (the codebase's authoritative selection identity),
 * null to clear the selection. The tour driver dispatches
 * updateSelectionFocus(SelectionRef) for non-null focus.
 *
 * `caption` renders in the UI overlay; null for no caption. Tour captions are
 * ephemeral — they live in the beat, not persisted to the store.
 *
 * `dwellSec` is the auto-advance delay in seconds. Keyboard/gesture input can
 * interrupt early; timer expires to proceed to the next beat.
 *
 * `effects` are plain Redux actions dispatched verbatim by `put(e)` in the
 * tour saga — no applyIntent or applyEffect wrapper. This decouples the tour
 * beat definition from intent semantics: a beat author writes the action they
 * want the store to receive, and the tour driver passes it through. Subsystems
 * reading from the store see the effects appear as normal state mutations.
 */
export type BeatData = {
  readonly focus: SelectionRef | null;
  readonly caption: string | null;
  readonly dwellSec: number;
  readonly effects?: readonly Action[];
};
