/**
 * Planned site pages that Home already links to but that no PR has built yet
 * (docs/superpowers/specs/2026-10-05-companion-website-design.md, "Build
 * order"). Paths are relative to the site's base, with a trailing slash.
 * `npm run site:links` reports links to these instead of failing, and FAILS if
 * one now exists, so this list can only shrink: the PR that builds a page
 * deletes its row here. Add a row only for a page the spec names.
 */
export const NOT_YET_BUILT: readonly string[] = [
  '/classroom/', // site/02-landing-pages T1
  '/domes/', // site/02-landing-pages T2
  '/about/', // site/02-landing-pages (maker, how to reach us, press images)
  '/privacy/', // site/02-landing-pages (what the contact form stores)
  '/science/', // site/02-landing-pages T4
  '/docs/', // site/03-docs-guide T1
  '/docs/credits/', // site/05-docs-data
  '/docs/cite/', // site/05-docs-data
];
