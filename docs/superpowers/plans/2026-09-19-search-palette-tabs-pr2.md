# Search palette tabs — PR2 implementation plan: thumbnail capture

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run capture-featured` drives the running dev server headlessly and writes one thumbnail per focus card to `public/images/featured/<cardId>.webp`, the path `cardImageSrc` already reads. The PR commits the images, so every captured card shows a real thumbnail instead of the dashed text tile.

**Architecture:** A Node + Playwright tool in the `perf`/`record` harness pattern. It talks to the app only through `window.__skymapPerf` (`src/state/perf/installPerfHook.ts`), loading the page at `?perf&cinema#focus=<id>&t=<ISO>`. Which cards get captured is a pure function over `FEATURED_TABS`. Per-card framing (pose, clock, keep-focus) is hand-written presentation data on the card (`capture?`). The tool writes webp files only and never touches source.

**Tech stack:** tsx, Playwright (`@playwright/test`'s `chromium`), sharp 0.35, Vitest for the pure helpers.

**Spec:** [`docs/superpowers/specs/2026-09-19-search-palette-tabs-design.md`](../specs/2026-09-19-search-palette-tabs-design.md) §5.1 (image convention), §6 (the contract), §9 step 2. The framed poses come from [`docs/grill-sessions/search-palette-tabs-2026-09-18.md`](../../grill-sessions/search-palette-tabs-2026-09-18.md), "Capture spike findings".

**Execution:** two grouped dispatches in this worktree (Sonnet implementers), CI as the gate, one whole-branch review at the end.
- **Dispatch A:** Tasks 1–3 (prep, card data, pure helpers).
- **Dispatch B:** Task 1b (shared page boot, added after Dispatch A started) and Task 4 (the tool).
- **Controller + user:** Task 5 (the capture run and image commit). It needs the dev server, a GPU and the user's eyes.
- **No perf gate:** the only thing that reaches the app is a debug setting that already exists.

## Where this departs from the spec (read before reviewing)

- **No engine change for ring-off.** Spec §6 and §9 expect "a debug setting" to be added. One already exists: `settings.debug.disabledPasses`, written by `setPassDisabled` (`src/state/settings/core/debugSlice.ts`). The frame executor drops any render pass named there, after the pass's own gate (`src/services/engine/frame/executeFrame.ts:221-227`). The DebugPanel's renderer toggles use the same record. The capture tool disables three passes by name (Task 4). PR2 changes no `src/services/` file.
- **`CameraPose` already exists.** `src/@types/camera/CameraPose.d.ts` holds the four orbit fields plus an optional `roll`. The capture override uses it as it is, so nothing is lifted out of `PerfPose` in PR2. Rebasing `PerfPose` onto it (spec §3.8, radar finding 5) stays in PR3. `setPose` ignores `roll`, so that rebase has to decide what a `roll` on a perf pose means.
- **A small prep commit (Task 1).** Spec §3.6 says "PR2 needs no prep". But `launchChromium` exists twice, byte-for-byte (`tools/perf/measurePerf.ts:182-200`, `tools/record/record.ts:308-328`), and the capture tool would add a third copy. Task 1 extracts it first.
- **Three pure-helper tests.** Spec §8 says "no tests for the capture script". The browser driving still gets none. The skip rules, the pose-verify tolerance and the hidden-pass names are pure, and each can fail silently on a real bug (Tasks 3 and 4).
- **`keepFocus` on Hubble and Voyager 1 too,** not only on galaxies, structures and the Milky Way. Their framed poses are relative to the focused, moving body. If the focus is cleared, the pivot stops following the body and the spacecraft leaves the frame (at 7.5 km/s Hubble moves ~11 km in the 1.5 s after Esc, against a ~20 m camera distance).

## Global constraints

- `type` aliases, never `interface`. One type per file (`.d.ts`). One function per file under `tools/utils/`, with the filename = the symbol.
- The tool imports only Playwright, sharp, Node built-ins, `tools/utils/**`, and from `src/` only the data and action creators named in the tasks. Their import graphs are pure TS or type-only, so `tsx` loads them (as `record.ts` loads `tourRegistry`). Never import a renderer, a pass or `frameProgram`: their `.wesl?static` imports only resolve under Vite (see `measurePerf.ts:32-42`).
- Comments: why, not what. Module header ≤ 5 lines; comment lines ≤ half the code lines (`docs/superpowers/conventions/comments.md`).
- No commit trailers of any kind. Stage files by name, never `git add -A`. Run `npm run format` on touched files only.

---

### Task 1: Prep, one `launchChromium` for perf, record and capture

**Files:**
- Create: `tools/utils/browser/launchChromium.ts`
- Modify: `tools/perf/measurePerf.ts` (delete the local copy and its doc comment at `:182-200`), `tools/record/record.ts` (delete the local copy at `:308-328`)

**Contract:** `export async function launchChromium(): Promise<Browser>`. Same behaviour as both copies: the `'chromium'` channel first, then the headless shell with `--enable-unsafe-webgpu --use-angle=metal` and the two warnings.

- [ ] Create the file from the `measurePerf.ts` copy, with a ≤ 5-line header (why the channel comes first). Replace both local copies with an import, and drop any Playwright imports that go unused.
- [ ] **No test:** a launch wrapper, and both harnesses exercise it on their next run.
- [ ] `npm run typecheck:fast` passes. Commit as `prep(tools): one launchChromium for perf and record`.

### Task 1b: Prep, one page boot for perf, record and capture

User ruling 2026-09-19: the harness seams the capture tool needs are extracted first, in this PR. The wider `record.ts` breakup (ffmpeg pipe, preview server) is a separate PR.

**Files:**
- Create: `tools/utils/browser/bootHookedPage.ts`, `tools/utils/browser/isNavigationInterruption.ts`, `tools/utils/browser/collectPageErrors.ts`
- Modify: `tools/perf/measurePerf.ts` (`bootPerfPage`, `:199-227`), `tools/record/record.ts` (`isNavigationInterruption` `:536`, `awaitCaptureReady` `:559`, the goto + retry loop in `captureTake` `:740-761`)

**Contract:**

```ts
// Navigate, wait for window[hook], await its `ready`. Retries the wait (not the
// goto) up to 2 times when a navigation interrupts it: Vite's one-time dep-optimize
// reload on a cold cache. The hook wait times out at 15 s with an error naming
// the hook and the URL; the `ready` await has no harness timeout (cold loads are slow).
export async function bootHookedPage(page: Page, url: string, hook: '__skymapPerf' | '__skymapRecorder'): Promise<void>;
export function isNavigationInterruption(err: unknown): boolean;          // moved from record.ts as is
// Attach pageerror + console.error listeners; the returned array fills as they fire.
export function collectPageErrors(page: Page): string[];                  // entries `error: …` / `console.error: …`
```

- [ ] `bootPerfPage` becomes `newPage` + `collectPageErrors` + `bootHookedPage(page, `${url}/?perf`, '__skymapPerf')` + the `slotGroups` read. Its return shape is unchanged.
- [ ] `record.ts` replaces `awaitCaptureReady`, its local `isNavigationInterruption` and the retry loop with one `bootHookedPage(page, captureUrl, '__skymapRecorder')` call. Keep the recorder's own live `pageerror`/`console` logging (it prints as it goes and feeds `[diag]`), and keep everything after the boot (reload suppression, virtual-time pause) where it is. Move the cold-cache retry rationale into `bootHookedPage`'s header, within the 5-line budget.
- [ ] **No test:** the boot is Playwright plumbing with no pure core. `isNavigationInterruption` is a moved one-line regex.
- [ ] Smoke both harnesses once against this worktree's dev server: a short `npm run perf -- --url <Local: URL>` run, and `npm run record-clip -- <shortest clip> --url <Local: URL> --frames 30`. Both reach their first measurement or frame. Delete the recording with `rm -f`.
- [ ] `npm run typecheck` passes. Commit as `prep(tools): one page boot for perf and record`.

### Task 2: The capture override type and the framed poses (review: yes, camera poses)

**Files:**
- Create: `src/@types/palette/PaletteCardCapture.d.ts`
- Modify: `src/@types/palette/PaletteCard.d.ts`, `src/data/palette/featuredTabs.ts`

**Contract:**

```ts
// src/@types/palette/PaletteCardCapture.d.ts
import type { CameraPose } from '../camera/CameraPose';
/** How `npm run capture-featured` frames this card; presentation data, hand-written. */
export type PaletteCardCapture = {
  pose?: CameraPose;    // re-applied after the focus fly-in settles; `l`-key log units (Mpc, radians)
  t?: string;           // ISO instant, pinned via `#t=` (same string `#t=` takes)
  keepFocus?: boolean;  // keep the selection (focus dim) in the shot; default: clear it before capture
};

