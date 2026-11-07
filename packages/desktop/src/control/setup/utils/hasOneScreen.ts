/** One screen (or none reported yet): there is no sky screen to pick, so setup passes over that step. */
export function hasOneScreen(displayCount: number): boolean {
  return displayCount < 2;
}
