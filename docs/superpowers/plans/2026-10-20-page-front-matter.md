# Pages as MDX with front matter

Every written page of the website (the 27 docs texts and the 8 landing pages) carries its own `title`, `description`, `image?` and `job` in front matter, checked by zod at build. Landing pages become a `pages` content collection, so the Features redesign that follows can write its page as MDX. The docs tree keeps order and grouping. The review bar edits `job` in the MDX file. A visitor sees no difference. Branch `site/12-page-front-matter` off main, one draft PR, before the Features redesign.

## Rulings (owner, 2026-10-20)

1. Landing pages move into a schema-checked `pages` content collection. A missing required field fails the build.
2. Docs titles move into front matter. `docsTree.ts` keeps order and group, and holds a title only where no text file exists to hold one.
3. `job` lives in front matter. The review bar shows it and writes it back through the dev plugin. The review JSON's `job` goes.
4. `image?` is a shot id from `data/siteShots.ts`, validated at build. It defaults to the site card and feeds `og:image`, `twitter:image` and their alt.
5. Fields: `title`, `description`, `image?`, `job`.
6. A landing page's MDX body imports React components as the `.astro` pages do today.

### Owner answers to the plan's questions (2026-10-20)

- The prep goes in this PR as its own commit.
- **Landing jobs are drafted.** Write a one-line `job` for each of the 8 landing pages, in the same form as the docs job lines in `.superpowers/sdd/2026-10-05-companion-website/review/job-lines.md`: the question a reader comes to the page with. The owner will correct them. List them in the PR body.
- **Generated docs pages get a job too:** Credits, Glossary, All sources at a glance, and the data pages.
  - Each one's `job` sits beside its `title`: on its `DOCS_TREE` row (`DocsRow.job?`).
  - The data pages share one line, taken from `job-lines.md`, set once in the data route.
  - The review bar shows these jobs read-only, with the note "set in docsTree.ts". `PUT __job` answers 404 for them, as it does for any page with no front-matter file.
- About's description spells out the maker's name.
- **Features gets breadcrumb JSON-LD** like the other landing pages (Home › Features).

## Ground preparation

```
content/docs/**/*.mdx  ┐ front matter: pageFields (+ facts on docs): one zod object, content.config.ts
content/pages/*.mdx    ┘ body: MDX; landing pages import their components
pages/<id>.astro       → getEntry('pages', id) → <Base {...entry.data} jsonLd head heroNav><Content/></Base>
pages/docs/[...slug]   → <Docs path image job> → Docs.astro: loadDocsTree() → docsPlace() → title
DOCS_TREE              → order, group, up, family; title only on rows with no text file (generated, planned)
Base                   → title, description; image → shareImage() → og/twitter image; job → dev-only <meta>
reviewPlugin           → PUT __job → pageSourceFile(page) → setFrontMatterJob(source, job)
```

Missing joint: `DocsLayout.tsx:47` and `DocsMap.tsx:32` import `DOCS_TREE` themselves. A tree whose titles come from `getCollection` cannot be handed to them, and `astro:content` is Astro-only, so `docsTree.ts` (also read by `checkFold`, `checkSiteLinks` and the tests) cannot load it either. **Prep (Task 1, one commit, no behaviour change):** `DocsLayout` takes `place: DocsPlace` and `DocsMap` takes `groups`, both passed in by their `.astro` callers.

Everything else grows where it already sits:
- `Base` already takes `title` and `description`.
- The docs route already reads `entry.data`.
- Landing routes keep their files, so `checkFold`'s page list (`src/pages/*.astro`) and `docsTree.test`'s file match are unchanged.

## Contracts

### Schemas — `packages/website/src/content.config.ts`

```ts
// One object for every written page, so both collections mean the same thing by each field.
const pageFields = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  image: z
    .string()
    .refine((id) => SITE_SHOTS.some((shot) => shot.id === id && shot.widths.length > 0),
      'not a shot id with files in data/siteShots.ts')
    .optional(),
  job: z.string(),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: pageFields.extend({ facts: z.array(z.string()).default([]) }),
});
const pages = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/pages' }),
  schema: pageFields,
});
export const collections = { docs, pages };
```