// PaletteCard gains
capture?: PaletteCardCapture;
```

**Data rules for `featuredTabs.ts`** (these values are the user's framing, copied verbatim from the transcript; don't round them):
- Declare three module constants above `FEATURED_TABS` and reference them from **every** copy of the card. Task 3 rejects copies whose `capture` values differ.
  - `HUBBLE_CAPTURE`: `{ t: '2026-09-18T13:00:12Z', keepFocus: true, pose: { target: [0, 0, 0], yaw: -1.938340168882169, pitch: 0.09915032713380474, distance: 6.55234811878065e-22 } }`
  - `VOYAGER1_CAPTURE`: `{ t: '2026-09-18T12:56:32Z', keepFocus: true, pose: { target: [0, 0, 0], yaw: 3.8408163993487223, pitch: -0.6565563346622649, distance: 2.356833031514677e-22 } }`
  - `PERSEVERANCE_CAPTURE`: `{ t: '2026-09-18T06:00:00Z' }`. This is the default site framing, lit at this instant. The user's own site pose needs the site-pose seam, which is deferred.
  - Leave a one-line comment on the two posed constants: `target` is ignored, because the focus pins the pivot to the body; `keepFocus` is required because the pose is relative to a moving body.
- `capture: { keepFocus: true }` on every copy of: `m31` (both copies: the Galaxies copy is never captured because of its `image` override, but Task 3's conflict check compares every copy), `MILKY_WAY_FOCUS_ID`, and each structure card (`group-local-group`, `group-m81-group`, `cluster-virgo-m87`, `supercluster-laniakea-sc`, `supercluster-coma-sc`, `void-bootes-void`).
- No other card gets `capture`.
- Update the module header's "nothing generates or rewrites it" line only if it no longer holds. It still holds: the tool reads this file and writes images only.

- [ ] Write the type and the data.
- [ ] **No test:** it is curation, and TS checks the shape.
- [ ] Commit.

### Task 3: Pure helpers, capture targets and pose verification

**Files:**
- Create:
  - `tools/utils/capture/CaptureTarget.d.ts`
  - `tools/utils/capture/selectCaptureTargets.ts`
  - `tools/utils/capture/poseMismatch.ts`
- Test: `tests/tools/utils/capture/selectCaptureTargets.test.ts`, `tests/tools/utils/capture/poseMismatch.test.ts`

**Contract:**

```ts
// CaptureTarget.d.ts
export type CaptureTarget = { cardId: string; focusId: string; capture: PaletteCardCapture };  // capture defaults to {}

