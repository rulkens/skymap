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

/**
 * `tan(30°)`, folded into the em-to-pixel projection so a label keeps the size
 * it had before `worldLenToPx` gained the camera prefix's `pxPerRad` focal
 * term — every producer's `worldEmMpc` was tuned by eye against the old
 * fov-blind conversion, and `worldEmMpc` is a physical length elsewhere
 * (`produceSceneBodyCaptions` derives a diameter from it), so the factor
 * belongs here rather than in the producers. Mirrored as `EM_PX_RETUNE` in
 * `labels/vertex.wesl` — the two must stay equal.
 */
export const LABEL_EM_PX_RETUNE = 0.57735;