What `title` means is unchanged in each collection. On a docs page it is the page's name (sidebar, h1, previous/next), and `Docs.astro` adds ` | Skymap docs`. On a landing page it is the whole `<title>`, as each `.astro` writes it today; the landing page's h1 stays in its body. `job` is required but may be `""` until it is written.

### Front matter

Docs (`content/docs/start/scene.mdx`):

```yaml
---
title: What is in the scene
description: Everything Skymap draws, from a park in Copenhagen to the edge of the observable universe, nearest first, and whether it is measured, derived or drawn.
job: "What am I looking at, and is it measured, derived or drawn?"
facts: [geodanmark-orthophoto, …]
---
```

Landing (`content/pages/domes.mdx`):

```mdx
---
title: Domes and museums | Skymap
description: We deliver a live fisheye picture, a dome or 4K film, or a screen built round one exhibit.
job: ""
---
import Beside from '../../components/Beside/Beside.tsx';
…
export const section = `${layout.wrap} ${layout.section}`;

<DiscBand …>
```

- Keys go in the order `title, description, image, job, facts`.
- `job` is always JSON-quoted, which is how the dev plugin writes it, so a save leaves no formatting diff.
- `title` and `description` are plain scalars, quoted only when they contain `: ` or ` #`, as `index` and `about` do.
- `image` ids are quoted (`image: "dome-web"`). `siteShots.test.ts` "is shown by a page" looks for the quoted id.

### Docs tree types

- `src/@types/DocsRow.ts` (new): `export type DocsRow = Omit<DocsPage, 'title'> & { title?: string };`. Its doc says the title is set only where no `content/docs` text holds one.
- `src/@types/DocsGroup.ts`: `export type DocsGroup<Page = DocsPage> = { name: string; purpose?: string; up: string; pages: readonly Page[] };`
- `DOCS_TREE: readonly DocsGroup<DocsRow>[]`.
- `src/utils/loadDocsTree.ts` (new; Astro-only, imports `astro:content`, never imported by tools or tests): `export async function loadDocsTree(): Promise<readonly DocsGroup[]>`. It sets each row's `title` to `row.title ?? <docs entry at that path>.data.title`. It throws `No title for "<path>": add one to its front matter, or to its row if it has no text file` when neither exists. A row's path is `/docs/${entry.id}/`.

### Share image

- `src/@types/ShareImage.ts` (new): `export type ShareImage = { src: string; width: number; height: number; alt: string };`
- `src/utils/shareImage.ts` (new): `export async function shareImage(id: string | undefined): Promise<ShareImage>`.
  - With no id it returns the site card: `og-card.jpg?url`, 1200 × 630, `siteShot('og-card').alt`. The `cardUrl` import moves here from `Base.astro`.
  - With an id it makes a 1200-px-wide JPEG with `getImage({ format: 'jpg', width: 1200 })` from the shot's widest `.webp`, and uses that shot's `alt`.
  - Load the shots through a **lazy** `import.meta.glob<{ default: ImageMetadata }>('../assets/shots/*.webp')`, as `utils/flightStills.ts:8` does but not eager, so only the chosen file is processed.

### Base props — `src/layouts/Base.astro`

```ts
type Props = {
  title: string;
  description: string;
  /** A shot id of data/siteShots.ts for link previews; the site card when absent. */
  image?: string;
  /** The page's job, for the dev review bar only; absent on pages made from data. */
  job?: string;
  jsonLd?: readonly Record<string, unknown>[];
  heroNav?: boolean;
  skipTo?: string;
};
```

- `og:image`, `twitter:image`, `og:image:width`, `og:image:height`, `og:image:alt` and `twitter:image:alt` all come from `shareImage(image)`.
- In dev only, the head carries `{import.meta.env.DEV && job !== undefined && <meta name="skymap:job" content={job} />}`.
- A build therefore has the same head as main's when `image` is absent.

