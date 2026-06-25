/**
 * SettingsAction — the narrow union of settings-slice action types a clip's
 * `scene(action)` effect may dispatch.
 *
 * Why a named alias rather than `AnyAction`: `scene` should only ever carry
 * actions that a reconcile saga will handle — tightening the type to the
 * actually-used creator set catches authoring errors at compile time and prevents
 * a clip from accidentally dispatching an unrelated action mid-playback.
 *
 * ### Creator set (Task 2 baseline)
 *
 * Seeded from the only example that dispatches a `scene` effect at this plan
 * stage: the `cosmicFlows` spike, which calls `scene(setFlowEnabled(true))`.
 * Plan C widens this union as the guided-tour beats need additional settings knobs
 * (bias, filament intensity, exposure, etc.).
 *
 *   - `setFlowEnabled` — toggle the cosmic-flow field's master gate. The primary
 *     scene-effect use case from the spike.
 *   - `setFlow` — adjust the flow field's look/motion knobs (mode, intensity, …).
 *
 * Add to this union (with a brief rationale comment) when a new tour beat calls
 * `scene(someCreator(…))` for the first time. The canonical creator list lives in
 * `src/state/settings/settingsSlice.ts`.
 */

import type { setFlow, setFlowEnabled } from '../../state/settings/settingsSlice';

export type SettingsAction = ReturnType<typeof setFlowEnabled> | ReturnType<typeof setFlow>;
