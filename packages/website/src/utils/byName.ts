/** Orders names as a reader expects: no case, no accents, and M31 before M100. */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });
}
