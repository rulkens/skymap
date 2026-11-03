const UNITS: readonly (readonly [string, number])[] = [
  ['yr/s', 365.25 * 86_400],
  ['d/s', 86_400],
  ['h/s', 3_600],
  ['min/s', 60],
];

/** How fast a film's clock ran, `days` over `seconds` of film, in the largest unit that keeps it at 1 or more: `19.2 h/s`. */
export function clockRate(days: number, seconds: number): string {
  const perSecond = (days * 86_400) / seconds;
  const [unit, size] = UNITS.find(([, size]) => perSecond >= size) ?? ['s/s', 1];
  const value = perSecond / size;
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))} ${unit}`;
}
