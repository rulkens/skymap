/** True when two JSON-shaped setup values differ; setup fields are plain data, so JSON equality is exact. */
export function differs(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
