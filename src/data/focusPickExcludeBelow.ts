/**
 * focusPickExcludeBelow — a focus multiplier under this level takes its
 * instance out of the pick pass. The multiplier is exactly 1 for members and
 * at rest, so the cut lands precisely on what the visual pass fades away.
 *
 * The WESL twin `FOCUS_PICK_EXCLUDE_BELOW` in `lib/focusUniforms.wesl` is what
 * the survey shaders test; this mirror serves the CPU-stamped picks (curated
 * stars) and is pinned to it by a parity test.
 */

export const FOCUS_PICK_EXCLUDE_BELOW = 1;
