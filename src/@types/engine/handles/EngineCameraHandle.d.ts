/**
 * EngineCameraHandle — dev camera helper.
 *
 * Camera focus is fully driven by the Redux `selection` slice: the
 * focus-tween saga watches `state.selection.focus` and builds + dispatches
 * the camera tween when it changes. "Home" is a focus on the Milky Way
 * dispatched through that same channel, so the handle carries no imperative
 * camera op — only the dev `logState` helper.
 */
export type EngineCameraHandle = {
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
