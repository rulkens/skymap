/**
 * EngineMilkyWayHandle — the Milky Way's two independent visibility axes.
 *
 * `setEnabled` gates the procedural galactic-disk impostor render; `setLabelEnabled`
 * gates the "You are here" text label. They toggle independently — you can hide
 * the disk while keeping the label, or vice versa. Pointing the camera AT the
 * Milky Way goes through `engine.camera.focusOn(MILKY_WAY_INFO)`, not here —
 * milkyWay owns the render gates; camera owns the viewpoint.
 */
export type EngineMilkyWayHandle = {
  /** Toggle the procedural Milky Way impostor at world origin. */
  setEnabled: (enabled: boolean) => void;
  /** Toggle the "You are here" Milky Way label (independent of the disk overlay). */
  setLabelEnabled: (enabled: boolean) => void;
};
