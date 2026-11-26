/**
 * Ruler steps for any view span: the major step is the first on the ladder that keeps labels at
 * least MIN_LABEL_GAP_PX apart on a track `trackPx` wide, the minor a fifth of it.
 */
const LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
const MIN_LABEL_GAP_PX = 64;
const FALLBACK_MAJOR = 600;

export function rulerSteps(spanSec: number, trackPx: number): { major: number; minor: number } {
  const major =
    LADDER.find((step) => (step * trackPx) / spanSec >= MIN_LABEL_GAP_PX) ?? FALLBACK_MAJOR;
  return { major, minor: major / 5 };
}
