# `npm run shot` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under
> [`sdd-execution.md`](../conventions/sdd-execution.md) to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run shot -- <link>...` writes a PNG of each deep link as the app shows it, against a
running server (`--url`) or one it starts itself.

**Architecture:** A thin Playwright entry point over the joints the prep PR (#842) landed: it boots each
link through `bootHookedPage` on the always-installed `window.__skymap` hook, waits on
`__skymap.nextFrame()`, and screenshots. Everything decidable without a browser (argument parsing, link
normalisation, output naming, the wrong-checkout comparison) is a pure helper with a test.

**Tech Stack:** TypeScript run by `tsx`, Playwright (`chromium` channel), Vite, Vitest.

**Spec:** [`docs/superpowers/specs/2026-10-05-npm-run-shot-design.md`](../specs/2026-10-05-npm-run-shot-design.md),
sections "Rulings" and "Design".

## Global Constraints

- `type` aliases only. The tool's own types live in `tools/shot/@types/`, one per file; shared-helper
  types in `tools/@types/<area>/`. One function per file under `tools/utils/`, filename = symbol.
- stdout carries exactly one absolute path per shot and nothing else; every other message (progress,
  warnings, page errors, the timeout notice) goes to stderr.
- Defaults: 1600×900, DPR 2, `--timeout` 30 seconds, output `data/shots/<subject>-<YYYYMMDD-HHMMSS>.png`
  in local time.
- There is no default server URL. `--url` reuses a server and never starts or stops one; without it the
  tool starts a dev server, or a production build + preview under `--build`.
- A server the tool started is always stopped, including on a thrown error.
- Comments explain why, never what; module header ≤ 10 lines.

## Review Focus

- **Link forms a person will paste:** a full share URL with query and hash, a bare `focus=body-saturn`,
  the same with a leading `#`, a `?dome#focus=…` fragment, and a link with no hash at all.
- **A subject that never resolves:** the timeout must still produce a PNG of whatever is on screen and
  the run must exit non-zero after shooting the remaining links.
- **A link whose boot throws** (server down, hook missing): reported on stderr for that link, the other
  links still run, the run exits non-zero, and a spawned server is still stopped.
- **Two links with the same subject in one run** must not overwrite each other.
- **A built bundle's empty `projectRoot`** must not produce a wrong-checkout warning.

---

### Task 1: Link normalisation and argument parsing

**Files:** `tools/shot/@types/ShotLink.d.ts`, `tools/shot/@types/ShotOptions.d.ts`,
`tools/utils/shot/parseShotLink.ts`, `tools/shot/parseShotArgs.ts`,
`tests/tools/utils/shot/parseShotLink.test.ts`, `tests/tools/shot/parseShotArgs.test.ts` (all create)

**Contract:**

```ts
/** A link reduced to what the tool appends to its own server: no origin, no path. */
export type ShotLink = {
  readonly search: string; // without the leading '?', '' when absent
  readonly hash: string; // without the leading '#', '' when absent
};

export type ShotOptions = {
  readonly links: readonly ShotLink[];
  readonly url: string | undefined; // trailing slashes stripped
  readonly build: boolean;
  readonly out: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly hideUi: boolean;
  readonly hideLabels: boolean;
  readonly timeoutMs: number;
};

export function parseShotLink(raw: string): ShotLink;
export function parseShotArgs(argv: readonly string[]): ShotOptions; // throws Error with a usage hint
```

**Behaviour:** `parseShotLink` accepts a full `http(s)` URL (origin and path discarded), a string
starting with `?` or `#`, and a bare hash body. `parseShotArgs` reads positional links and the flags
`--url`, `--build`, `--out`, `--size` (via `tools/utils/record/parseSize.ts`), `--dpr`, `--hide-ui`,
`--hide-labels`, `--timeout` (seconds on the command line, milliseconds in the result). It throws on:
no links; `--out` with more than one link; `--build` together with `--url`; a `--url` carrying a query
or hash; an unknown flag; a non-positive `--dpr` or `--timeout`.

- [x] `parseShotLink` tests, one per form: `full URL keeps query and hash, drops origin and path`
      (`https://skymap.example/app/?dome#focus=body-saturn&t=1` → `{ search: 'dome', hash:
'focus=body-saturn&t=1' }`), `bare hash body`, `leading #`, `leading ? with a hash`, `URL with no
hash` (→ `hash: ''`).
- [x] `parseShotArgs` tests: `defaults` (one link → 1600, 900, dpr 2, timeoutMs 30000, both hide flags
      false, `url`/`out` undefined, `build` false); `--size 1280x720 --dpr 1 --timeout 5` → 1280, 720, 1,
      5000; `strips trailing slash from --url`; and one test per throwing case listed above, asserting
      the message names the offending flag.
