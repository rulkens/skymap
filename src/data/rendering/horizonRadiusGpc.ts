/**
 * Comoving radius to the cosmic particle horizon, in GIGAPARSECS.
 *
 * Standard flat-ΛCDM Planck-2018 cosmology gives ~14.3 Gpc for the limit of
 * light propagation since the Big Bang — also roughly where the CMB
 * last-scattering surface sits (z ≈ 1100, ~14.0 Gpc).
 *
 * Lives in `data/` rather than beside the renderer that draws the shell: the
 * Observable Universe view reaches it through `HORIZON_RADIUS_MPC`, and a
 * renderer module drags its `.wesl` imports along, which Node-side tools
 * (the thumbnail capture) cannot load.
 */

export const HORIZON_RADIUS_GPC = 14.3;
