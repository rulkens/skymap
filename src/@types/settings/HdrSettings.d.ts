/**
 * HdrSettings — the viewer's HDR opt-in plus the extended-range headroom
 * knobs. `enabled` (together with the display's `hdrCapable` report) drives
 * the swap chain, via `watchSwapFormatSaga` → `applySwapFormat`. `hdrActiveOf`
 * runs the other way, reading the live swap-chain format back out — combined
 * with `enabled` it gates `knee`/`headroom`, so those knobs can't fire in the
 * one frame where the reconfigure hasn't landed yet.
 */
export type HdrSettings = {
  /** Viewer opt-in; `false` even on a capable display — see `DEFAULT_HDR_ENABLED`. */
  enabled: boolean;
  /** Same post-exposure units as the tone curve's own input — see `DEFAULT_HDR_KNEE`. */
  knee: number;
  /** Multiplier on over-knee energy; 0 is exactly the SDR result — see `DEFAULT_HDR_HEADROOM`. */
  headroom: number;
};
