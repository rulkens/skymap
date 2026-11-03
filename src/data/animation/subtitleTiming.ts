/**
 * subtitleTiming — the two numbers that govern tour subtitle pacing.
 * `lineSchedule` weights each line by its length (floored at SUBTITLE_MIN_CHARS);
 * the fit test (`tests/data/animation/tours/subtitleFit.test.ts`) holds every
 * authored line to SUBTITLE_MIN_READ_SEC. Tuned by eye; raise a beat's dwell or
 * re-break its lines before ever lowering the read floor.
 */

/** Weight floor so a very short line ("Home again.") still holds on screen. */
export const SUBTITLE_MIN_CHARS = 12;

/** The least time any one subtitle line may be on screen. */
export const SUBTITLE_MIN_READ_SEC = 2.5;
