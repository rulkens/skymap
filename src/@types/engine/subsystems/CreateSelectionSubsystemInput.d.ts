import type { EngineCallbacks } from '../EngineCallbacks';

/**
 * Hooks the subsystem needs from the outside world.  Both passed once at
 * construction.  The subsystem no longer resolves picks, so it needs no source
 * accessors — callers hand it already-resolved targets.
 */
export type CreateSelectionSubsystemInput = {
  /** UI-callback sink — only `selection` + `camera.onFocusChange` are read. */
  cb: EngineCallbacks;
  /**
   * Wake the render loop one frame. setSelected/setFocused call this on
   * actual change; setHovered does not (see the module header's wake contract).
   */
  requestRender: () => void;
};
