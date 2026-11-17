/**
 * formatAntiqueDegrees — a border number as a c.1690 map sets it: a whole
 * degree as bare digits ("53"), a value between degrees as its minutes ("40’",
 * the font's apostrophe standing in for the prime it has no glyph for), or
 * degrees and minutes ("52°40’") for the number that must carry its degree.
 */
export function formatAntiqueDegrees(deg: number, carryDegrees: boolean): string {
  const minutes = Math.round(deg * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes - whole * 60;
  if (rest === 0) return String(whole);
  return carryDegrees ? `${whole}°${rest}’` : `${rest}’`;
}