// selectCaptureTargets.ts
export function selectCaptureTargets(
  tabs: readonly PaletteTab[],
  existing: ReadonlySet<string>,   // card ids that already have public/images/featured/<id>.webp
  force: readonly string[],        // --force card ids
): CaptureTarget[];

// poseMismatch.ts: names of the fields outside tolerance; [] = match
export function poseMismatch(
  requested: Pick<CameraPose, 'yaw' | 'pitch' | 'distance'>,
  live: Pick<CameraPose, 'yaw' | 'pitch' | 'distance'>,
): readonly ('yaw' | 'pitch' | 'distance')[];
```

**`selectCaptureTargets` rules:**
- Walk the tabs in file order. A card id listed in several tabs yields **one** target, at its first position.
- Skip a card whose `action.kind !== 'focus'` (view cards; PR3 captures them).
- Skip a card with an `image` override (the Galaxies tab). The skip rules apply per copy: `m31` is captured from its Highlights copy, although its Galaxies copy is skipped.
- Skip a card whose id is in `existing`, unless it is in `force`.
- Throw when a `force` id names no capturable card: unknown, or every copy of it is a view card or has an `image` override. A typo must not do nothing silently.
- Throw when two copies of one card id carry different `capture` values, skipped copies included (structural comparison; absent ≠ present). The message names the card id.

**`poseMismatch` rules** (tolerances are `const`s in the file):
- `yaw` is compared **modulo 2π**: the wrapped difference must be ≤ 1e-3 rad.
- `pitch`: absolute difference ≤ 1e-3 rad.
- `distance`: **relative** difference ≤ 1e-3. Framed spacecraft distances are ~1e-22 Mpc, and any absolute tolerance passes them all.
- `target` is not compared. Every posed card in PR2 keeps a focus, which overwrites the target with the body. PR3's view poses add the target check.

- [ ] Tests in `selectCaptureTargets.test.ts`. Use a small fixture tab set, not `FEATURED_TABS`.
  - `a card whose webp exists is skipped`.
  - `--force recaptures a card whose webp exists`.
  - `a card with an image override is never a target`.
  - `a view card is never a target`.
  - `a card listed in two tabs is captured once, at its first position`: tabs [[a, b], [b, c]] with c's webp existing → targets [a, b].
  - `a card is captured from a copy without an image override`: the same id as a plain card in tab 1 and an `image`-override card in tab 2 → one target (the `m31` case).
  - `forcing an unknown or uncapturable id throws`: an unknown id, then an id whose only copy has an `image` override; both throw.
  - `copies of one card with different capture overrides throw`.
- [ ] Tests in `poseMismatch.test.ts` (hand-computed values):
  - `a yaw a full turn away matches`: requested yaw 3.8408, live 3.8408 − 2π → `[]`.
  - `a sub-metre distance mismatch is caught by relative error`: 6.55e-22 vs 7.0e-22 → `['distance']`; 6.55e-22 vs 6.5503e-22 → `[]`.
  - `pitch outside tolerance is reported`: 0.0992 vs 0.1100 → `['pitch']`.
- [ ] Implement. `npm test -- tools/utils/capture` passes.
- [ ] Commit. This ends Dispatch A.

### Task 4: The capture tool (review: yes, landmine-ordered browser sequence)

**Files:**
- Create:
  - `tools/capture/captureFeatured.ts` (the entry point)
  - `tools/capture/captureHiddenPasses.ts`
  - `tools/capture/README.md`
- Modify: `package.json` (script `"capture-featured": "tsx tools/capture/captureFeatured.ts"`), `CLAUDE.md` (one line in the Commands block, next to `perf`)
- Test: `tests/tools/capture/captureHiddenPasses.test.ts`

**Contract:**

```ts
// captureHiddenPasses.ts: the render passes that draw a selection ring
export const CAPTURE_HIDDEN_PASSES: readonly string[] =
  ['selection-ring', 'near0-selection-ring', 'structure-markers'];
