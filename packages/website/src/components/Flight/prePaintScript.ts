/*
 * prePaintScript — the text of the inline script a page puts in its head, so the flight's layout is decided
 * once, before the first paint, and the island takes over from that state when it hydrates. It marks the
 * page `data-flight-live` (the stage is one sticky screen), `data-flight-film` where a film may play (a wide
 * screen, a connection that is neither metered nor slow, not a touch tablet), and clears the top bar's ground
 * (`--nav-ground`, components/Nav) over the stage; the flight brings the ground back as the stage lets go.
 */
import { FILM_QUERY } from './filmQuery.ts';

export function prePaintScript(): string {
  return `(function () {
  var root = document.documentElement;
  var c = navigator.connection;
  var slow = c && (c.saveData || /(^|-)2g$|3g/.test(c.effectiveType || ''));
  var wide = matchMedia(${JSON.stringify(FILM_QUERY)}).matches;
  var touchTablet = matchMedia('(pointer: coarse)').matches && innerWidth < 1100;
  root.setAttribute('data-flight-live', '');
  root.style.setProperty('--nav-ground', '0');
  if (wide && !slow && !touchTablet) root.setAttribute('data-flight-film', '');
})();`;
}
