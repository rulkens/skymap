# Page folders and page structure files

Each landing page of the website gets its own folder holding its text, its structure file and its constants. The structure file (`<page>.structure.yaml`) holds the page's job and the job of each section. The review tool reads it. A visitor sees no difference. Branch `site/14-page-folders` off main, one draft PR.

## Rulings (owner, 2026-10-29, ask AH8F)

1. The page's `job` moves out of front matter into `<page>.structure.yaml`. Front matter keeps `title`, `description` and `image?`.
2. Files are named after the page: `features/features.mdx`, `features/features.structure.yaml`, `features/features.data.ts`.
3. The 8 landing pages now. The 27 docs pages follow in their own PR (backlogged by this PR), so until then a docs page keeps `job` in front matter.
4. Routes stay as one thin `.astro` per page in `src/pages/`.
5. The repeated class-string constants (`section`, `part`, `linkRow`, `prose`) become components or CSS classes, not constants.

Section jobs are drafted by the implementer in the job-line form (the reader's question, or what the section shows in one plain line). The owner corrects them, so list them in the PR body.

## Ground preparation

None needed: this PR is the reshaping. The `pages` collection and the `__job` dev route exist (#928). This PR changes where the files sit and adds a second file per page.

## Target shape

```
packages/website/src/
  pages/<route>.astro                 thin: getEntry('pages', '<page>') + its structure → <Base …><Content/></Base>
  content/pages/<page>/               page = home | features | classroom | domes | science | about | privacy | 404
    <page>.mdx                        front matter (title, description, image?) + imports + text; no `export const`
    <page>.structure.yaml             job + sections
    <page>.data.ts                    the page's own constants (only if it has any)
  data/                               only data more than one page or component uses
```

```ts
// @types/PageStructure.d.ts (or the website's equivalent @types home)
export type PageSection = { heading: string; job: string; parts?: PageSection[] };
export type PageStructure = { job: string; sections: PageSection[] };
```

- **Collections.** `pages` loads `*/*.mdx` with id = folder name. `pageStructures` loads `*/*.structure.yaml` with id = folder name and a zod schema matching `PageStructure`. Home's id becomes `home` (was `index`).
- **Job to the review bar.** The route passes `structure.job` to `Base` as `job`. The `skymap:job` meta stays.
- **Sections to the review tool.** In dev only, `Base` also writes the sections as JSON (for example `<script type="application/json" id="skymap-structure">`). `SectionPanel` shows the matching section's job at the top. Match on heading text.
- **Saving the job.** `PUT __job` writes the `job` in `<page>.structure.yaml` for a landing page, and still writes front matter for a docs page. `pageSourceFile` and `setFrontMatterJob` gain or lose what that needs. Keep one-symbol-per-file.
- **Drift check.** A tool (`tools/site/checkPageStructure.ts`, run in CI after `site:build`, beside `site:links`) reads each landing page's built HTML. It fails when a heading named in the YAML is not an h2/h3 on the page, or an h2/h3 on the page is missing from the YAML.
- **Domes contact.** The contact section moves from `pages/domes.astro` into an `.astro` component the MDX places. It is `.astro` because a `client:` island must stand as a tag (see the route's comment).
- **Page-only data.** Files in `data/` that exactly one page uses move into that page's folder as `<page>.data.ts`, or stay as their own file inside the folder when they are big (`homeJsonLd`, `aboutJsonLd` and so on). Fact registries stay in `data/`, because docs import them.

## Tasks

- [ ] **Task 1: Class strings.** Replace every `export const section/part = \`${layout.wrap} ${layout.section}\`` and the `linkRow`/`prose` strings with a component (for example `Part`) or a single CSS-module class. One commit.
- [ ] **Task 2: Folders.** Move the 8 MDX files into their folders with `npm run move-files` (then grep for old paths: `.astro`/`.mdx` imports are not rewritten). Move `export const` lists into `<page>.data.ts`. Move the Domes contact into its component. Move single-page data files. Update the collection glob, routes, route comments and `pageSourceFile`. One commit.
- [ ] **Task 3: Structure files.** Add the type, the collection, the 8 YAML files (headings from the built pages, drafted jobs), the job moved from front matter, `__job` writing YAML, the dev JSON plus the `SectionPanel` line, `checkPageStructure.ts` plus its CI step, and tests for the YAML writer and the drift comparison (pure function in `tools/site/utils/`). One commit.
- [ ] **Task 4: Backlog.** Add the docs-pages follow-up line to `docs/BACKLOG.md`. Add it to the same commit as Task 3 or its own.

## Definition of Done

- [ ] `npm run typecheck`, `npm run site:check`, `npm run site:build`, `npm run site:links` and the new structure check pass. Website and site-tool tests pass.
- [ ] No `export const` is left in any landing MDX file.
- [ ] The built HTML of all 8 pages is unchanged apart from dev-only output. Diff `dist/` before and after.
- [ ] The review tool on :5800 shows a page job and the section jobs, and editing the job in the bar rewrites the YAML.
- [ ] The PR body lists the drafted section jobs.

## Out of scope

- The docs pages (ruling 3): backlogged.
- Editing section jobs from the review tool. The YAML is edited by hand for now.
