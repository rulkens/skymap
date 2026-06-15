/**
 * EngineMilkyWayHandle — the Milky Way's two independent visibility axes.
 *
 * `setEnabled` gates the procedural galactic-disk impostor render; `setLabelEnabled`
 * gates the "You are here" text label. They toggle independently — you can hide
 * the disk while keeping the label, or vice versa. The camera tween that points
 * AT the Milky Way (`focusOnMilkyWay`) lives under `engine.camera`, not here —
 * milkyWay owns the render gates; camera owns the viewpoint.
 */
export type EngineMilkyWayHandle = {
  /** Toggle the procedural Milky Way impostor at world origin. */
  setEnabled: (enabled: boolean) => void;
  /** Toggle the "You are here" Milky Way label (independent of the disk overlay). */
  setLabelEnabled: (enabled: boolean) => void;
};
