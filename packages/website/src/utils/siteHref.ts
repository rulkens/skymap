import { sitePath } from './sitePath.ts';

/** A link as the page writes it: a path from the site's root gets the base; any other address stays. */
export function siteHref(href: string): string {
  return href.startsWith('/') ? sitePath(href) : href;
}
