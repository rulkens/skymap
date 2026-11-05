/**
 * ClipPathTuningKnob — the key of one clip-path-inspector override gate.
 *
 * Derived from `ClipPathTuningActive` so the two can never drift: adding a knob
 * to the gate record automatically widens this union. Used by the toggle action
 * and the row checkboxes to name which knob's override is being flipped.
 */
import type { ClipPathTuningActive } from './ClipPathTuningActive';

export type ClipPathTuningKnob = keyof ClipPathTuningActive;
