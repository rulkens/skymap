/**
 * SceneSnapshot — the widened capture a cinematic tour takes before playing a
 * beat, and restores in its `finally`.
 *
 * ### Why this widens SettingsSnapshot
 *
 * The ten-cluster `SettingsSnapshot` covers the tour's appearance knobs
 * (brightness, visibility gates, look dials). But a beat's `focus()` call also
 * mutates `selection.focus`, which drives the camera tween and the member-isolation
 * dim in the render pass. Without snapshotting focus, a restore that puts the
 * settings back correctly still leaves the user's camera parked on the beat's
 * target, with the wrong galaxy lit up. The scene snapshot is therefore
 * settings PLUS focus — together they fully describe the pre-tour state a restore
 * must wind back.
 *
 * ### Why `orientation` lives here and not on `SettingsSnapshot`
 *
 * A tour's `frameTo` cue can switch which pole is "up" mid-run, so the
 * pre-tour value needs capturing for restore — same shape of problem as
 * `focus`. But it must NOT ride inside `settings`: `mergeSettingsSnapshot` is
 * a raw field assignment, and `computeSceneEntering` reconstructs
 * `settings` at every beat boundary from the captured baseline (see
 * `guidedTourSaga`). If `orientation` were part of that payload, EVERY
 * beat-entry `mergeSnapshot` dispatch would carry the PRE-TOUR pole and
 * silently revert whatever the tour's own `frameTo` cues had set — the frame
 * would keep resetting itself the moment the next beat starts. Restore
 * therefore reads `orientation` off this type directly and sends it through
 * `requestOrientationChange` (see `restoreSceneSaga`), the same request path
 * an interactive switch uses, so `camera.base` gets re-expressed into the
 * restored frame instead of stranding it.
 *
 * ### Why `focus` is a reference, not a deep clone
 *
 * `SelectionRef` values are flat, serializable, and immutable by convention —
 * the slice replaces the slot on every write (Immer's `setIfChanged`), it does
 * not mutate in place. Copying the reference captures the identity the tour
 * must return to; there is no nested object a later write could reach through
 * and corrupt. The settings half already requires a `structuredClone` (mutable
 * nested cluster objects); focus does not.
 *
 * ### Why Readonly
 *
 * A captured snapshot is a frozen baseline — restore reads it, nothing writes
 * it. Matching `SettingsSnapshot`'s `Readonly` wrapper keeps callers honest and
 * makes the intent legible without a prose comment.
 */

import type { SettingsSnapshot } from './SettingsSnapshot';
import type { SelectionRef } from '../SelectionRef';
import type { OrientationFrameId } from '../../camera/OrientationFrameId';

export type SceneSnapshot = Readonly<{
  settings: SettingsSnapshot;
  orientation: OrientationFrameId;
  focus: SelectionRef | null;
}>;
