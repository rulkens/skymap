/**
 * A view's link as an address bar on the site prints it: the camera's numbers (`pose`) are left out behind a `…`.
 * The link and the copy keep them, so the view still opens as shown.
 */
export function shownLink(link: string): string {
  const pairs = link.split('&');
  const kept = pairs.filter((pair) => !pair.startsWith('pose='));
  return kept.join('&') + (kept.length < pairs.length ? '&…' : '');
}
