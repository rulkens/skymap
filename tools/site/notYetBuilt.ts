/**
 * Planned site pages that built pages already link to but that no PR has built
 * yet (docs/superpowers/specs/2026-10-05-companion-website-design.md, "Build
 * order"). Paths are relative to the site's base, with a trailing slash.
 * `npm run site:links` reports links to these instead of failing, and FAILS if
 * one now exists, so this list can only shrink: the PR that builds a page
 * deletes its row here. Add a row only for a page the spec names.
 */
export const NOT_YET_BUILT: readonly string[] = [
  '/docs/', // site/03-docs-guide T1
  '/docs/start/browsers/', // site/03-docs-guide T2 (will it run on school machines)
  '/docs/guide/sharing/', // site/03-docs-guide T2 (make a lesson link)
  '/docs/guide/screens-and-domes/', // site/03-docs-guide T2
  '/docs/data/', // site/05-docs-data (all sources at a glance)
  '/docs/science/', // site/06-docs-rendering-science (measured, derived, modelled, drawn)
  '/docs/simplifications/', // site/06-docs-rendering-science
  '/docs/credits/', // site/05-docs-data
  '/docs/cite/', // site/05-docs-data
];