// selection-ring: galaxy / Milky Way ring (selectionRingPass.ts:44)
// near0-selection-ring: body / star ring (near0SelectionRingPass.ts:89)
// structure-markers: a focused structure's ring draws here, not in selection-ring (selectionRingPass.ts:14-15)
```

CLI: `npm run capture-featured -- [--url <base>] [--force <cardId> …]`.
- `--url` defaults to `http://localhost:5173`. Strip trailing slashes, and reject a base that carries `?` or `#`, the same rule as `tools/utils/record/buildCaptureUrl.ts`.
- `--force` takes every following argument up to the next `--flag`, and needs at least one.
- An unknown flag throws with the list of known flags. Use a bespoke argv loop, like `measurePerf.ts`'s `parseArgs`: `parseFlags` is boolean-only.

**Constants** (in `captureFeatured.ts`):
- Viewport 900×900, `deviceScaleFactor: 1`.
- Output 204×204 px. A grid card is ~101 CSS px wide: panel 560 px, minus a 1 px border and 14 px padding on each side, minus 4 gaps of 6 px, over 5 columns. So 204 is ×2 for retina.
- webp `quality: 82`, the famous-curator's setting (`tools/famous-curator/plugin/routes/process.ts:150`). That should land at ~10–20 KB. Warn, don't fail, above 40 KB.
- Settle: hold for 1000 ms, time out at 90 s per card. Post-Esc wait: 1500 ms.
- `DEFAULT_CAPTURE_T = '2026-09-18T12:00:00Z'`, the user's ruling on 2026-09-19. Every card without its own `capture.t` is captured at this instant, so a re-run gives the same lighting and positions. It's the capture-spike day, so the framed poses (13:00, 12:56) stay consistent. Noon UTC lights Europe and Africa on Earth. A badly lit card gets its own `t`; the default doesn't move.

