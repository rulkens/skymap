# NOIRLab Curator Image Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the famous-galaxy curator resolve NOIRLab press-image page URLs server-side, downloading the Large JPEG variant and pre-filling credit + licence into the MetadataForm.

**Architecture:** A new pure `parseNoirLabPage(html, pageUrl)` resolver in `tools/famous-curator/plugin/noirlabResolver.ts`, exposed via a new `POST /api/resolve` route that does host dispatch (just `noirlab.edu` for now). UI's existing URL-paste flow gains a Wikipedia → `/api/resolve` → raw-URL fallthrough.

**Tech Stack:** TypeScript, Vitest, Node Vite plugin for the curator backend, React for the curator UI. No new dependencies.

---

## Reading list (do this first)

Before starting any task, read:

- Spec: `docs/superpowers/specs/2026-05-28-noirlab-curator-source-design.md`
- Plan-style convention: `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code no.**
- Existing curator: `tools/famous-curator/plugin/apiPlugin.ts`,
  `tools/famous-curator/plugin/routes/fetch.ts`,
  `tools/famous-curator/ui/wikipediaMedia.ts`,
  `tools/famous-curator/ui/api.ts`,
  `tools/famous-curator/ui/App.tsx`
- Test patterns: `tests/tools/famous-curator/routes/fetch.test.ts`,
  `tests/tools/famous-curator/apiPlugin.routing.test.ts`,
  `tests/tools/famous-curator/ui/api.test.ts`

---

## Shared contracts (used by multiple tasks)

```ts
// Exported from tools/famous-curator/plugin/noirlabResolver.ts (Task 2),
// re-exported from routes/resolve.ts (Task 4), consumed by ui/api.ts (Task 6).
export type ResolvedMedia = {
  directUrl: string;   // image URL /api/fetch will download
  author: string;      // credit string, HTML stripped, whitespace collapsed
  license: string;     // short licence name, e.g. "CC BY 4.0"
  sourceUrl: string;   // page URL the maintainer pasted, verbatim
};
```

```
POST /api/resolve
  body: { url: string }
  200 → ResolvedMedia
  404 → unknown host (UI falls through to raw URL)
  422 → host known but page unscrapeable (resolver returned null)
  502 → upstream HTML fetch failed
```

Use these names **verbatim** across all tasks: `parseNoirLabPage`,
`ResolvedMedia`, `handleResolve`, `resolveMedia`, `NOIRLAB_LICENSE`,
`UnknownHostError`, `UnscrapeableError`, `UpstreamError`.

---

## Task 1: Commit the M94 fixture

**Files:**
- Create: `tests/tools/famous-curator/fixtures/noirlab-noao-m94.html`

**Steps:**

- [ ] `cp /tmp/noirlab-m94.html tests/tools/famous-curator/fixtures/noirlab-noao-m94.html`.
- [ ] `wc -c` the result — expect ≈ 82 KB (82189 bytes at capture time; allow ±5%).
- [ ] `git add tests/tools/famous-curator/fixtures/noirlab-noao-m94.html`.
- [ ] Commit: `test(curator): add NOIRLab M94 press-page fixture` with body noting the capture date (2026-05-28) and the source URL `https://noirlab.edu/public/images/noao-m94/`.

No tests in this task — the fixture is consumed by Task 2.

---

## Task 2: `parseNoirLabPage` — happy path

**Files:**
- Create: `tools/famous-curator/plugin/noirlabResolver.ts`
- Create: `tests/tools/famous-curator/noirlabResolver.test.ts`

**Contract:**

```ts
// Module-level constant — cite the site-wide policy at /public/copyright/
// in a comment above the constant.
export const NOIRLAB_LICENSE = 'CC BY 4.0';

// Pure. No I/O. pageUrl is echoed into sourceUrl unchanged.
export function parseNoirLabPage(
  html: string,
  pageUrl: string,
): ResolvedMedia | null;
```