### How a route renders a `pages` entry

Every landing route keeps its file under `src/pages/`. It holds only what a route can own: `Astro.site`, JSON-LD, the `head` slot, `heroNav` and build-time data an island needs. The body and the four fields come from the entry:

```astro
---
import { getEntry, render } from 'astro:content';
import Base from '../layouts/Base.astro';
import { breadcrumbJsonLd } from '../utils/breadcrumbJsonLd';

const entry = (await getEntry('pages', 'privacy'))!;
const { Content } = await render(entry);
---
<Base {...entry.data} jsonLd={[breadcrumbJsonLd(Astro.site!, [{ name: 'Privacy', path: '/privacy/' }])]}>
  <Content />
</Base>
```

Home also renders its `<Fragment slot="head">`, `heroNav`, and `homeJsonLd(Astro.site!, entry.data.description)`. It hands the flight its build-time data as MDX props: `<Content stops={flightStopViews(stills)} videoUrl={heroVideoUrl()} />`. The MDX then has `<Flight stops={props.stops} videoUrl={props.videoUrl} client:load />`. This is the one route→MDX contract. About computes `pageUrl` and `whatIs` for its JSON-LD in the route.

### Dev endpoint — `tools/site/reviewPlugin.ts`

```
PUT {BASE}__job?page=<site path, e.g. /docs/start/scene/>
body  { "job": string }
200   { "file": "<path under packages/website/src/content>" }
400 bad page or body · 403 not same-origin · 404 no front-matter file for that page
409 the file's job runs over several lines · 405 any method but PUT
```

- `reviewPlugin(base: string)` registers `${base}__review` (unchanged) and `${base}__job`. `astro.config.mjs:83` passes `BASE`.
- There is no GET: the page carries its job in the `skymap:job` meta.
- `tools/site/utils/pageSourceFile.ts` (new): `export function pageSourceFile(page: string): string | null`.
  - `/` maps to `pages/index.mdx`, `/docs/<id>/` to `docs/<id>.mdx`, and `/<id>/` to `pages/<id>.mdx`.
  - It returns null for any path `docsReviewStem` refuses (reuse it for the character check).
- `tools/site/utils/setFrontMatterJob.ts` (new): `export function setFrontMatterJob(source: string, job: string): string`.
  - It replaces the top-level `job:` line of the leading `---` block with `job: ${JSON.stringify(job)}`, or appends that line as the block's last line when there is none.
  - It throws when the source has no front matter, or when the existing value continues onto following lines (an indented line or a `|`/`>` block scalar).
- `src/dev/review/saveJob.ts` (new): `export async function saveJob(page: string, job: string): Promise<void>`. It PUTs to the route above and throws on a non-OK answer.

---

## Tasks

Suggested grouping for dispatch: **A** = Tasks 1–3 (docs and `Base`), **B** = Tasks 4–5 (landing MDX), **C** = Task 6 (dev tool). No task touches a `review: yes` trigger. No file is moved or renamed: the landing routes stay and their bodies are new `.mdx` files, so `npm run move-files` is not needed.

### Task 1: Docs layouts take the tree from their caller (prep)

**Files:**
- `packages/website/src/layouts/DocsLayout/DocsLayout.tsx`
- `packages/website/src/layouts/Docs.astro`
- `packages/website/src/components/DocsMap/DocsMap.tsx`
- `packages/website/src/pages/docs/index.astro`

- [x] `DocsLayout`: replace the `path` prop with `place: DocsPlace` and drop its `DOCS_TREE` and `docsPlace` imports (`DocsLayout.tsx:18-19,47`). `Docs.astro` already computes `docsPlace(DOCS_TREE, path)` at line 28: keep the whole result and pass it in.
- [x] `DocsMap`: take `groups: readonly DocsGroup[]` instead of importing `DOCS_TREE` (`DocsMap.tsx:12,32`). `docs/index.astro` passes `DOCS_TREE`.
- [x] Update both components' header comments where they name `data/docsTree.ts` as their own source.
- No new test: this is prop plumbing, and the build plus `site:compare --only /docs/` cover it.

