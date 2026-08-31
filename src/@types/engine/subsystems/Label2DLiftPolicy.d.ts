/**
 * Screen-space anchor lift parameters for a `Label2DDirector` instance. `null`
 * on the config (rather than an optional field) so a third director instance
 * must explicitly decide its lift stance instead of silently inheriting "off".
 */
export type Label2DLiftPolicy = {
  /** Slab index whose `far` the anchor clamp reads. */
  readonly slab: number;
  readonly farClampFraction: number;
};
