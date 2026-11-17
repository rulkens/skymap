/**
 * A view's link as an address bar on the site prints it: the camera's numbers (`pose`) and the layer switches
 * (`layers`) are left out behind one `…`. The link and the copy keep them, so the view still opens as shown.
 */
export function shownLink(link: string): string {
  const pairs = link.split('&');
  const kept = pairs.filter((pair) => !pair.startsWith('pose=') && !pair.startsWith('layers='));
  return kept.join('&') + (kept.length < pairs.length ? '&…' : '');
}
