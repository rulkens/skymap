/**
 * FRAME_ROLL_SEC — shared duration for the grand tour's seen `frameTo` cues
 * (`approachM31`, `homeAgain`; `parkOpening`'s is instant; see docs/tour/
 * implementation-notes.md for the frame ladder). 3x the interactive switch's
 * ~1s feel (`FRAME_TWEEN_MS`) — slow enough to read as a deliberate tilt, not
 * a snap. One shared constant, not per-clip copies: both sites picked the same
 * number for the same reason, so retuning it should touch one file. Untuned
 * starting point, awaiting the visual pass.
 */
export const FRAME_ROLL_SEC = 3;
