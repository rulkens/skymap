/**
 * SUB_PIXEL_BODY_CULL_PX — the apparent-diameter floor (px) below which a
 * true-scale sphere body is not worth drawing.
 *
 * A body under a pixel across cannot resolve as a sphere: its entire mesh
 * rasterizes to (at most) one fragment, indistinguishable from the point
 * sprite / star backdrop already covering that pixel — so the ~1k-triangle
 * draw is pure GPU cost for zero visual information. Culling at the layer
 * (Earth in `enabled`, the planets per-body in `draw`) keeps the foreground
 * pass honest through the ~13-decade descent where the bodies spend most of
 * the zoom range sub-pixel.
 *
 * ONE home for the threshold so the Earth and planet layers cannot drift
 * apart — a body must not vanish at a different zoom depth than its
 * neighbours just because two copies of "1" were edited independently.
 * 1 px is a cull, not a fade: the swap is invisible by construction (the
 * body is already at/below the resolution limit when it engages).
 */
export const SUB_PIXEL_BODY_CULL_PX = 1;