- [x] Implement. `npm test -- parseShotLink parseShotArgs` passes. Commit.

### Task 2: Output naming

**Files:** `tools/utils/shot/shotOutName.ts`, `tests/tools/utils/shot/shotOutName.test.ts` (create)

**Signature:**

```ts
export function shotOutName(opts: {
  link: ShotLink;
  now: Date;
  taken: ReadonlySet<string>; // names already used in this run
}): string; // relative: 'data/shots/<subject>-<YYYYMMDD-HHMMSS>.png'
```

**Behaviour:** `<subject>` is the value of the first of `focus`, `exhibit`, `tour`, `clip` present in
the link's hash, with every character outside `[A-Za-z0-9._-]` replaced by `-`; `shot` when none is
present. Local time, as `tools/utils/record/defaultOutName.ts` stamps it. If the name is in `taken`,
append `-2`, `-3`, … before `.png` until it is free.

- [x] Tests: `names the shot after its focus id`; `falls back to exhibit, tour, clip in that order`;
      `uses "shot" when the hash names no subject`; `sanitises a subject with path characters`
      (`focus=a/b` → `a-b`); `suffixes a second shot of the same subject in one run`.
- [x] Implement. `npm test -- shotOutName` passes. Commit.

### Task 3: Wrong-checkout warning, shared with `perf`

**Files:** `tools/utils/io/projectRoot.ts`, `tools/utils/serve/checkoutMismatch.ts`,
`tools/utils/browser/warnIfWrongCheckout.ts`, `tests/tools/utils/serve/checkoutMismatch.test.ts`
(create); `tools/perf/measurePerf.ts` (modify, `bootPerfPage` near `:197`)

**Contract:**

```ts
/** Absolute path of the checkout this tool runs from. */
export const PROJECT_ROOT: string;

/** The warning line, or null when the server runs from this checkout or cannot say. */
export function checkoutMismatch(serverRoot: string, ownRoot: string): string | null;

/** Reads `window.__skymap.projectRoot` and writes the warning, if any, to stderr. */
export async function warnIfWrongCheckout(page: Page): Promise<void>;
```

**Behaviour:** `checkoutMismatch` returns null when `serverRoot` is `''` (a built bundle) or equals
`ownRoot` ignoring a trailing slash; otherwise one line naming both paths. `measurePerf` calls
`warnIfWrongCheckout(page)` right after `bootHookedPage`; it must not write to stdout (`--json` mode).

- [x] Tests: `no warning for the same checkout`; `no warning when only a trailing slash differs`;
      `no warning for a built bundle's empty root`; `names both paths when they differ`.
- [x] No test for `warnIfWrongCheckout` or `PROJECT_ROOT` (a page read and a constant).
- [x] Implement; wire into `measurePerf`. `npm run typecheck`, `npm test -- checkoutMismatch` pass. Commit.

### Task 4: Start a dev server

**Files:** `tools/utils/serve/spawnDevServer.ts` (create)

**Signature:** `spawnDevServer(): Promise<PreviewHandle>` — the same handle type
`tools/utils/serve/spawnPreviewServer.ts` returns (`tools/@types/serve/PreviewHandle.d.ts`).

**Behaviour:** spawns the project's `vite` dev server without pinning a port (Vite picks the next free
one), resolves once the `Local:` banner line appears with its URL read by
`tools/utils/record/parsePreviewUrl.ts`, and rejects with the tail of the output if the process exits
or 30 s pass first. Follow `spawnPreviewServer.ts` for process handling and teardown.

- [ ] No unit test: it only spawns a process; Task 5's smoke run exercises it.
- [ ] Implement. `npm run typecheck` passes. Commit.

### Task 5: The tool

**Files:** `tools/shot/@types/ShotOutcome.d.ts`, `tools/utils/shot/shootLink.ts`, `tools/shot/shot.ts`
(create); `package.json` (modify: `"shot": "tsx tools/shot/shot.ts"`)

**Contract:**

```ts
export type ShotOutcome = {
  readonly path: string | null; // absolute; null when no image could be taken
  readonly timedOut: boolean;
  readonly error: string | null; // a boot or navigation failure
  readonly pageErrors: readonly string[];
};

export async function shootLink(
  browser: Browser,
  base: string,
  link: ShotLink,
  opts: Pick<ShotOptions, 'width' | 'height' | 'dpr' | 'hideUi' | 'hideLabels' | 'timeoutMs'> & {
    outPath: string;
  },
): Promise<ShotOutcome>;
```

