import { MEDIA } from '../../../data/media.ts';

// Before the first paint, so a phone never shows the list open and then folds it; without script it stays open.
// Wide, the list scrolls by itself: the row of the page you are on is brought to its middle, and nothing else moves.
// It runs where it stands in the markup, at parse time, so it is a string and not a hook: an effect would be too late.
export const BEFORE_PAINT = `{
  const menu = document.currentScript.previousElementSibling;
  const nav = menu.parentElement;
  const here = menu.querySelector('[aria-current]');
  if (matchMedia('${MEDIA.narrow}').matches) menu.open = false;
  else if (here) nav.scrollTop = here.offsetTop - nav.clientHeight / 2;
}`;
