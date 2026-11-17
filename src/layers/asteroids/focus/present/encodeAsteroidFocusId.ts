/** encodeAsteroidFocusId — an asteroid's deep-link focus id (`asteroid-433` is Eros by MPC number), the one spelling the URL and the palette share. */
export function encodeAsteroidFocusId(number: number): string {
  return `asteroid-${number}`;
}
