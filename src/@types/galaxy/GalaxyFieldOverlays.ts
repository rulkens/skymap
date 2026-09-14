/** The three additive diagnostic overlays drawn straight into the host's open scene pass. */
export type GalaxyFieldOverlays = {
  readonly ismMap: boolean;
  readonly orientation: boolean;
  /** The SF-event catalog's own placements — host-owned data, module-owned pipeline. */
  readonly bubbles: { readonly buf: GPUBuffer; readonly count: number } | null;
};
