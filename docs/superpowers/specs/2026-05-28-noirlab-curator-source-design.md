# NOIRLab as a curator image source — design

> **Status.** Brainstormed 2026-05-28, ready to plan.
> **Worktree.** `.claude/worktrees/curator-noirlab` on branch
> `worktree-curator-noirlab`.

## Problem

The famous-galaxy curator (`tools/famous-curator/`) currently has one
discovery surface for press imagery: a Wikipedia article-image picker
plus a generic "paste a URL" box. Wikipedia coverage is broad but
inconsistent — the hero image on the article is often a survey cutout
or amateur shot, and the genuinely good press composites
(NOIRLab/ESO/Hubble releases) live on the observatory archive pages
that Wikipedia merely links to.

NOIRLab publishes hundreds of high-quality CC BY 4.0 galaxy press
images at `https://noirlab.edu/public/images/<slug>/`. Today, the
maintainer can right-click the page's hero image and paste the direct
JPEG URL into the curator's URL box — but that loses the credit string
and licence metadata, which the maintainer then has to retype into the
MetadataForm by hand.

## Goal

Paste a NOIRLab press-image page URL (e.g.
`https://noirlab.edu/public/images/noao-m94/`) into the curator's URL
box. The curator resolves it server-side, downloads the **Large JPEG**
variant, and pre-fills the MetadataForm with credit and licence. No new
UI; the existing paste flow just gets smarter for one more host.

## Non-goals

- A NOIRLab search-driven picker. URL-paste only. Discovery comes later
  if needed.
- ESO / Hubble / JWST press archives. Same djangoplicity system, but
  each has its own credit-field markup; we'll add them one at a time
  when the maintainer asks. The architecture chosen here makes adding
  one a single-file change.
- TIFF support. NOIRLab's "Fullsize Original" is a TIFF that can exceed
  the curator's 50 MB pre-decode cap and serves no purpose at 1024²
  export: the Large JPEG is already well above the curator's working
  resolution. We deliberately pick the Large JPEG over the TIFF.

## Page anatomy (verified against M94)

Confirmed from a live fetch of `noirlab.edu/public/images/noao-m94/`:

| Field | Source | Example value |
|---|---|---|
| Large JPEG | `<a href>` preceded by `alt="Large JPEG"` | `https://storage.noirlab.edu/media/archives/images/large/noao-m94.jpg` |
| Fullsize Original | `<a href>` preceded by `alt="Fullsize Original"` | `https://storage.noirlab.edu/media/archives/images/original/noao-m94.tif` (fallback only) |
| og:image (secure) | `<meta property="og:image:secure_url">` | `.../screen/noao-m94.jpg` (last-resort fallback) |
| Credit | `<strong>Credit:</strong><div class="credit">…</div>` | `Hillary Mathis, N.A.Sharp/NOIRLab/NSF/AURA/` |
| Licence | site-wide policy at `/public/copyright/` | `CC BY 4.0` (hardcoded constant — NOT per-image markup) |

The credit `<div>` contains inline `<a>` wrappers around organisation
names; the parser strips them and collapses whitespace.

The licence is not on the page — every `/public/images/` entry shares
the site-wide CC BY 4.0 policy. The resolver returns the constant with
a comment explaining the rationale.

## Architecture

A new server-side resolver in the curator's Vite plugin, exposed via a
new route. The UI's URL-paste handler falls through Wikipedia →
`/api/resolve` → raw URL.

### Why server-side and not client-side (as Wikipedia is)

The Wikipedia resolver is client-side because Commons exposes anonymous
CORS via `origin=*`. NOIRLab's HTML pages don't send
`Access-Control-Allow-Origin`, so a browser-side `fetch()` fails. A
server-side resolver also keeps the HTML-scraping concerns
(User-Agent, retry, timeout, ESO/Hubble extensibility) in one place,
out of the browser.

### Layout

```
tools/famous-curator/plugin/
  noirlabResolver.ts          (new) pure: HTML → ResolvedMedia | null
  routes/resolve.ts           (new) host dispatch + HTML fetch
  apiPlugin.ts                (edit) wire POST /api/resolve
tools/famous-curator/ui/
  api.ts                      (edit) add resolveMedia(url)
  App.tsx                     (edit) URL-paste handler — fall through
tests/tools/famous-curator/
  noirlabResolver.test.ts     (new) fixture-based parse tests
  routes/resolve.test.ts      (new) handler tests w/ injected fetcher
  fixtures/noirlab-noao-m94.html  (new) verbatim live HTML
```

### Resolver contract

```ts
type ResolvedMedia = {
  directUrl: string;   // the image URL /api/fetch should download
  author: string;      // credit string, HTML stripped, whitespace collapsed
  license: string;     // short licence name, e.g. "CC BY 4.0"
  sourceUrl: string;   // the page URL the maintainer pasted, verbatim
};

// Pure. No I/O. `pageUrl` is echoed into `sourceUrl`.
parseNoirLabPage(html: string, pageUrl: string): ResolvedMedia | null;
```