**Run:**
1. Read `public/images/featured/*.webp` (create the directory if missing) into the `existing` set, and call `selectCaptureTargets(FEATURED_TABS, existing, force)`. Print the target count and exit 0 when it is zero.
2. `launchChromium()` (Task 1), with one context at the viewport above.

**Per target, in this order.** The order is the landmine fix: a focus fly-in overwrites any `setPose` issued before it settles.
1. Open a new page and `collectPageErrors(page)` (Task 1b). The URL is `${base}/?perf&cinema#focus=<focusId>` plus `&t=<capture.t ?? DEFAULT_CAPTURE_T>` (always pinned). `#focus=` and `#t=` are the hash rows in `src/state/url/hashParamSources.ts:113,193`.
2. `bootHookedPage(page, url, '__skymapPerf')` (Task 1b).
3. **Declutter**, in one `page.evaluate` over `__skymapPerf.getState().settings` (structured-cloned):
   - set every nested `labelEnabled` key to `false`;
   - set `orbitTrails.enabled = false`;
   - set every `structures.items[k].enabled = false`;
   - dispatch it as `mergeSnapshot(patch)`.
   Then dispatch `setPassDisabled({ pass, disabled: true })` for each of `CAPTURE_HIDDEN_PASSES`. Build these actions in Node from the imported creators (`src/state/settings/mergeSnapshotAction.ts`, `src/state/settings/core/debugSlice.ts`) and pass the plain objects into the page, so the compiler checks their payloads.
4. **Settle:** poll every 250 ms, with a page-side projection of `getState()`:
   - camera busy = `camera.clip`, `camera.tween` or `camera.frameTween` is non-null;
   - loading = the engine slice's `loadProgress` is non-null (the slice key is `engineRoute`, see `src/state/engine/selectors.ts:40`).
   Settled means neither holds, continuously, for the hold window.
