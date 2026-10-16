/** A class list from the parts that are set: a falsy part (a condition that failed) leaves no gap. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
