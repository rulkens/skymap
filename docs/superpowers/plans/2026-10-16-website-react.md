# Website on React and CSS modules

The website's components and layouts move from `.astro` to React (`.tsx`) with colocated CSS modules; pages stay `.astro`. A visitor sees no difference: every page renders the same pixels before and after. Branch `site/09-react` off main `c2c38a1e7`, one draft PR.

## Rulings (owner, 2026-10-16, ask Stmz)

- Pages stay `.astro`. Components AND layouts become React.
- Interactive parts become React islands (`client:visible`; `client:load` where it must run before the first scroll, e.g. the Home flight and the nav menu). Static parts render at build time and ship no JS.
- CSS modules; compiled class names `{Folder}-{class}`, no hash, as in `~/Development/web/rulkens.com/astro.config.ts` (`generateScopedName`).
- The dev-only overlays (feedback notes, review marks) are rewritten in React too.
- The note worker queues notes while a wave runs and applies them after it.
- Model to copy: `~/Development/web/rulkens.com/.claude/skills/writing-rulkens-component/SKILL.md` and the app's own `src/components/**/*.module.css` habits (tokens, `composes`).

## Ground preparation

The inventory is in `.superpowers/sdd/2026-10-05-companion-website/react-inventory.md` (85 components, 2 layouts, 10 `scripts/init*.ts`, 5 inline scripts, the dev overlays). The rewrite is growth at one seam: each `.astro` component is replaced by a component folder; pages change only their imports. Joints that do not exist yet and land first, in Wave 0:

1. The React integration and the scoped-name rule (none today).
2. Dev source attributes on React elements. Astro's dev server stamps `data-astro-source-file` / `data-astro-source-loc` on `.astro` elements only; `src/dev/feedback/describeElement.ts:21-28` reads them into each note, and the note worker edits the file they name. Without a joint, notes on React-rendered text lose their pointer.
3. A visual comparison gate (no tool shoots every built page and diffs it against a baseline today).

The `<html>`/`<head>` document cannot be a React component (Astro injects styles and scripts into `<head>`; a framework component may not own it), so `layouts/Base.astro` stays as a thin document shell: `<html>`, `<head>` (meta, fonts, JSON-LD, the `head` slot), `<body>` holding the React `BaseLayout`. That is the one layout carve-out; everything inside `<body>` is React.

## Conventions every task follows

- Folder per component: `packages/website/src/components/{Name}/{Name}.tsx` + `{Name}.module.css`; default export `function {Name}`; props type `{Name}Props` (never `Props`); `type`, never `interface`. Sub-parts used only by one component sit in its folder. Layouts: `src/layouts/{Name}/{Name}.tsx`.
- CSS modules: wrapper class `.root`; native nesting (`& selector`); never `:global(tag)` — to style nested markup (MDX output) use `.root & h2 { … }`; tokens for every colour, size and gap (`src/styles/tokens.css`, `--site-*`), per `docs/superpowers/conventions/ui-ux.md`. `composes` for shared vocabulary, as `src/components/TimeBar/popoverChrome.module.css` does.
- No global classes (owner, ask o89d: "all into modules … we can use css module compose to get these from shared modules"). `packages/website/src/styles/site.css` keeps only what cannot be a module: the tokens import, `@font-face`, `:root` variables and element rules (`html`, `body`, `h1`–`h3`, `p`, `a`, `kbd`, `img`, `:focus-visible`). The shared classes (`.wrap`, `.small`, `.section`, `.ring` + `.big`/`.small`/`.glyph`/`.glyph-ring`, `.grid` + `.halves`/`.thirds`/`.quarters`/`.statements`, `.tap-links`, `.say`, `.link-row`, `.onward`, `.unseen`, `.caption`, `.view-words`, `.sheet`, `.skip-link`, `.prose`, `.date`, `.proof`) move into concept-named vocabulary modules under `src/styles/` (e.g. `layout.module.css`, `type.module.css`, `ring.module.css`, `links.module.css`; no `.root`, a header saying what vocabulary it holds, like `popoverChrome.module.css`), and components take them with `composes: wrap from '../../styles/layout.module.css'`. A class used by one component only moves into that component's module. Attribute-state rules that read across components (`[data-opening] h1`, the gallery's `[data-gallery][data-live] …`) move into the module of the component that sets the attribute.
- Runtime relative imports carry their extension (`.tsx`, `.ts`, `.module.css`); type-only imports of `.d.ts` do not.
- `class:list` → template strings, or one helper `src/utils/cx.ts` (one function, one file) if three or more components need conditional lists.
- `set:html` → `dangerouslySetInnerHTML` (only where the string is built by our own code from our own data, as today).
- `Astro.url`, `Astro.site` → props passed down from the page or the document shell. `Astro.slots.has` → optional `ReactNode` props; named slots → named `ReactNode` props.
- Scripts: each `src/scripts/init*.ts` and each inline `<script>` becomes the island's own logic (state, effects, refs). `data-*` hooks that only served the script go. Delete the script file when its island lands.
- Moving or renaming a TS file: `npm run move-files -- <from> <to>`; grep for string-literal paths afterwards.
- Never a page-level `<style>` block: `about.astro`, `privacy.astro`, `science.astro` blocks move into components and `tests/packages/website/pageStyles.test.ts` allowances drop to 0 (then delete the test, since no page may have one; a grep check in the gate replaces it).
- Copy is not edited in this branch: text moves byte for byte. Facts stay where they are.

