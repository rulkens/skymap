/**
 * EngineMilkyWayHandle — procedural Milky Way impostor toggle.
 *
 * One method.  The camera tween that points AT the Milky Way
 * (`focusOnMilkyWay`) lives under `engine.camera`, not here —
 * milkyWay owns the render gate; camera owns the viewpoint.
 */
export type EngineMilkyWayHandle = {
  /** Toggle the procedural Milky Way impostor at world origin. */
  setEnabled: (enabled: boolean) => void;
};
