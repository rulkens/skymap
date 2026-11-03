/** Where this page's pins are kept for the tab. */
export function pinsKey(): string {
  return `dev-feedback:${location.pathname}`;
}
