/** Full JS precision (shortest round-trip form); em-dash for absent values. */
export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(n);
}