## Gate for every wave

`npm run site:compare` (Task 0.3) reports zero pages over the threshold against the baseline, at 1440 px and 400 px wide; plus `npm run site:check`, `npx vitest run tests/packages tests/tools`, `npm run site:build`, `npm run site:links`, `npm run site:repeats`. A differing page is fixed, or listed in the wave's report with the reason, for the owner's ruling. The built HTML of a static component carries no `<script>` the old one did not have; island count per page is listed in the wave's report.

---

## Wave 0 — foundation

### Task 0.1: React integration and scoped class names

**Files:** `packages/website/package.json`, `packages/website/astro.config.mjs`, `packages/website/tsconfig.json`, root `package-lock.json`

- [x] Add `@astrojs/react` (version matching Astro 7.3), `react`, `react-dom`, `@types/react`, `@types/react-dom` to the website workspace at the versions the app uses (root `package.json:189-190`, React 19.2.5). Landed `@astrojs/react` 7.0.1: 7.1.0 is inside the repo's three-day npm release cooldown.
- [x] Register `react()` before `mdx()` in `integrations`; set `vite.css.modules.generateScopedName` to `${basename(dirname(file))}-${name}` (cite `~/Development/web/rulkens.com/astro.config.ts:8-22` for the shape and its comment).
- [x] `tsconfig.json`: `jsx: "react-jsx"`, `jsxImportSource: "react"`.
- [x] Prove it with the smallest real component: `Icon` → `src/components/Icon/Icon.tsx` (no CSS), all imports updated, build identical.
- No new test: the build and the compare gate cover it.

### Task 0.2: Dev source attributes on React elements

**Files:** `tools/site/jsxSourceAttributes.ts` (new), `packages/website/astro.config.mjs`, `packages/website/src/dev/feedback/describeElement.ts` (only if the attribute names change), `tests/tools/site/jsxSourceAttributes.test.ts` (new)

**Contract:** in `astro dev` only, every host JSX element (lower-case tag) written in a website `.tsx` file gets `data-astro-source-file="<absolute path>"` and `data-astro-source-loc="<line>:<col>"`, the same attributes and value format Astro writes, so `describeElement.ts` and the note JSON stay unchanged. Absent from `astro build` output.

- [x] Implement as a `serve`-only, `pre` Vite plugin using the TypeScript parser (`tools/site/utils/stampJsxSource.ts`): `@astrojs/react` 7 removed its `babel` option, so there is no Babel hook to pass a plugin through. `loc` is Astro's own value, the 1-based position just after the opening tag's `>`.
- [x] Test `jsxSourceAttributes adds file and loc to host elements, not to components`: transform a two-line fixture, assert `<p>` gets both attributes with the right `line:col` and `<Foo>` gets none.
- [x] Check in a browser on your own dev server: the feedback tool's copy of the pointer (`__feedbackSources`, which the dev toolbar's attribute removal makes the only place it survives) names `Icon/Icon.tsx` for the `<svg>`.

### Task 0.3: `npm run site:compare` — the visual gate

**Files:** `tools/site/compareSite.ts` (new), `tools/site/@types/SiteCompareRow.d.ts` (new), `package.json` (script), `tools/site/README.md` or the nearest site tool doc (one line)