`ResolvedMedia` is the type defined in the Shared contracts section above
(export it from this file; downstream modules import from here).

**Behaviour:** Resolve `directUrl` via the three-stage fallback (Large
JPEG → Fullsize Original → og:image:secure_url) per spec §Resolver
contract. Credit comes from `<div class="credit">…</div>` with inline
anchors stripped and whitespace collapsed. Empty credit is allowed
(returns `author: ''`, not null). `license` is always the
`NOIRLAB_LICENSE` constant.

**Tests** (assertions extracted verbatim from the fixture):

- [ ] `parses Large JPEG URL from the M94 fixture` — load
  `noirlab-noao-m94.html`, call `parseNoirLabPage(html, 'https://noirlab.edu/public/images/noao-m94/')`,
  assert `directUrl === 'https://storage.noirlab.edu/media/archives/images/large/noao-m94.jpg'`.
- [ ] `parses author string with inner anchors stripped` — assert
  `author === 'Hillary Mathis, N.A.Sharp/NOIRLab/NSF/AURA/'`.
- [ ] `returns the hardcoded CC BY 4.0 licence` — assert `license === 'CC BY 4.0'`.
- [ ] `echoes the input page URL as sourceUrl` — assert `sourceUrl === 'https://noirlab.edu/public/images/noao-m94/'`.

**Steps:**

- [ ] Write the four tests above against the fixture; confirm they fail
  with "module not found".
- [ ] Implement `parseNoirLabPage` and `NOIRLAB_LICENSE` per the contract.
  Use regex-based extraction (no full HTML parser dependency); follow
  the lightweight tag-strip + whitespace-collapse pattern from
  `tools/famous-curator/ui/wikipediaMedia.ts:63-65`.
- [ ] `npm test -- noirlabResolver` → 4 passing.
- [ ] Commit: `feat(curator): parseNoirLabPage resolver (happy path)`.

---

## Task 3: `parseNoirLabPage` — fallback chain

**Files:**
- Modify: `tests/tools/famous-curator/noirlabResolver.test.ts`
- Modify: `tools/famous-curator/plugin/noirlabResolver.ts` (only if Task 2's implementation didn't already cover the fallback — write the tests first and let them drive the change)

**Synthesised fixtures:** Build each variant in-test by string-replacing
the base M94 fixture. Do **not** commit new fixture files — keep the
mutations local to the test so the "intent" of each variant is visible
inline.

| Variant | Mutation |
|---|---|
| Fullsize-only | Remove the `<a>…</a>` block whose preceding `<img alt="Large JPEG">` exists. The Original `.tif` anchor remains. |
| og:image-only | Remove all `archive_download` blocks (matches the wrapper class around the Large/Fullsize anchors). |
| Total miss | The og:image-only mutation **plus** removing the `og:image:secure_url` `<meta>` tag. |
| Empty credit | Replace the inner HTML of `<div class="credit">…</div>` with empty string. |

**Tests:**

- [ ] `falls back to Fullsize Original when Large JPEG is absent` —
  assert `directUrl.endsWith('/original/noao-m94.tif')`.
