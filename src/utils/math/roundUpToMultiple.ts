export function roundUpToMultiple(n: number, multiple: number): number {
  return Math.ceil(n / multiple) * multiple;
}
