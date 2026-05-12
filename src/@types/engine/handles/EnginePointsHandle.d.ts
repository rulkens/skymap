/**
 * EnginePointsHandle — point-billboard appearance controls.
 *
 * Owns the per-point visual knobs: size, brightness, fallback-orientation
 * indicator, real-only filter, depth fade.  All five flow into the shared
 * `points.wgsl` uniform buffer; the sub-handle exists so the React layer
 * imports one cohesive cluster rather than spelling out five top-level
 * names.
 */
export type EnginePointsHandle = {
  /** Set the billboard pixel radius for all rendered points. */
  setSize: (sizePx: number) => void;
  /** Set the global brightness multiplier applied to every star. */
  setBrightness: (value: number) => void;
  /** Toggle the per-galaxy camera-distance depth fade. */
  setDepthFade: (enabled: boolean) => void;
  /** Toggle the magenta tint on galaxies whose orientation is fallback. */
  setHighlightFallback: (enabled: boolean) => void;
  /** Toggle "show only galaxies with real photometric orientation". */
  setRealOnly: (enabled: boolean) => void;
};
