/**
 * Tween duration for focus / home camera moves, in milliseconds.
 * Shared by `tweenToGalaxy` and `tweenToStructure` so both kinds of focus
 * commitment animate at the same speed.
 *
 * 600 ms is the sweet spot the UI explored: long enough that the user
 * reads it as motion (not a teleport) and gets oriented in the new
 * frame, short enough that it never feels sluggish during rapid
 * clicking through the InfoCard list.
 */
export const FOCUS_TWEEN_MS = 600;
