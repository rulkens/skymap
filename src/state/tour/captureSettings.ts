/**
 * captureSettings — take a detached snapshot of the ten tour-owned
 * settings clusters off the live store state.
 *
 * The cinematic tour captures the user's settings, plays an effect that
 * mutates them, then restores the capture. For that round-trip to be
 * sound the capture must be fully *detached* from `state.settings`: a
 * later mutation of the live settings (a slider drag, an effect step)
 * must not bleed into the snapshot we'll restore from. A shallow copy
 * would share nested cluster objects, so we `structuredClone` a plain
 * object of the ten clusters into a deep, independent copy.
 *
 * We clone whole clusters with zero per-field projection: the look-knobs
 * (brightness, intensity, palette, …) ride along with the visibility bits
 * (the `enabled` gates) automatically, so restore is a single
 * cluster-for-cluster assignment with no field-by-field translation to
 * keep in sync. That policy is why `bodies` carries its per-item `enabled`
 * axis along with `labelEnabled` even though `enabled` has no settings-panel
 * setter today: `visibleStars` and the foreground-caption layer already
 * treat that flag as live (readable, just not currently writable by the
 * user), so a whole-cluster capture is what keeps a body's dot and its
 * caption restoring in lockstep rather than one outliving the other.
 *
 * `orientation` does NOT ride along, despite being captured at the same time
 * `captureScene` calls this function: it is a bare scalar, not one of the ten
 * clusters, and a tour's `frameTo` cue can switch it mid-run through the
 * SAME `mergeSnapshot` write path the clusters here restore through — see
 * `SceneSnapshot`'s header for why that makes it unsafe to fold into this
 * type. `captureScene` captures it separately, alongside `focus`.
 *
 * Reads `RootState`, not `EngineState`: this is a pure store read with no
 * engine dependency, so it lives in `state/tour/` beside `captureScene`
 * (its only caller) rather than in the engine wiring layer.
 */

import type { RootState } from '../../store/types';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

export function captureSettings(state: Pick<RootState, 'settings'>): SettingsSnapshot {
  const {
    galaxyCatalogs,
    structures,
    volumes,
    filaments,
    milkyWay,
    flow,
    orbitTrails,
    starCatalogs,
    bodies,
    labels,
  } = state.settings;
  return structuredClone({
    galaxyCatalogs,
    structures,
    volumes,
    filaments,
    milkyWay,
    flow,
    orbitTrails,
    starCatalogs,
    bodies,
    labels,
  });
}