- [ ] `falls back to og:image:secure_url when no archive_download blocks present` —
  assert `directUrl` matches `/screen/noao-m94.jpg` (the og:image
  variant per the spec's Page anatomy table).
- [ ] `returns null when no image source can be parsed` — assert the
  function returns `null` for the total-miss variant.
- [ ] `returns null author when credit div is empty` — assert
  `result !== null && result.author === ''`.

Resolution order is locked by spec §Resolver contract: Large → Fullsize
→ og:image. Cite that spec section in a comment above the resolver's
fallback chain.

**Steps:**

- [ ] Add the four tests; run them — they should fail if Task 2's
  implementation only handled the happy path.
- [ ] Extend `parseNoirLabPage` to cover the fallback chain.
- [ ] `npm test -- noirlabResolver` → 8 passing.
- [ ] Commit: `feat(curator): NOIRLab resolver fallback chain`.

---

## Task 4: `/api/resolve` route handler

**Files:**
- Create: `tools/famous-curator/plugin/routes/resolve.ts`
- Create: `tests/tools/famous-curator/routes/resolve.test.ts`

**Contract:**

```ts
export type ResolverFn = (html: string, pageUrl: string) => ResolvedMedia | null;
export type HtmlFetcher = (url: string) => Promise<string>;

// Typed errors — apiPlugin.ts maps each class to a specific HTTP status
// in Task 5. The class identity (not the message) is the dispatch key.
export class UnknownHostError extends Error {}
export class UnscrapeableError extends Error {}
export class UpstreamError extends Error {}

export async function handleResolve(opts: {
  body: { url: string };
  htmlFetcher: HtmlFetcher;
  hostDispatch: Map<string, ResolverFn>;
}): Promise<ResolvedMedia>;
```

Mirror the DI shape of `handleFetch` (cite
`tools/famous-curator/plugin/routes/fetch.ts:51-111`): no module-level
side effects, all I/O via injected parameters, throws on failure rather
than returning error envelopes.

**Behaviour:**

1. Parse `body.url` with `new URL(...)`; on parse failure throw
   `UnknownHostError`.
2. Look up `hostDispatch.get(url.hostname)`. Miss → throw
   `UnknownHostError`.
3. `await htmlFetcher(body.url)`. Reject → catch and throw
   `UpstreamError` (chain the original error via `cause`).
4. Call the resolver with `(html, body.url)`. `null` → throw
   `UnscrapeableError`.
5. Return the resolver output.

**Tests:**

- [ ] `returns ResolvedMedia for a known host` — `hostDispatch` contains
  a stub resolver returning a fixed `ResolvedMedia`; `htmlFetcher` is a
  stub that resolves with `'<html/>'`. Assert the returned object equals
  the stub's output.
- [ ] `throws UnknownHostError for an unknown host` — empty
  `hostDispatch`; assert `await expect(...).rejects.toBeInstanceOf(UnknownHostError)`.
- [ ] `throws UnscrapeableError when resolver returns null` — resolver
  stub returns `null`; assert `rejects.toBeInstanceOf(UnscrapeableError)`.
- [ ] `throws UpstreamError when the fetcher rejects` — `htmlFetcher`
  rejects with a network-shaped error; assert
  `rejects.toBeInstanceOf(UpstreamError)`.

**Steps:**

- [ ] Write the four tests; confirm they fail (missing module).
- [ ] Implement `handleResolve` + the three error classes.
- [ ] `npm test -- routes/resolve` → 4 passing.
- [ ] Commit: `feat(curator): /api/resolve route handler`.

---

## Task 5: Wire `/api/resolve` into the Vite plugin

**Files:**
- Modify: `tools/famous-curator/plugin/apiPlugin.ts`
- Modify: `tests/tools/famous-curator/apiPlugin.routing.test.ts`

**Where it wires in:** the `POST /api/fetch` block in
`apiPlugin.ts:207-247` is the shape to match — same body-read pattern,
same `imageFetcher`-style UA header on the HTML fetch, same `sendJson`
on success. Add the new block immediately after the `/api/fetch` block
to keep the route table grouped by method.

**Host dispatch construction** (build once at plugin boot, outside the
middleware closure — same lifecycle as `starnetConfig`):

```ts
const hostDispatch = new Map<string, ResolverFn>([
  ['noirlab.edu', parseNoirLabPage],
  ['www.noirlab.edu', parseNoirLabPage],
]);
```

**HTTP error mapping** (in the `catch (err)` block at
`apiPlugin.ts:294-303`, **before** the existing string-match cascade):

| Error class | Status |
|---|---|
| `UnknownHostError` | 404 |
| `UnscrapeableError` | 422 |
| `UpstreamError` | 502 |

Use `instanceof` checks, not string matching — the error classes are
the dispatch contract.

**HTML fetcher**: reuse the existing `imageFetcher` UA pattern (see
`apiPlugin.ts:225-238`) but expect `text/html` rather than `image/*`.
Strip the image-content-type guard; everything else (UA header,
non-OK throw) carries over verbatim.

**Test:**

- [ ] `POST /api/resolve returns 200 for a NOIRLab URL with stub fetcher`
  — extend `apiPlugin.routing.test.ts` to drive the plugin's middleware
  with a fake request + a stubbed global `fetch`. Assert the response
  status is 200 and the JSON body has the four `ResolvedMedia` fields.

**Steps:**

- [ ] Add the routing test; confirm it fails (route returns 404).
- [ ] Wire the route + host dispatch + error mapping.
- [ ] `npm test -- apiPlugin.routing` → existing tests + new one pass.
- [ ] Commit: `feat(curator): wire POST /api/resolve into apiPlugin`.

---

## Task 6: UI `resolveMedia` client

**Files:**
- Modify: `tools/famous-curator/ui/api.ts`
- Modify: `tests/tools/famous-curator/ui/api.test.ts`

**Contract:**

```ts
// Added to the Api type and makeApi factory in ui/api.ts.
// Returns null on 404 (unknown host) so the App.tsx fallthrough is a
// simple null-check; throws on 422 / 5xx so the user sees the error.
resolveMedia: (url: string) => Promise<ResolvedMedia | null>;
```

Re-export `ResolvedMedia` from `ui/api.ts` so consumers don't reach
across the plugin/ui boundary for the type. The shape is identical to
the resolver's; declaring it locally (rather than importing from
`../plugin/noirlabResolver`) keeps the UI bundle independent of plugin
internals, matching the convention used for `FetchResult` etc.

