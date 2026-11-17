import { appLink } from '../data/appLink.ts';

/**
 * The full address of an app view, to copy or print: always absolute on the site's host, where `appLink` is
 * root-relative in a build (the link's `href` needs no host, a pasted address does).
 */
export function appAddress(hash?: string, query?: string): string {
  return new URL(appLink(hash, query), import.meta.env.SITE).href;
}
