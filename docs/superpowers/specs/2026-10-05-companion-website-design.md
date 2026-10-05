# Companion website — design and build order

**Status:** approved to build on the owner's delegation (2026-10-05: "make your own judgement calls"). Calls made under that delegation are marked **[call]** so they are easy to overturn.

**Research this rests on:** `docs/research/2026-09-17-companion-website/` — 01–05 repo sweeps, 06 exemplar sites, 07 awe and UX evidence, 08 copy guide, 09 feature inventory, 10 planned features, and `prototype/home-prototype.html` (the accepted Home prototype; it references local files, so read it as a design reference, not a page to ship).

## Intent

A website beside the app that (1) gives a curious visitor one moment of real awe and then puts them in the app, (2) convinces an astronomer, a teacher and a dome operator that the thing is honest and usable, and (3) documents every feature, every dataset and the methods, each claim traceable to a source. It serves outreach and contract work: the lead offer is custom skymap builds for institutions.

Success is judged by the artifact: a scientist finds no claim they can fault and no missing attribution; a teacher can copy a link that works; a dome operator learns what was shown where and how to ask; every internal link resolves and every data entry links to where it can be verified.

## Rulings

Owner's: dark theme only · Astro in `packages/website/` as an npm workspace · site ends at the root with the app at `/app` · **first build is served at a preview path with the app untouched** · hero is for the curious visitor · pages for educators and for institutions, the latter with a contact form · proof is the showing at Wisdome Malmö · first person plural ("we") · the August Earth-to-universe recording is the hero flight until a purpose-made one is recorded · attribution fixes are their own PR before the data pages · docs cover every feature, the data with verifiable attributions, rendering and science, all linked out · PRs may stack.

**[call]** made here:

- Preview path is `/home/`. Pages carry `noindex` until the root swap.
- Mount registry: add a row to `toolPages` and `DEV_PORTS` now; unify into one front-end registry in the `/app` slice, where the app's path first becomes data.
- Token split rides the foundation PR as its first commit.
- Body type is Jost 300 (variable, self-hosted), display stays Cormorant Garamond 600. No type lighter than 300.
- Section names are tasks, not audiences ("Use it in a classroom", "Put it on a dome"), per 07.
- A third landing page, **Science**, for astronomers: what is measured, what is modelled, known simplifications, how to cite.
- Contact form posts to the existing Worker; it stays disabled behind configuration until the owner provisions email sending and Turnstile. No personal email address is published.
- Hero media is not committed. A poster still is committed, so the page is complete without the video.

## Ground preparation

Ideal diff, data first: `workspaces: ["packages/*"]` · `toolPages.website = 'home'` · `DEV_PORTS.website = 5700` · the build chain gains `npm run site:build` · `packages/website/`.

One missing joint: `src/styles/global.css` holds the font faces and `:root` tokens (lines 55–362) together with the app's page rules (`html`, `body`, `#c`). The site needs the first without the second. **Prep:** move the font faces and tokens to `src/styles/tokens.css`, imported by `global.css`. No behaviour change; its own commit, first.

Greenfield cross-check divergences, priced: (a) one registry of all front-ends with mount paths, versus today's two tables with the app implicit at `/` — deferred to the `/app` slice, cost of waiting is one misnamed row; (b) shared statics and tokens in neutral packages, versus the app's `public/` and `src/styles/` — kept, cost is the site importing one CSS file by relative path. Carried to the `/app` slice: a client-side forward for old `#focus=` links on the new root, and `not_found_handling` moving off the single-page fallback.

## Shape

```
packages/website/
  astro.config.mjs        base/outDir from toolPages, port from DEV_PORTS; dev publicDir = repo public/, build publicDir off
  src/layouts/            Base (head, nav, footer), Docs (sidebar, on-this-page, prev/next)
  src/components/         ObjLink (the ring control), Flight (hero), Places, Sources, Figure, …
  src/pages/              index, educators, venues, science, docs/**
  src/content/docs/       MDX, one file per docs page (content collection, typed frontmatter)
  src/data/               facts.ts, places.ts, appLink.ts, nav.ts
  src/styles/site.css     imports ../../../../src/styles/tokens.css
```

Three joints the pages share:

- **`appLink(hash)`** — the only place the app's base path is written, so the `/app` move is one line. Every deep link on the site is built through it and is checked in a test against the app's own hash parser, so a renamed id fails CI.
- **`facts.ts`** — every number and factual claim shown on the site is a row `{ id, text, source: url, checked: date, evidence?: repo path }`. Pages render facts by id; a page's "Sources" list is generated from the ids it used. A test fails on a fact without a source. A claim that cannot be given a source is not published.
- **One control** — `ObjLink`: a ring plus a label in the display face, the marker the app draws around objects. No pill buttons anywhere.

## Home

