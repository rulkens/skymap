/** Milliseconds since navigation start; absent when the run timed out before reaching it. */
export type LoadMilestones = {
  /** First contentful paint: the first moment the visitor sees anything but black. */
  fcp?: number;
  /** React committed into `#root`. */
  mounted?: number;
  /** First `getCurrentTexture()` call: the engine is drawing frame 1. */
  firstFrame?: number;
  /** The splash's primary CTA is enabled. */
  ctaReady?: number;
  /** `window.__skymap.ready` resolved: every boot download has settled. */
  loaded?: number;
  /** First 200/206 albedo tile response (`.webp` or `.pack`), ms since navigation start. */
  firstSurfaceTile?: number;
  /** Every request under `earth-tiles/vN/` or `mars-tiles/vN/` before `loaded` or the timeout. */
  surfaceRequests?: number;
};
