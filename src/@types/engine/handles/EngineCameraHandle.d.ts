/**
 * EngineCameraHandle — viewpoint tweens and dev helpers.
 *
 * Camera focus is fully driven by the Redux `selection` slice: the
 * focus-tween saga watches `state.selection.focus` and calls
 * `runFocusTween` when it changes. The only imperative camera op
 * still on the handle is `focusOnHome` (which dispatches a focus-null
 * write and tweens the camera to the framing snapshot) and the dev
 * `logState` helper.
 */
export type EngineCameraHandle = {
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