As prototyped. The flight: scroll scrubs the recording inside a pinned stage, never changing scroll speed or direction; a spine shows position and jumps between stops; one caption per stop, a name plus one sentence with one comparison; the wordmark and one line at the start; the launch control at the end and in the nav. Then the lead claim, places to start (real card images, real deep links), the tour, the classroom section, the dome section with the proof line first, and "What is measured, what is drawn".

Required behaviour beyond the prototype: the poster is the first paint and the LCP element; the video loads after first paint; a visible pause control; under `prefers-reduced-motion`, on small screens and when the video fails, the stage is the poster with the stops as an ordinary list; keyboard reachable; text contrast holds against the brightest frame. Copy follows 08 with "we"; every `[verify]` line in 08 is verified against the code or a source, or dropped.

## Pages

- **Use it in a classroom** (`/educators/`): what a lesson link is, ready-made links by topic, how to make one, what it needs (browser, no accounts), what is and is not accurate enough to teach from.
- **Domes and museums** (`/venues/`): proof first (Wisdome Malmö, September 2026), what can be delivered (fisheye, film, exhibit build), how a commission runs, the form. Facts about the venue only as published by the venue (07 and the venue research in the session; tilt, resolution and software are unpublished and are not stated).
- **Science** (`/science/`): data sources at a glance, measured versus modelled, known simplifications, how to cite, links into the docs.
- **Docs** (`/docs/`): Guide (every feature, by task) · Reference (keys, URL parameters, settings, object lists) · Data (every source: what it is, licence, attribution text, upstream link, where it enters the pipeline) · Rendering (the frame, techniques, precision, performance) · Science (models and their references) · Known simplifications · Roadmap · Credits · Cite. The page tree is fixed from 09's proposed site map; 10 supplies the roadmap and tells the tree where to leave room.

Screenshots: every guide page shows the real app. Each image is a row in a shot manifest `{ id, deep link, caption, alt }` and is produced by `npm run shot` against a dev server with real data, so the whole set regenerates with one command when the app changes. No hand-captured or mocked images; a guide page whose feature cannot be reached by a deep link gets its shot scripted through the same tool or says so in the ledger.

Cross-linking rule: every feature mention links to its guide page, every dataset mention to its data page, every technique to its rendering or science page, and every one of those links out to the primary source. Landing pages link down into docs; docs pages link back up to the relevant landing page and across to each other. The internal link check is the enforcement.

## Verification

- `facts` test: every fact has a source and a check date.
- Deep-link test: every `appLink` used parses with the app's parser and names an object that exists.
- Internal link check over the built site, in CI.
- External link check as a manual script (network-dependent, not a gate).
- Data pages are generated from `tools/utils/io/rawDataRegistry.ts` and `ATTRIBUTIONS.md`; a test fails when a registry key has no attribution entry, which is the attribution-hygiene gate.
- `astro check` joins `npm run typecheck`.

## Adversarial review (owner's instruction)

Three reviewers attack each slice that carries pages, independently and without seeing each other's findings, each told to find what is wrong and not to confirm what is right:

- **Design** — judges rendered screenshots at desktop and phone widths against 06 and 07: hierarchy, type, spacing, coherence of controls, motion, accessibility, anything that reads as templated.
- **Science** — reads as a sceptical astronomer: every number, unit, attribution, claim of measurement and omission, checked against the code, the catalogues' own documentation and primary sources.
- **Copy** — holds every line to the 08 guide and its checklist: banned forms, vague nouns, claims a competitor could run unchanged, lines that explain where they should show.

Findings come back as a ranked list with a location and a proposed fix. One fix round per slice, by that slice's implementer; a finding is only declined with a reason written in the ledger. Science findings that show a claim to be wrong are never declined: the claim is corrected or removed.

## Build order (stacked PRs)

Each is a branch on the one before. Tasks are one commit each.

1. **#748, this branch** — research 06–10, prototype, this spec.
2. **`site/01-foundation`** — T1 tokens split (prep) · T2 workspace, registry rows, Astro scaffold, build chain, CI · T3 site styles, Base layout, nav, footer, `ObjLink`, fonts · T4 `appLink`, `facts`, `places` with their tests · T5 Home · T6 hero media tool and R2 sync group (`review: yes`) · T7 internal link check.
3. **`site/02-landing-pages`** — T1 educators · T2 venues, form UI · T3 Worker contact endpoint behind configuration (`review: yes`) · T4 science.
4. **`site/03-docs-guide`** — T1 Docs layout and collection · T2 guide pages · T3 reference pages.
5. **`site/04-attribution-hygiene`** — the gaps listed in the research README, plus the registry-coverage test.
6. **`site/05-docs-data`** — generated data pages, credits, cite.
7. **`site/06-docs-rendering-science`** — rendering, science, known simplifications, roadmap.
8. **`site/07-crosslinks`** — cross-link pass, external link check run, whole-site review and its one fix round.

Not in this effort: the root swap and `/app` move, a purpose-made hero flight, analytics, search, translations.

## For the owner, on return

Provision email sending and Turnstile for the form · run the R2 sync for the hero media · confirm the Wisdome Malmö line with the venue · decide the root swap.
