# Skymap website

The companion site in Astro, React and MDX. `npm run site` serves it on port 5800 under `/home/` (see `src/data/site.ts`).

## Where things live

- `src/pages/` holds thin routes. A landing page's words are in `src/content/pages/<page>/<page>.mdx`, beside its
  `<page>.structure.yaml` (the headings the built page must have) and any page data. The docs are
  `src/content/docs/`.
- `src/components/` has four homes: `shared/` (used across pages: `layout/`, `links/`, `media/`, `text/`),
  `pages/<page>/` (one page's sections), `docs/` (the docs' parts) and `site/` (nav, footer, star field).
- `src/data/` holds the facts and manifests the pages are written from. A lookup by an unknown id throws, so a page
  that names a missing fact, source or shot fails the build.
- `src/utils/` is one function per file, `src/@types/` one type per file, as in the app.
- `src/dev/` is the dev overlay, never in a build (see below).

## Styles

Each component has its own `<Name>.module.css`. What several share lives in `src/styles/` as a vocabulary: a module
with no `.root` that a class takes with `composes: <class> from '…/styles/<module>.module.css'`, never `:global`.

- `type` (text styles), `layout` (column, rhythm, twelve-column grid), `links`, `ring` (the site's one control),
  `picture` (a picture's words), `sheet` (a dialog over the page), `motion` (drift, lean, feathered rim) and
  `a11y` (words for screen readers, the skip link).
- `site.css` holds the tokens (colour, type scale, `--bleed`, `--disc-ring`) and the few global rules.

## Pictures and films

Every picture of the app is a row in `src/data/siteShots.ts`, looked up by id with `siteShot()`. Films are rows in
`src/data/siteLoops.ts`. Both are taken from a running app and committed to `src/assets/`:

- `npm run site:shots -- --url <app server> [--only id,id]` writes AVIF and WebP at the widths the pages use.
  It also rewrites `src/assets/og-card.jpg`; restore that file if you did not mean to change it.
- `npm run site:loops -- --url <app server> [--only id,id]` records the films.
- Settings, mattes, budgets and the hero flight are in `tools/site/README.md`.

## Scripts on every page

`src/layouts/Base.astro` imports a few plain client scripts once per page, with no React island: the copy buttons
(`copyButtons.client.ts`), the pointer turn and look (`styles/pointer.client.ts`), scroll reveals
(`styles/reveal.client.ts`), the star field, the footer's light line and the Remark lines. A component that needs
one of these marks its markup with a data attribute and leaves the work to the script.

## Dev overlay and notes

On the dev server only, `Base.astro` mounts `src/dev/overlay/DevOverlay`. It has two tools: feedback, which pins a
note to an element, and review, which marks the docs' text. Their dev-server halves (`tools/site/feedbackPlugin.ts`
and `reviewPlugin.ts`) store notes as JSON under `.superpowers/` (gitignored), with an `index.md` of every note.

## Checks

- `npm run site:check` runs `astro check` (part of `npm run typecheck`).
- `npx vitest run tests/packages/website` runs the site's tests (part of `npm test`).
- CI also runs `site:build`, `site:links` (every internal link resolves), `site:structure` (each page has the
  headings its structure file names) and `site:repeats` (no sourced sentence repeats on more pages than allowed).
- `npm run site:sections -- <path> --url http://localhost:5800` shoots a page section by section, to look at.

> [!WARNING]
> Never run `npm run site:build` while a dev server runs from the same tree. The build rewrites Vite's dependency
> cache, and the running server breaks until it is restarted.
