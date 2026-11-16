export function roundToMultiple(n: number, multiple: number): number {
  return Math.round(n / multiple) * multiple;
}
