/**
 * DebugViewSpec — one `DEBUG_VIEWS` row. Identity only: which settings key
 * carries the view's weight, and how the panel names it. Deliberately no GPU
 * byte offsets and no engine callbacks — io.wesl stays the single home for
 * the uniform's lane map, and `src/data/` must not reach into the engine.
 */

import type { RenderSettings } from '../engine/RenderSettings';

export type DebugViewSpec = {
  /**
   * The `RenderSettings` key holding this view's crossfade weight. Typed off
   * the key set rather than as a bare `string` so a typo fails the build
   * instead of becoming a fifth place the four views are enumerated.
   */
  readonly intensityKey: Extract<keyof RenderSettings, `${string}ViewIntensity`>;
  readonly label: string;
  /** The slider's hover text — DebugViewsSection is the only reader. */
  readonly info: string;
};