**Behaviour of `shootLink`:**

1. New context at `width`×`height`, `deviceScaleFactor: dpr`; collect page errors
   (`tools/utils/browser/collectPageErrors.ts`).
2. URL is `<base>/?<search>#<hash>`, with `cinema` added to the search under `hideUi` unless already
   there.
3. `bootHookedPage`, then under `hideLabels` dispatch
   `tools/utils/capture/labelDeclutterActions.ts`'s actions through
   `tools/utils/browser/dispatchActions.ts`, then await `window.__skymap.nextFrame()`.
4. Step 3 races `timeoutMs`. On expiry set `timedOut` and continue to step 5.
5. `page.screenshot({ type: 'png' })` written to `outPath` (create the directory). If step 3 threw,
   record `error` and still attempt the screenshot; `path` is null only if the screenshot itself fails.
6. Close the context in `finally`.

**Behaviour of `shot.ts`:** parse args; pick the server (`--url`, else `spawnDevServer()`, else under
`--build` the `ensureServeBuild` → `ensureDataSymlink` → `spawnPreviewServer` sequence `record.ts` uses
for `--serve`); launch one browser (`tools/utils/browser/launchChromium.ts`); for each link compute the
output path (`--out`, else `shotOutName`), call `shootLink`, print the absolute path on stdout, and
report a timeout, an error, and page errors on stderr; after the first booted page call
`warnIfWrongCheckout`. Close the browser and stop a spawned server in `finally`. Exit code 1 if any
outcome timed out, errored, or has no path; page errors alone do not change it.

- [ ] No unit test for `shootLink` or `shot.ts`: both are Playwright orchestration over tested helpers.
- [ ] Implement. `npm run typecheck` passes.
- [ ] Smoke against a running dev server (the controller supplies its URL): one body link writes a
      3200×1800 PNG and prints one absolute path on stdout. Commit.

### Task 6: Docs and convention

**Files:** `tools/shot/README.md` (create); `CLAUDE.md` (modify: the "Dev server stays running" bullet
and the Commands block); `tools/perf/README.md` (modify: mention the wrong-checkout warning where it
tells worktree users to pass `--url`)

- [ ] `tools/shot/README.md`: usage, the flag table, where shots land, the timeout and exit-code
      rules, and the wrong-checkout warning. No more than the tool does.
- [ ] `CLAUDE.md`, "Dev server stays running" bullet — replace its last sentence with: for a visual
      check, shoot the link with `npm run shot -- '<link>' --url <your server>`, look at the result,
      then send the shot and its deep link to the user as a dash check; the user keeps the verdict.
- [ ] `CLAUDE.md` Commands block: `npm run shot        # PNG of any deep link → tools/shot/README.md`.
- [ ] Commit.

---

## Definition of Done

**Deliverables**

- `npm run shot` (`tools/shot/shot.ts`), `tools/shot/README.md`.
- `parseShotLink`, `parseShotArgs`, `shotOutName`, `checkoutMismatch`, `warnIfWrongCheckout`,
  `spawnDevServer`, `shootLink`.
- `perf` warns on a wrong checkout.
- CLAUDE.md carries the shoot-look-send convention and the command.

**Observable behaviours**

- `npm run shot -- 'focus=body-saturn' --url <this worktree's server>`: one path on stdout, a
  3200×1800 PNG of Saturn with the UI panels, exit 0.
- The same with `--hide-ui --hide-labels --size 1280x720 --dpr 1`: a 1280×720 PNG with no panels and
  no labels.
- Two links in one run, one of them `exhibit=cosmicWeb`: two paths, two files.
- `focus=body-does-not-exist`: lands home, still writes a PNG.
- `--timeout 1`: a PNG is written, a timeout line appears on stderr, exit 1.
- No `--url`: a dev server starts, the shot is taken, the server is gone afterwards.
- `--build`: the same through the production build.
- `--url` pointing at another checkout's server: one warning line on stderr naming both paths; the
  shot is still taken. `npm run perf -- --url <that server>` prints the same warning.

**Out of scope**

- A warm browser or page between runs, parallel contexts, boot-time tuning.
- Changing `perf`'s default URL.
- Formats other than PNG.
- The `cosmicWeb` thumbnail drift in `capture-featured`.