Mirror the shape of `postFetchUrl` at `ui/api.ts:118-124` for the POST
plumbing; the only divergence is the 404-returns-null behaviour, which
the existing `readOrThrow` helper doesn't support — write a small
inline branch in `resolveMedia` rather than generalising `readOrThrow`.

**Tests** (in `tests/tools/famous-curator/ui/api.test.ts` — file exists;
extend it):

- [ ] `resolveMedia returns ResolvedMedia on 200` — stub fetch resolves
  with `{ ok: true, status: 200, json: async () => ({ directUrl: ..., author: ..., license: ..., sourceUrl: ... }) }`.
  Assert the returned object matches.
- [ ] `resolveMedia returns null on 404` — stub fetch resolves with
  `{ ok: false, status: 404, json: async () => ({ error: 'unknown host' }) }`.
  Assert the call returns `null` (no throw).
- [ ] `resolveMedia throws on 422` — assert `rejects.toThrow()`.
- [ ] `resolveMedia throws on 502` — assert `rejects.toThrow()`.

Use a stubbed `fetch` injected via `makeApi({ fetch: stub })`; this is
the existing pattern in the file (no need for `vi.spyOn`).

**Steps:**

- [ ] Add the four tests; confirm they fail (method missing).
- [ ] Add `resolveMedia` to the `Api` type and the `makeApi` factory.
- [ ] `npm test -- ui/api` → all green.
- [ ] Commit: `feat(curator): UI resolveMedia client`.

---

## Task 7: UI URL-paste fallthrough

**Files:**
- Modify: `tools/famous-curator/ui/App.tsx`

**Where:** `onFetch` at `App.tsx:135-165` and the resume branch at
`App.tsx:261-262` (inside `GalaxyList.onSelect`'s recipe-resume
handler). Both call `resolveWikipediaMedia(url).catch(() => null)`;
both gain the same fallthrough.

**New control flow** (per spec §UI flow):

