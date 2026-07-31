/**
 * Approach duration for `followBody`'s distance ease, in milliseconds, and the
 * matching wake window in `shouldKeepTicking`.
 *
 * 600 ms is the sweet spot the UI explored: long enough that the user reads it
 * as motion (not a teleport), short enough that it never feels sluggish during
 * rapid clicking through the InfoCard list. Focus and home tweens no longer use
 * it — their duration comes from the glide's arc length (`glidePath`), clamped
 * by `glideCalibration`.
 */
export const FOCUS_TWEEN_MS = 600;