**Contract:** `npm run site:compare -- --baseline <dir> --current <dir> [--only <path-prefix>]` serves both built `dist/home/` trees, shoots every page listed in each sitemap (plus `/404.html`) at 1440 × 900 and 400 × 860, full-page, with animations and videos frozen (reduced motion, `video` paused at 0, the Home flight at progress 0), diffs each pair with `pixelmatch` (already in node_modules) and writes `<scratchpad>/compare/<page>-<width>-{base,cur,diff}.png` plus a table: page, width, changed pixels, ratio. Exit 1 when any page's ratio is over 0.001 or a page exists on one side only.

- [x] Build the baseline once from main `c2c38a1e7` into a scratch copy (`git worktree add` is the controller's step, not the task's: the task takes a directory).
- [x] Test `compareSite flags a page present on one side only` with two tiny fixture trees (no browser needed for that path).
- [x] Run it baseline-vs-baseline: zero diffs (proves the freezing is deterministic). About 4 minutes for 110 pages at both widths. The freezing is reduced motion, paused videos, `performance.now` fixed at 1000, a pass down the page so every picture is drawn, and every scrolled box (the docs list scrolls itself to the current page from a parse-time position that varies by 42 px) back to its top: the gate does not cover that scroll, check it by eye when DocsNav is rewritten. Pages are read from the built files, since the preview build writes no sitemap.

---

## Wave 1 — shell and shared parts

### Task 1.1: Layouts

**Files:** `src/layouts/Base.astro` (becomes the document shell), `src/layouts/BaseLayout/` (new: skip link, `Nav`, `<main id="main">`, `Footer`), `src/layouts/Docs.astro` → `src/layouts/DocsLayout/` (React, takes `headings`, `path`, `description`, `factIds`; DocBody comes with it), every page's import of the layouts.

- [x] Base.astro keeps: `<html>`, `<head>` (meta, `head` slot, JSON-LD via `set:html`, site.css import), the DEV overlay mount points, and renders `<BaseLayout>` with `path={Astro.url.pathname}` (no `site`: nothing inside needs it) and the nav menu and the footer's light line as slotted islands. `heroNav` is now a `hero` prop down to Nav, not a class on `<body>`.
- [x] `data-pagefind-body` and `data-pagefind-meta` stay on the docs article (the search index reads them).
- [x] `initSectionMark` becomes part of the `PageSections` island (Task 1.3).
- Deviation: `layouts/Docs.astro` stays, as a thin document shell like Base (Base plus the three docs islands, handed to `DocsLayout` as `nav`, `toc` and `sheet` slots), because five pages use it and only an `.astro` file can make an island. It is a second non-page `.astro` carve-out beside `Base.astro`.

### Task 1.2: Nav, Footer, DocsNav, DocsSearch, DocsMap

**Files:** the five component folders; delete `src/scripts/initDocsSearch.ts`.

- [x] Nav menu (`NavMenu`, `client:load`), DocsNav (`client:visible`, search and page sections inside it) and Footer's light line (`LightLine`, `client:visible`) are islands; Nav and Footer themselves are static, taking the island as a `menu` / `light` ReactNode slot prop, since an island can only be made from a `.astro` file. DocsNav's pre-paint script stays an inline `<script>` in its markup (a string in the component), so the first paint is unchanged. The docs index passes its `DocsSearch` to `DocsMap` the same way.
- [x] DocsSearch keeps loading the pagefind index with a native `import(/* @vite-ignore */ url)`; `initDocsSearch.ts` and the `SearchSheet` type are gone.

### Task 1.3: Shared leaves

**Files:** `ObjLink`, `ViewLink`, `OpenApp`, `Shot`, `ShotCaption`, `Sources`, `CopyButton`, `Remark`, `PageSections`, `FigureSheet` folders; delete `initSectionMark.ts`, `initFigureSheet.ts`.

- [x] CopyButton and Remark are islands (`client:visible` at their `.astro` call sites); FigureSheet is one island per page that also handles every `a[data-enlarge]` (keep that hook: it is set by figures across waves). FigureSheet is `client:idle`, not `client:visible`: a closed dialog is never visible, so it would never hydrate.

**Wave 1 done:** gate green; the note worker resumes; report island count on Home, a docs page and Features.

---

## Wave 2 — MDX components, data, cite and credits

### Task 2.1: The MDX components map

