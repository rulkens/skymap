/**
 * HdrSettings — the viewer's HDR opt-in plus the extended-range headroom
 * knobs. The swap chain itself is gated live on `hdrActiveOf(renderTargets)`,
 * not read straight off `enabled` — see `EngineSettingsState.hdr`.
 */
export type HdrSettings = {
  /** Viewer opt-in; `false` even on a capable display — see `DEFAULT_HDR_ENABLED`. */
  enabled: boolean;
  /** Same post-exposure units as the tone curve's own input — see `DEFAULT_HDR_KNEE`. */
  knee: number;
  /** Multiplier on over-knee energy; 0 is exactly the SDR result — see `DEFAULT_HDR_HEADROOM`. */
  headroom: number;
};
