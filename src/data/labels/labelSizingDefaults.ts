/**
 * Defaults applied when a `Label2D` omits its sizing fields (see the matching
 * docstrings on the type). They live in `data/` rather than on the renderer
 * because every CPU twin of the label vertex shader's em clamp —
 * `labelRenderer`'s pack loop, `labelScreenRect` (declutter + pick rects), and
 * the director's lift stage — must resolve them identically or the text is
 * drawn at one size and hit-tested at another.
 */
export const LABEL_WORLD_EM_MPC_DEFAULT = 0.01;
export const LABEL_MIN_PX_DEFAULT = 8;
export const LABEL_MAX_PX_DEFAULT = 64;
