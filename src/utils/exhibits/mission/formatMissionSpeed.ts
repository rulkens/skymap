/** A `MISSION_SPEEDS` factor as the rate slot writes it: "¼×", "½×", "1×", "2×", "4×". */
export function formatMissionSpeed(factor: number): string {
  const glyph = factor === 0.25 ? '¼' : factor === 0.5 ? '½' : String(factor);
  return `${glyph}×`;
}