### Task 2: Docs titles and jobs move into front matter

**Files:**
- `packages/website/src/content.config.ts`
- `packages/website/src/@types/DocsRow.ts` (new)
- `packages/website/src/@types/DocsGroup.ts`
- `packages/website/src/data/docsTree.ts`
- `packages/website/src/utils/loadDocsTree.ts` (new)
- `packages/website/src/layouts/Docs.astro`
- `packages/website/src/pages/docs/index.astro`
- all 27 `packages/website/src/content/docs/**/*.mdx`
- `tests/packages/website/docsTree.test.ts`

- [x] `content.config.ts`:
  - Define `pageFields` and `docs` as in **Schemas**, with the `pages` collection left out until Task 4.
  - Rewrite the header comment: fields live in each file, and order and group in `data/docsTree.ts`.
- [x] Add `DocsRow`, make `DocsGroup` generic, and type `DOCS_TREE` as `DocsGroup<DocsRow>[]`.
- [x] Delete `title` from every row whose page is a `content/docs` text (27 rows). Glossary, All sources at a glance, Credits and the `DATA_PAGES` rows keep theirs.
- [x] Add `title:` to each of the 27 MDX files, with the exact string the row had. Add `job:` from the table below, JSON-quoted.
- [x] Add `loadDocsTree`. `Docs.astro` and `docs/index.astro` use `await loadDocsTree()` in place of `DOCS_TREE`.
- [x] Update `docsTree.ts`'s header comment (titles live in the texts) and the `content.config.ts` cross-reference.
- [x] Test `docs tree › a row names its title exactly when no docs text holds one`.
  - For every row, assert `Boolean(row.title)` equals `!existsSync(content/docs/<path less /docs/ and the last slash>.mdx)`.
  - This catches a title written twice, and a generated page left with no title. Neither the build nor `astro check` notices the first.
- [x] `npx vitest run tests/packages/website/docsTree.test.ts tests/packages/website/docsPlace.test.ts tests/packages/website/features.test.ts`, then `npm run site:build`.