**`directUrl` resolution order** (first match wins):

1. The `<a href>` immediately preceded by an `<img alt="Large JPEG">`.
2. The `<a href>` immediately preceded by an `<img alt="Fullsize Original">`.
3. The `<meta property="og:image:secure_url">` content attribute.

Returns `null` if none match — surfaces as a 422 from the route so the
maintainer sees "couldn't resolve this NOIRLab page" rather than a
silent fallback to the (often invalid) raw page URL.

**Credit parsing.** Match `<div class="credit">…</div>`, take inner
HTML, strip tags, collapse whitespace. Empty credit is allowed (the
field stays blank in the MetadataForm).

**Licence.** Module-level constant
`const NOIRLAB_LICENSE = 'CC BY 4.0'`, returned verbatim. Comment on
the constant cites `/public/copyright/`.

### Route contract

```
POST /api/resolve
  body: { url: string }
  200 → { directUrl, author, license, sourceUrl }
  404 → unknown host (UI falls through to raw URL)
  422 → host known but page unscrapeable (e.g. moved/removed)
  502 → upstream network failure
```

The handler:

1. Parses `url`, looks up the hostname in a `Map<string, ResolverFn>`.
   For now: `noirlab.edu` and `www.noirlab.edu` → NOIRLab resolver.
2. On match, fetches the page HTML via the injected fetcher (sends the
   curator's `User-Agent` per existing convention).
3. Dispatches to the resolver. Maps `null` → 422.
4. Returns the resolver output as JSON.

The HTML fetcher is injected so tests run with a static fixture and no
network.

### UI flow

`App.tsx`'s URL-paste handler, current logic:

```
url → resolveWikipediaMedia(url)
       ├─ {directUrl, author, license} → /api/fetch + prefill form
       └─ null → /api/fetch (raw URL, no metadata)
```

New logic:

```
url → resolveWikipediaMedia(url)
       ├─ {directUrl, author, license} → /api/fetch + prefill form
       └─ null → POST /api/resolve
                  ├─ 200 → /api/fetch (directUrl) + prefill form
                  ├─ 404 → /api/fetch (raw URL, no metadata)
                  └─ 422 / 5xx → surface error to user, halt
```

`sourceUrl` is also flowed into the MetadataForm (the form already has
the field; Wikipedia's flow currently fills it with the original
pasted URL, which is the correct behaviour for NOIRLab too).

## Tests

- **`noirlabResolver.test.ts`** — fixture-based:
  - Happy path: M94 fixture → asserts `directUrl` is the Large JPEG
    URL, `author` equals `"Hillary Mathis, N.A.Sharp/NOIRLab/NSF/AURA/"`
    (anchor stripped), `license` is `"CC BY 4.0"`, `sourceUrl` echoes
    input.
  - Fullsize-only fallback: a synthesised fixture with the Large JPEG
    `<a>` removed → asserts the Original `.tif` URL is returned.
  - og:image-only fallback: a synthesised fixture with all
    `archive_download` blocks removed → asserts og:image:secure_url.
  - Total miss: a fixture with no archive blocks and no og:image →
    asserts `null`.
  - Empty credit: a fixture with `<div class="credit"></div>` →
    asserts `author === ''`.
- **`routes/resolve.test.ts`** — integration:
  - Unknown host → 404.
  - NOIRLab host + happy fixture → 200 with expected JSON.
  - NOIRLab host + unscrapeable fixture → 422.
  - Injected fetcher throwing → 502.

The M94 fixture is the verbatim live HTML captured 2026-05-28; commit
it alongside the test so future runs are network-free.

## Risks & open questions

- **NOIRLab markup drift.** djangoplicity is stable but the maintainer
  could re-theme the press pages and change class names. Mitigation:
  the resolver's three-stage fallback (Large → Fullsize → og:image)
  means even a class rename only degrades us to the screen-size JPEG.
  We do not attempt fragile structural parsing.
- **Per-image attribution variation.** A handful of NOIRLab images use
  CC BY-NC or all-rights-reserved (e.g. press-conference photos), but
  none of the galaxy/nebula press releases do. If we ever ingest a
  non-CC BY entry, the operator will catch it during the MetadataForm
  review step. Not blocking.
- **ESO / Hubble extensibility.** Same djangoplicity engine, different
  domain + slight markup variation (ESO uses "Credit:" prefix in a
  `<th>` row, not a `<strong>`). Out of scope here but the route's
  host-dispatch table is the right seam for the future addition.

## Out of scope (explicit non-changes)

- `/api/fetch` is untouched — 50 MB cap, content-type guard, preview
  generation all unchanged.
- Wikipedia resolver is untouched.
- `famous_curated_overrides.json` schema is unchanged; it already
  carries `sourceUrl`, `license`, `author`.