```
url → resolveWikipediaMedia(url)
       ├─ ResolvedMedia → use directUrl + prefill form (current path)
       └─ null → resolveMedia(url)  (the new /api/resolve client)
                  ├─ ResolvedMedia → use directUrl + prefill form
                  ├─ null (404)    → /api/fetch(url) (existing raw-URL path)
                  └─ throw         → surface error to user, halt
```

**Prefill rule:** when `resolveMedia` returns a `ResolvedMedia`,
dispatch `setMetadata` with `sourceUrl: url` (the **original** pasted
URL, NOT `returned.sourceUrl` — though they should be equal, the App
already follows this pattern for Wikipedia at
`App.tsx:155`: it sets `sourceUrl` to the human-pasted URL, not the
Commons direct URL). The `author` and `license` come from the resolved
object.

**Error surfacing:** match how `/api/fetch` failures are currently
displayed. As of writing, `App.tsx:160-164` only `console.error`s and
clears the busy spinner — no user-facing banner. Apply the same
treatment to a thrown `resolveMedia`; do not invent a new error UI in
this plan. (If the maintainer wants an error banner later, that's a
separate feature.)

**Tests:** none new for `App.tsx`. The existing integration tests
(`App.test.tsx`, `App.resumable.test.tsx`) cover the Wikipedia path;
the new branch is structurally identical — type-checking + the unit
tests on `resolveMedia` + the routing test on `/api/resolve` together
prove correctness. Cite this rationale in the commit body.

**Steps:**

- [ ] Update `onFetch` (`App.tsx:135-165`) — chain `resolveMedia(url)`
  after the Wikipedia null branch.
- [ ] Update the resume branch (`App.tsx:261-262`) symmetrically.
- [ ] Hoist any shared resolve-then-dispatch logic into a local helper
  inside `App` only if both sites copy more than ~5 lines verbatim;
  otherwise inline both is fine (project convention favours readability
  over premature DRY in component code).
- [ ] `npm run typecheck` → green.
- [ ] `npm test -- App` → existing tests still green.
- [ ] Commit: `feat(curator): URL-paste fallthrough to /api/resolve`.

---

## Task 8: Final verification + summary commit

**Files:** none modified — verification only.

**Steps:**

- [ ] `npm test -- famous-curator` → all curator tests green
  (existing + the new ones from Tasks 2, 3, 4, 5, 6).
- [ ] `npm run typecheck` → both src and tools tsconfigs clean.
- [ ] Verify no `TODO` / `FIXME` strings were introduced by this plan
  in any modified file: `grep -rn 'TODO\|FIXME' tools/famous-curator/plugin/noirlabResolver.ts tools/famous-curator/plugin/routes/resolve.ts tools/famous-curator/plugin/apiPlugin.ts tools/famous-curator/ui/api.ts tools/famous-curator/ui/App.tsx`
  → no matches added by this work.
- [ ] If everything passes and no further commits are warranted, this
  task is a no-op (the per-task commits already form the PR history).
  If a final omnibus commit is desired, use message
  `feat(curator): add NOIRLab as a press-image source` with a body
  citing `docs/superpowers/specs/2026-05-28-noirlab-curator-source-design.md`.

---

## Self-review (plan author's checklist — done before commit)

- Every spec §Architecture and §Tests bullet is covered: resolver
  (Tasks 2, 3), route (Task 4), apiPlugin wiring (Task 5), UI client
  (Task 6), UI flow (Task 7), fixture commit (Task 1).
- No placeholders (`TODO`, `TBD`, `implement later`) in the plan body.
- Names are consistent across tasks: `parseNoirLabPage`,
  `ResolvedMedia`, `handleResolve`, `resolveMedia`, `NOIRLAB_LICENSE`,
  `UnknownHostError`, `UnscrapeableError`, `UpstreamError`.
- Test names quoted in the plan match the spec's Tests list where
  applicable (happy path + three fallback variants + empty credit +
  four route tests).
- Contract code (types, signatures, test names, byte-level expected
  values) is present; full function bodies are not. Citations point at
  current file paths with line ranges.