Job lines (from the cutter's `job-lines.md`):

| File under `content/docs/` | `job` |
| --- | --- |
| `start/first-flight.mdx` | What do I do in my first ten minutes with the app? |
| `start/scene.mdx` | What am I looking at, and is it measured, derived or drawn? |
| `start/browsers.mdx` | Why does the app not start or run well on my device, and what do I try? |
| `guide/moving.mdx` | How do I get from here to there? |
| `guide/finding.mdx` | How do I find an object by name, or find out what a point in the scene is? |
| `guide/time.mdx` | How do I see the scene at another date and time? |
| `guide/tours.mdx` | How do I start, steer and leave a tour or an exhibit? |
| `guide/sharing.mdx` | How do I send someone the view I am looking at? |
| `guide/info-cards.mdx` | What do the figures on this card mean, and can I quote them? |
| `guide/settings.mdx` | Which switch shows or hides this, or makes the picture brighter? |
| `guide/screens-and-domes.mdx` | How do I show skymap on a projector or in a dome? |
| `reference/controls.mdx` | Which key, click or gesture does this? |
| `reference/url-parameters.mdx` | What can I put in a link, and in what form? |
| `reference/settings.mdx` | What does this setting do, and where does it start? |
| `reference/objects.mdx` | Is this object in skymap, and what is the link that opens it? |
| `data/pipeline.mdx` | What is done to each catalogue between its published file and the app, and which tool does each step? |
| `science.mdx` | Which measurement, rule and paper does each position, distance, brightness, colour and size rest on? |
| `simplifications.mdx` | Where does the scene differ from the sky, by how much, and which source shows it? |
| `rendering.mdx` | In what order is one frame drawn, and which file holds each step? |
| `rendering/techniques.mdx` | Which published method draws each kind of object, and where is its paper? |
| `rendering/precision.mdx` | How does one scene hold both metres and billions of light-years, and where does the precision still fail? |
| `rendering/performance.mdx` | What does each part of a frame cost, and how do I measure it on my machine? |
| `roadmap.mdx` | What is planned, and how far along is each thing? |
| `cite.mdx` | How do I cite skymap, one view in it, and the catalogues behind that view? |
| `developers/workbenches.mdx` | Which developer tools sit beside the app, and how do I open each? |
| `developers/cli.mdx` | Which command runs, builds or measures what? |
| `developers/debug.mdx` | What does the debug panel show, and which flags can an address carry? |

The job lines are migrated verbatim. Their notes on merges and repeats are not part of this plan.

### Task 3: Base takes `image` and `job`

**Files:**
- `packages/website/src/@types/ShareImage.ts` (new)
- `packages/website/src/utils/shareImage.ts` (new)
- `packages/website/src/layouts/Base.astro`
- `packages/website/src/layouts/Docs.astro`
- `packages/website/src/pages/docs/[...slug].astro`

- [ ] Add `ShareImage` and `shareImage` as in **Share image**.
- [ ] `Base.astro`: apply the **Base props** contract. The six image meta tags read from `shareImage(image)`, and the dev-only `skymap:job` meta is added.
- [ ] `Docs.astro`: add `image?: string; job?: string` to `Props` and pass both to `Base`. `[...slug].astro` passes `entry.data.image` and `entry.data.job`. The generated docs routes pass neither.
- No unit test: `shareImage` wraps `getImage` and a glob, and vitest cannot load `astro:assets`. The DoD smoke checks it.

### Task 4: The `pages` collection, and the landing pages without slots or islands

**Files:**
- `packages/website/src/content.config.ts`
- `packages/website/src/content/pages/{features,404,privacy,science,about}.mdx` (new)
- `packages/website/src/pages/{features,404,privacy,science,about}.astro`
- `tests/packages/website/appLinks.test.ts`

- [ ] Add the `pages` collection (see **Schemas**).
- [ ] For each of the five pages, start a new MDX file:
  - Front matter: the route's `title` and `description` strings, byte for byte, and `job: ""`.
  - Body: the route's component imports, its other consts as `export const`, and the markup that sat between `<Base>` and `</Base>`.
  - About's description interpolates `MAKER_NAME`, which front matter cannot do: write the name out (Alexander Rulkens).
- [ ] Rewrite each route to the shape in **How a route renders a `pages` entry**, keeping its JSON-LD exactly. `features.astro` has none and gains none.
- [ ] MDX conversion rules. Each one changes markup if missed:
  - HTML comments `<!-- -->` become `{/* */}`.
  - Keep a block element's text on the line of its opening tag. Text on its own lines inside a JSX block is parsed as Markdown and wrapped in a `<p>` (a `<p>` inside a `<p>`).
  - Escape `{`, `<` and Markdown-active characters at line start (`-`, `#`, `1.`, `*`, `_`, `>`) in running text.
  - Bare URLs in text become links under GFM.
  - `class=` stays as written.
- [ ] `appLinks.test.ts:28`: widen the file filter to `/\.(astro|tsx|mdx)$/`, so the three landing bodies that call `appLink` stay under the test.
- [ ] `npx prettier --write` the new MDX files, then re-check: prettier formats MDX and can reflow JSX text.
- [ ] Check: build, then diff each of the five pages' built `<head>` and `<main>` against main's build. Ignore `astro-island` `uid`s; anything else is a finding.
- No new test: the schema is checked by the build, and the bodies by the compare gate.

### Task 5: The landing pages with slots and islands (classroom, domes, home)

**Files:**
- `packages/website/src/content/pages/{classroom,domes,index}.mdx` (new)
- `packages/website/src/pages/{classroom,domes,index}.astro`

- [ ] Same conversion and rules as Task 4.
- [ ] Domes has named slots on React components (`slot="note"`, `slot="picture"`, `<Fragment slot="today">`, `domes.astro:66-114`). Astro's JSX runtime maps `slot` attributes in MDX as in `.astro`. If `Fragment` is not in scope in MDX, import it from `astro/jsx-runtime`.
- [ ] Islands move as written: `ClassroomHero client:visible`, `ContactForm client:visible`, `Places client:visible` and `Lead client:visible`. `Flight client:load` is the exception: it moves with the props contract in **How a route renders a `pages` entry**.
- [ ] Home's route keeps the `head` fragment (preloads, the `is:inline` pre-paint script), `heroNav`, `stills` and its JSON-LD.
- [ ] Check: as in Task 4, plus on the dev server each island hydrates: the flight scrubs, the classroom hero runs, the contact form renders. Diff the island count per page against main's build.

### Task 6: The review bar edits `job` in front matter

**Files:**
- `tools/site/reviewPlugin.ts`
- `tools/site/utils/pageSourceFile.ts` (new)
- `tools/site/utils/setFrontMatterJob.ts` (new)
- `tools/site/@types/DocsReview.d.ts`
- `tools/site/utils/isDocsReview.ts`
- `packages/website/astro.config.mjs`
- `packages/website/src/dev/review/saveJob.ts` (new)
- `packages/website/src/dev/review/Review/Review.tsx`
- `packages/website/src/dev/review/ReviewPage/ReviewPage.tsx`
- `packages/website/src/dev/review/ReviewBar/ReviewBar.tsx`
- `tests/tools/site/setFrontMatterJob.test.ts` (new)
- `tests/tools/site/pageSourceFile.test.ts` (new)
- `tests/tools/site/docsReview.test.ts`

- [ ] Add the endpoint, both utils and `saveJob` as in **Dev endpoint**. The `__job` handler reuses `readBody` and the same-origin guard from `__review`.
- [ ] Delete `job` from `DocsReview` and from `isDocsReview`'s checks. Delete `job: ''` from the empty review (`Review.tsx:32`) and from the test fixture (`docsReview.test.ts:9`).
- [ ] `Review.tsx` reads the job from `document.querySelector<HTMLMetaElement>('meta[name="skymap:job"]')?.content` and passes it to `ReviewPage`.
  - `ReviewPage` hands `ReviewBar` the props `job: string | undefined` and `onJob={(job) => saveJob(review.page, job).catch(console.error)}`.
  - `ReviewBar` renders the job input only when `job !== undefined`.
  - After a save the dev server reloads the page from the changed MDX, so the bar needs no local copy.
- [ ] Remove the `job` key from the three local review JSON files under `.superpowers/sdd/2026-10-05-companion-website/review/`. They are gitignored, so nothing is committed.
- [ ] Tests `setFrontMatterJob`:
  - `replaces the job line and leaves every other line as it was`: a 5-line front matter with a multi-line `facts: [...]`. Assert that only the `job:` line differs.
  - `adds a job line at the end of the front matter when the page has none`.
  - `writes the job JSON-quoted, so a colon or a quote stays one string`: the input `Where: "here"` gives the line `job: "Where: \"here\""`.
  - `leaves a job: line in the body alone`.
  - `refuses a job that runs over several lines`: `job: >` followed by an indented line throws.
  - `refuses a file with no front matter`.
- [ ] Tests `pageSourceFile`:
  - `maps a docs page to its text`: `/docs/start/scene/` gives `docs/start/scene.mdx`.
  - `maps a landing page and home to the pages collection`: `/features/` gives `pages/features.mdx`, and `/` gives `pages/index.mdx`.
  - `refuses a path that climbs out`: `/docs/../../etc/` gives `null`.
- [ ] `npx vitest run tests/tools/site`.

---

## Risks

> [!RISK] Landing bodies are mostly component tags
> Home is 10 component tags, Features 2, and the others are sections of tags with short runs of text between them. MDX treats text inside a JSX block as Markdown (wrapping it in a `<p>`, reading emphasis, lists and autolinks), and a comment or a stray `{` is a syntax error. The Task 4 rules and the per-page `<main>` HTML diff against main's build are the guard. Expect most findings to be a `<p>` inside a `<p>`.

> [!RISK] `client:*` islands inside MDX
> Astro supports hydration directives in MDX, and the six islands keep their props. Home's `Flight` props come from the route via `<Content …>` and `props.*`: a misspelt prop is `undefined` at build with no type error, because MDX is not typechecked. Task 5's island check covers it. MDX bodies in general lose `astro check` coverage (science's and privacy's fact-id arrays, for one). An unknown fact id still throws at build.

> [!RISK] site:compare's limit is stricter than the owner's bar
> `compareSite.ts:27` fails a page over 0.1% of pixels, while the owner's gate is 1%. Run `npm run site:compare -- --baseline <main build>/dist/home --current dist/home`. The baseline is a fresh `npm run site:build` in a checkout of `origin/main`. Read `report.txt` against 1%, and list any page between 0.1% and 1% with its cause.

> [!RISK] site:links and site:fold
> The routes stay files, so `checkFold`'s page list is unchanged and no link target moves. Run `npm run site:links` after the build, and `npm run site:fold -- --url <server>/home/` against the built site. Both must be green with no new pending link.

> [!RISK] Search titles come from the docs h1
> Pagefind indexes only `data-pagefind-body` (the docs article) and takes the page's h1 as the result title. That h1 is `page.title`, which now comes from front matter, so a title copied wrong shows up as a changed search result and a compare diff on that page's opening. The DoD search check covers it.

> [!RISK] Dev reloads on a job save
> Writing the MDX file makes `astro dev` reload the page. Marks are already saved on each change, so nothing is lost, but the reload is visible. `loadDocsTree` reads `getCollection`, so sidebar titles follow a front-matter edit in dev without a restart. Feedback notes on landing-page markup that moved into MDX name the nearest React component instead of a `.astro` line.

## Definition of Done

**Deliverables**
- [ ] `src/content/pages/{index,features,classroom,domes,about,science,privacy,404}.mdx`, each with `title`, `description` and `job`, and a body that imports its components.
- [ ] `content.config.ts` with `docs` and `pages` sharing `pageFields`. `image` is checked against `SITE_SHOTS` rows that have files.
- [ ] The 27 docs texts carry `title` and `job`. `DOCS_TREE` holds titles only for Glossary, All sources at a glance, Credits and the data-source rows.
- [ ] `loadDocsTree`, `DocsRow`, `shareImage`, `ShareImage`, `pageSourceFile`, `setFrontMatterJob`, `saveJob`, and the `__job` endpoint.
- [ ] `DocsReview` has no `job`.

**Observable behaviour (smoke)**
- [ ] On every built page, `<title>`, the meta description, `og:*`/`twitter:*` and the h1 match main's build. `site:compare` shows no page over 1%. `site:links` and `site:fold` are green.
- [ ] Docs search for "first flight" lists **First flight**. A search for "precision" lists **Precision across scales**.
- [ ] Deleting `job:` from `start/scene.mdx` makes `npm run site:build` fail and name that file. So does `image: "no-such-shot"` on `features.mdx`, and so does `image: "og-card"` (a shot with no files). Revert all three.
- [ ] `image: "dome-web"` on `domes.mdx` gives a 1200-px JPEG of that shot as `og:image`, with the shot's alt in `og:image:alt` and `twitter:image:alt`. Revert.
- [ ] Dev server, `/docs/start/scene/`: the review bar shows "What am I looking at, and is it measured, derived or drawn?".
  - Edit the line and press Enter: `git diff` shows exactly one changed line, the `job:` line of `scene.mdx`, and the reloaded bar shows the new text. Revert.
  - On `/docs/credits/` and `/docs/data/` the bar has no job field.
  - On `/features/` the job field is there and empty.

**Out of scope**
- The Features redesign itself: its sections, copy, and any `image` choices.
- Copy of any kind: titles and descriptions move byte for byte, and h1s stay in the bodies.
- Job lines for the 8 landing pages and for the generated docs routes (docs index, Credits, All sources, data pages, Glossary). These routes stay `.astro` with props: their bodies are made from data and they have no file to hold front matter.
- The merge and repeat notes in `job-lines.md`, and any change to the cutter agents' prompts.