5. If `capture.pose` is set: `__skymapPerf.setPose({ ...pose, rate: 0 })`. `rate: 0` is required: `setPose` re-arms auto-rotate at a default rate otherwise (`installPerfHook.ts:70`), and the yaw would drift before the shot. Then settle again.
6. If not `capture.keepFocus`: press `Escape` (the user's clear-selection shortcut, `keyboardShortcuts.ts:54`) and wait the post-Esc time.
7. If `capture.pose` is set, **verify**: dispatch the imported `logCameraState()` and take the next console message containing `camera state (full precision)`. Its second argument is the JSON string (`src/services/engine/helpers/logCameraState.ts:100`), mapped as `distance = distanceMpc`. Run `poseMismatch(pose, live)`. If anything mismatches, re-apply the pose once (step 5) and verify again. If it still mismatches, fail the card, print requested vs live, and write no file.
8. Take a PNG screenshot, then `sharp(png).resize(204, 204).webp({ quality: 82 })` to `public/images/featured/<cardId>.webp`. Print the card id and KB.
9. Close the page. A thrown error or a settle timeout fails the card, and the run continues.

At the end, print a summary (captured / failed with reasons / warnings over 40 KB). Exit 1 if any card failed.

**README** (`tools/capture/README.md`, short, the shape of `tools/perf/README.md`):
- Prerequisites: a running dev server; `--url` in a worktree (Vite's port auto-increments); the Playwright chromium channel.
- Usage and flags.
- Skip rules: existing file, `image` override, view card.
- Where the per-card overrides live (`capture` in `featuredTabs.ts`), and that the `l` key's log gives the pose units.
- The two landmines: the fly-in overwrites an early pose; the ring passes are hidden through `disabledPasses`.

- [ ] Test in `captureHiddenPasses.test.ts`: `every pass the capture hides is a real content pass`. Each `CAPTURE_HIDDEN_PASSES` name is in `CONTENT_PASSES.map(p => p.name)` (`src/services/engine/frame/passes/index.ts`). A renamed pass would otherwise bring the ring back into every shot, with no error.
- [ ] Implement the tool, the script entry, the README and the CLAUDE.md line.
- [ ] Smoke it once against the running dev server: `npm run capture-featured -- --url <this worktree's Local: URL> --force body-earth`. Check that it writes `public/images/featured/body-earth.webp` at 204×204. **Don't commit the image** (Task 5 does). Delete it afterwards with `rm -f`.
- [ ] Commit. This ends Dispatch B.

### Task 5: Capture run and images (controller + user)

**Files:** Create `public/images/featured/*.webp` (one per capturable card; about 45 once duplicates across tabs are merged).

- [ ] With the worktree's dev server running: `npm run capture-featured -- --url <Local: URL>`. Re-run failed cards with `--force <id>…` until the run exits 0.
- [ ] The user looks at every tab in the palette in the dev server. For a bad shot: adjust that card's `capture` in `featuredTabs.ts` (the `l` key logs a pose), then `--force` it.
- [ ] Stage `public/images/featured/` by path, plus any `featuredTabs.ts` capture edits. Commit as `feat(palette): featured thumbnails`.

---

## Definition of Done

**Deliverables:**
- `npm run capture-featured` (`tools/capture/captureFeatured.ts`) with `--url` and `--force`, plus `tools/capture/README.md` and a Commands line in `CLAUDE.md`.
- `tools/utils/browser/launchChromium.ts`, the only copy; `measurePerf.ts` and `record.ts` import it.
- `bootHookedPage`, `isNavigationInterruption`, `collectPageErrors` under `tools/utils/browser/`; perf, record and capture boot through `bootHookedPage`.
- `selectCaptureTargets`, `poseMismatch`, `CaptureTarget` under `tools/utils/capture/`; `CAPTURE_HIDDEN_PASSES` under `tools/capture/`.
- `PaletteCardCapture` and `PaletteCard.capture`; the Hubble, Voyager 1 and Perseverance captures plus `keepFocus` cards in `featuredTabs.ts`.
- A committed webp for every focus card without an `image` override.
- No `src/services/` or `src/state/` file changed.

**Smoke pass (the user, in the dev server):**
- Every tab except Galaxies shows real thumbnails, and no card falls back to the dashed text tile, except the four Highlights view cards (PR3).
- No thumbnail shows a selection ring, a label or an orbit trail.
- Hubble and Voyager 1 match their framed poses. Perseverance is lit.
- The Milky Way, M31 (Highlights) and the Deep Space structures show the focus dim.
- A second `npm run capture-featured` run captures nothing and exits 0.
- `--force body-hubble` recaptures one card. `--force body-hubbel` fails before a browser launches.
- Every file is ≤ 40 KB.

**Deferred (not this PR):**
- Breaking up `record.ts`: the ffmpeg pipe (`spawnFfmpeg`, `writeFrame`, `ffprobeReport`) and the preview server (`ensureServeBuild`, `ensureDataSymlink`, `spawnPreviewServer`) into `tools/utils/record/` (user ruling 2026-09-19: its own PR).
- View-card captures, and the `target` check in `poseMismatch` for focus-less poses (PR3).
- `PerfPose` rebased on `CameraPose`, including what `roll` means for `setPose` (PR3).
- The rover site-pose seam (a `setPose` site-frame arm), and with it the user's framed Perseverance pose (heading −2.084675604349344, elevation 0.2050471166478657, range 5.160687610215391 m, t=2026-09-19T10:14:04Z).
- A CI check that every card has an image, and recapturing when the scene's look changes.