**Files:** `pages/docs/[...slug].astro:49-63` (map imports), folders for DocLink, CodeBlock, DocTable, DocFigure, FigureFrame, FactText, Example, View, Links, Keys, Note, Caveat, SourceLink, RepoLink, Flow, Formula, Spans; `src/utils/tableCells.ts` (replace or delete).

- [ ] `CodeBlock` and `DocTable` read their children as React elements (`Children.toArray`, element props) instead of `await Astro.slots.render()` + HTML parsing (`CodeBlock.astro:21`, `DocTable.astro:24`). The output HTML must match today's: test `DocTable renders the same table as before` compares the built HTML of two docs pages with tables against the baseline build's HTML (strip class names).
- [ ] DocBody's 25 `:global` prose rules become `.root & h2 { … }` descendant rules, keeping the `:not([data-embed] *)` guard.
- [ ] `url-parameters.mdx:28` `export const Codes` keeps working (it is JSX inside MDX; MDX now renders it with React).

### Task 2.2: Components imported by MDX pages

**Files:** OpenApp (done in 1.3), RedshiftSpace, ObjectList, ObjectFinder, WorkbenchFigure, Citation, CiteCaption, CiteRefs; delete `initObjectFinder.ts`.

- [ ] ObjectFinder is an island; ObjectList stays static and the finder filters rows through the DOM hooks it uses today (`[data-object]`, `[data-objects]`, `[data-object-sub]`), or ObjectFinder owns the list (implementer's call, smallest diff, report it). ObjectList's `<style is:global>` (`ObjectList.astro:58`) becomes its module.
- [ ] WorkbenchFigure keeps its `import.meta.glob` (`WorkbenchFigure.astro:21`) — it works in a `.tsx` under Vite.

### Task 2.3: Data, credits and cite parts

**Files:** RefLine, CreditEntry, Credits, DataEntryRecord, Recorded, RecordText, Row, UseLegend, UseTerms folders.

- [ ] `RecordText`'s three `set:html` (`:34,41,46`) → `dangerouslySetInnerHTML`.

**Wave 2 done:** gate green on all docs, data and credits pages.

---

## Wave 3 — Home and Features

### Task 3.1: The Home flight

**Files:** `Flight/` (island, `client:load`), delete `src/scripts/initFlight.ts`; `pages/index.astro`.

- [x] The pre-paint `is:inline` script (`Flight.astro:56`: sets `data-live`/`data-film` and `--nav-ground` before first paint) stays an `is:inline` script, emitted by the page or the shell right after the island's markup, so the first paint is unchanged. The island takes over from that state on hydration, without a flash. Deviation: the script's text is built by `Flight/prePaintScript.ts` (the film query lives once, in `filmQuery.ts`) and `index.astro` puts it in the head slot, and it marks `<html>` (`data-flight-live`, `data-flight-film`) instead of the section, so no attribute is set on markup React owns and nothing mismatches on hydration; the Flight modules read it as `:root[data-flight-live] .x`.
- [x] `pages/index.astro:21` keeps its top-level `await flightStills()` and passes the result as a prop.
- [x] Gate: Home compared with the flight at progress 0 AND at the last stop (scroll to the end), at both widths.

### Task 3.2: Places, PictureBand, Features

**Files:** Places (+ initPlaceDrift, initPlaceFilms), PictureBand (+ initGallery; `site.css:290-300` gallery rule moves into its module), FeatureStage, FeatureHead, FeatureLead, FeatureList, FeatureShot (+ initFeatureStage, initFeatureFilms); delete the five scripts.

- [x] Done. Deviation: a gallery band's parts (pictures, CaptionGallery, ViewWords) share the current view through React context, so the band is an island only where its words are React too: `Lead` (Home) and the new `ClassroomHero` (made for the classroom page, whose band was a gallery in `.astro`). A band with one view stays static and takes its words as children from any page.

### Task 3.3: The rest of Home

**Files:** Lead, Closing, CaptionGallery, Classroom, Dome, Honesty, Tour, FullFigure.

- [x] Done.

**Wave 3 done:** gate green on Home and Features, both widths, flight start and end.

---

## Wave 4 — the other landing pages

### Task 4.1: Components

**Files:** Claims, Columns, Beside, Group, SectionHead, SectionNav, SourceTable, AskList, AddressStrip, ContactForm (island; its 104-line inline script becomes the island's logic, the Turnstile widget and `POST /api/contact` unchanged), Disc, DiscBand, Offer, Figure, Step, Steps, PressPictures, LessonLinks, Feature.

- [x] Done. Deviations: ContactForm is an island only where the page places it (`domes.astro` chooses between `ContactForm` and the static `ContactClosed` from `CONTACT_ENDPOINT`, which an island cannot read, and passes endpoint, site key and hrefs as props). Named slots are optional `ReactNode` props (`picture`, `today`, `work`, `link`, `lede`, `note`) because `astro check` does not see `slot=` as props. `Group` takes `first` for the part that follows a `SectionHead` (the old rule reached into `.head`). `Steps` hands `Step` its large numeral through `--numeral-*` properties instead of `ol.fixed`. New small components for what the page `<style>` blocks held: `Quotable`, `InlineAddress`, `FramePair`, `StatementsFigure`; `Columns` gained `footLast`, `Figure` gained `seam`.

### Task 4.2: Page styles out of pages

**Files:** `pages/about.astro:169`, `pages/privacy.astro:143`, `pages/science.astro:272`, new component(s) holding those rules, `tests/packages/website/pageStyles.test.ts` (delete).

- [x] Done: no page has a `<style>` block; `pageStyles.test.ts` deleted. The pages take their `wrap`/`section`/`link-row`/`small` classes from the vocabulary modules.

- [ ] No `.astro` file under `src/` except pages and `layouts/Base.astro` remains; a grep in the gate checks it.
- [ ] `site.css` holds no class selectors: each shared class left it in the wave where its last `.astro` user was rewritten (until then the vocabulary module and the global copy coexist; the vocabulary module is the one to edit).

**Wave 4 done:** gate green on every page.

---

## Wave 5 — dev overlays in React

### Task 5.1: One overlay island

**Files:** `src/dev/feedback/*`, `src/dev/review/*`, `src/dev/overlay/*`, `feedback.css` and `review.css` → modules; `DevFeedback.astro`, `DevReview.astro` → one `client:only="react"` island mounted by `Base.astro` under `import.meta.env.DEV`.

**Contract unchanged:** the `__feedback` and `__review` routes and their JSON (`tools/site/@types/Feedback*.d.ts`, `DocsReview*.d.ts`), the keys (`f`, `?`, Shift+drag, `c` `w` `g` `m` `h`, Esc, Enter), the Keys box behaviour and its localStorage key, the section icons and panels, Apply and its polling. The overlay never appears in `astro build` output (the gate greps the build for `fb-`, `review-` and the overlay's module class prefixes).

- [x] Rewrite as React components (panels, pins, marks, Keys box) with module CSS; DOM-walking helpers that read the page (`describeElement`, `cssSelector`, `sectionsOf`, `wordsIn`…) stay plain functions.
- [x] `cssSelector.ts:6-8` drops `astro-*` classes; it keeps the `{Folder}-{class}` module names, which are stable and make good selectors.
- [x] Browser check on your own dev server, at 1600 and 400 px: leave a note, add each mark kind, open a section panel, open the Keys box, Apply page; screenshots in the report.

**Wave 5 done:** the owner leaves one note and one mark on Home and both arrive as before.

---

## Definition of Done

- **Deliverables:** `@astrojs/react` registered; every component under `packages/website/src/components/{Name}/` as `.tsx` + `.module.css`; `BaseLayout` and `DocsLayout` in React; `layouts/Base.astro` the only non-page `.astro` file; no `src/scripts/init*.ts` left; `tools/site/compareSite.ts` (`npm run site:compare`) and `tools/site/jsxSourceAttributes.ts` with their tests.
- **Observable:** every page at 1440 and 400 px matches the baseline under `site:compare`; the Home flight scrubs, its films play and its stops link; the Features stage switches groups and plays its loops; docs search opens with `/` and finds a page; the nav menu opens and closes on a phone; a copy button copies; the figure sheet enlarges a figure; the object finder filters; the contact form validates and shows its 503 message on dev; a note left in dev names the `.tsx` file it came from; review marks save on Home.
- **Built output:** class names read `{Folder}-{class}`; pages with no island ship no React runtime (list which pages load it).
- **Out of scope:** copy changes, new features, a design refresh, moving the app's components into the site, replacing pagefind, site-at-root.
