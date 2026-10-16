/** The window's width and the vertical band the site's top bar, the review bar (top or foot) and a panel sheet at the foot leave free. */
export function readFreeBand(): { width: number; top: number; bottom: number } {
  const html = document.documentElement;
  const nav = document.querySelector('header')?.getBoundingClientRect();
  const bar = document.querySelector('[data-review-bar]')?.getBoundingClientRect();
  const panel = document.querySelector('[data-review-panel]')?.getBoundingClientRect();
  let top = Math.max(0, nav?.bottom ?? 0);
  let bottom = html.clientHeight;
  if (bar) {
    if (bar.top > bottom / 2) bottom = bar.top;
    else top = Math.max(top, bar.bottom);
  }
  // A panel as wide as the window is the sheet a phone gets, up from the foot.
  if (panel && panel.width > html.clientWidth / 2) bottom = Math.min(bottom, panel.top);
  return { width: html.clientWidth, top, bottom };
}
