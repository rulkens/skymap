/**
 * starCatalog — the Layer's externally-read default, seeding
 * `starCatalogsSlice.initialState.sizePx` and re-used by a frustum-cull test
 * that needs the shipped pixel radius.
 */

/**
 * Default star-billboard pixel radius — the star-catalog twin of the
 * galaxy-catalog point size. Seeds `settings.starCatalogs.sizePx` only; it is
 * NOT the shader's `sizePx` divisor (that's `STAR_SIZE_REF_PX` in
 * `data/starCullSlack.ts`, independently 2.5). 4.7 px within the shared 1–8 px
 * user range, deliberately 1.88x that divisor — the shipped, tuned look.
 */
export const DEFAULT_STAR_SIZE_PX = 4.7;
