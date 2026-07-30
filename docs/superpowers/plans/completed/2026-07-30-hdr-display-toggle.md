# HDR display toggle

REQUIRED SUB-SKILL: superpowers:subagent-driven-development

> Implements [`specs/2026-07-30-hdr-display-toggle.md`](../specs/2026-07-30-hdr-display-toggle.md).
> Tasks 1–4 are the spec's prep refactors (Ground preparation), each behaviour-neutral;
> tasks 5–9 are the feature; task 10 is the review gate. All of it lands on the
> **existing** branch `spike/hdr-mode` (worktree `.claude/worktrees/hdr-mode`) and the
> **existing** PR **#497** — do not open a new PR, and do not branch off main.

## Goal

Turn extended-range canvas output from a `?hdr` URL flag into a Bloom-shaped section in
Settings → Display: master toggle on the section header, knee and headroom sliders
inside. Flipping it reconfigures the swap chain live, so nothing is allocated for anyone
who leaves it off, and no reload is involved.

## Architecture

**The swap format becomes mutable, with exactly one home.** `renderTargets`' `swap` spec
row already records it (`renderTargets.ts:183`) and the executor already resolves the
composite's destination format from there, so the row becomes the single source of truth
for "is extended-range live?". Nothing caches a second copy — the three existing `hdr`
booleans are deleted rather than repointed.

**Boot is always SDR.** `device.ts` stops choosing between formats: it configures the
preferred 8-bit format and reports the display's capability. Because
`DEFAULT_HDR_ENABLED` is `false`, the desired format at boot always equals the preferred
one, so there is no init-time settings read and `initGpu` needs no store access. Every
transition is the watcher's job.

**Switching is reconfigure + rebuild.** `context.configure()` accepts a new format on a
live canvas (probe evidence in the spec's Decisions), but a pipeline baked for the old
format fails validation against the new swap texture — so the eight swap-format renderer
construction sites must re-run. Task 1 gives them a seam; task 7 calls it.

**Two facts, never fused.** `hdrCapable` (the display can show it) is carried; `hdrActive`
(the swap chain is float) is derived. The old single `hdr` boolean meant both plus "the
URL flag was passed", which is why it was mirrored three times.

### Files touched

- `src/services/engine/phases/buildSwapRenderers.ts` — new. The eight construction sites
  plus the label-director re-attach, as one re-runnable function.
- `src/services/engine/phases/initGpu.ts` — calls it; retains `fontAtlases` on `state.gpu`.
- `src/services/gpu/renderTargets.ts` — gains `setSwapFormat`.
- `src/utils/gpu/hdrActiveOf.ts` — new (one function per file). Derives `hdrActive`.
- `src/services/gpu/device.ts` — drops the `?hdr` gate and the `any` cast; reports capability.
- `src/@types/webgpuToneMapping.d.ts` — new. Ambient widening of `GPUCanvasConfiguration`.
- `src/@types/settings/HdrSettings.d.ts` — new (one type per file).
- `src/state/settings/{settingsSlice,initialState,selectors}.ts` — the `hdr` cluster.
- `src/state/engine/{engineSlice,selectors}.ts` — `hdrCapable` status + selector.
- `src/store/effects/watchSwapFormatSaga.ts` — new. Watches the toggle + the capability
  and asks the engine for the desired format via `ReconcileEffects`.
- `src/services/engine/phases/applySwapFormat.ts` — new. Reconfigure + repoint + rebuild,
  guarded on desired ≠ live.
- `src/components/SettingsPanel/{CollapsibleSection,DisplaySection}.tsx` +
  `src/components/containers/DisplaySectionContainer.tsx` — the UI.
- `src/services/engine/frame/renderFrame.ts` — the two-conjunct gate.
- Deleted: `GpuContext.hdr`, `EngineGpuHandles.hdr`, `ReadyFrameContext.hdr`.

### Explicitly unchanged

- **`ToneMap`'s field names** stay `hdrKnee` / `hdrHeadroom` (`ToneMap.d.ts:34,46`). It is
  a flat GPU uniform, not a settings cluster; only the settings field names move.
- **The compositor.** It takes `dstFormat` per draw and keys its pipeline cache
  `${blend}:${dstFormat}` (`compositor.ts:247`), so it follows the swap row with no edit.
- **`lib/tonemap.wesl` and the compositor fragment shader.** No shader work in this plan.
- **Post-tone-map overlay brightness.** Labels still draw at white over a scene that can
  exceed it — spec "Out of scope".

## Tech Stack

TypeScript, Vitest, React (function components + `memo`), RTK slices/selectors, raw
WebGPU. No WESL edits. No new dependencies.

## Global Constraints

- **Branch:** `spike/hdr-mode` in worktree `.claude/worktrees/hdr-mode`. PR **#497**
  already exists — push to it, never open another. Never `gh pr merge` from a worktree.
- **Suite green at every commit:** `npm test` passes, `npm run typecheck` clean,
  `npm run lint` clean.
- **House rules:** `type` never `interface`; **one symbol per file** in `src/utils/` and
  **one type per file** in `src/@types/`; didactic module headers explaining _why_ and
  what the alternative was; comments timeless (no "moved from", no dates, no PR refs).
- **Components:** read `.claude/skills/create-component/SKILL.md` before touching any
  `.tsx`. Presentational components import nothing from `store/`/`state/`; all store
  reach lives in the paired container; `cx` for composed `className`, never template
  literals.
- **RTK reducer args** are named `settings` / `action`, never `s` / `a`.
- **Format only touched files** (`npx prettier --write <paths>`), never repo-wide.
- **Stage specific paths** — never `git add -A` / `git add .`.
- **Commit trailer:** the repo's exact current form — read it with
  `git log -3 --format='%b'`. Use the user's git identity; never `--author`.
- One commit per task. Tick this plan's checkboxes in the same commit as the work.
- **Tests must be able to fail on a real bug.** No runtime type tests, no constant
  restatements, no clamp-boundary mirrors — see
  [`conventions/testing.md`](../conventions/testing.md).

---

## Task 1: Extract `buildSwapRenderers` — the re-runnable seam

**Files:** `src/services/engine/phases/buildSwapRenderers.ts` (new),
`src/services/engine/phases/initGpu.ts` (modify),
`src/@types/engine/handles/EngineGpuHandles.d.ts` (modify),
`tests/services/engine/phases/buildSwapRenderers.test.ts` (new).

Pure extraction — **behaviour-neutral**. The eight swap-format construction sites are
`initGpu.ts:234` (`labelRenderer`), `:237` (`markerLineRenderer`), `:246`
(`debugLineRenderer`), `:253` (`selectionRingRenderer`), `:459` (`pickDebugOverlay`),
`:467` (`diskRadiusRing`), `:594` (`foregroundLabelRenderer`), `:619`
(`foregroundMarkerLineRenderer`). The director attach at `:282` moves with them.

`fontAtlases` is currently a local (`initGpu.ts:224`); it must be retained on `state.gpu`
so a later rebuild can re-run these factories.

**Contract:**

```ts
export function buildSwapRenderers(state: EngineState, format: GPUTextureFormat): void;
```

Destroys any existing instance of each of the eight handles before replacing it, then
re-attaches the label director (`state.subsystems.labelDirector.attachRenderers(...)`).

- [x] Read `initGpu.ts:200-300` and `:450-630` in full before moving anything. The eight
      sites are **not contiguous** — three blocks separated by unrelated construction.
- [x] Add `fontAtlases` to `EngineGpuHandles` (nullable, null until `initGpu`), and store
      it in `initGpu` where it is currently a local.
- [x] Create `buildSwapRenderers.ts` with the eight constructions **in their current
      relative order** and the director attach last. Carry each site's existing didactic
      comment with it — those comments explain the `occludeAgainstDepth` coverage-vs-compare
      choice and the capacity derivations, and they are the reason the sites look
      asymmetric.
- [x] Replace the three blocks in `initGpu.ts` with the single call, placed at the
      **earliest** of the three original positions (the `:222-255` block), since the
      director attach at `:282` depends on it.
- [x] **Verify the order claim rather than assuming it.** `pickDebugOverlay` (`:459`) and
      `diskRadiusRing` (`:467`) currently construct _after_ things that run between
      `:255` and `:459`. Confirm neither reads state produced in that window (they take
      only `device` + `format`); if either does, keep it at its original position and
      say so in the module header.
- [x] Add the test `buildSwapRenderers destroys the previous renderers before replacing them`
      — call twice with a stub `EngineState`, assert each first-round handle's `destroy`
      spy fired and `state.gpu.*` now holds the second-round instances.
- [x] Add the test `buildSwapRenderers re-attaches the label director to the new renderers`
      — assert `attachRenderers` was called with the _second-round_ label and marker-line
      instances. This is the failure that would otherwise be silent until labels vanish.
- [x] `npm test -- buildSwapRenderers` → both pass. `npm run typecheck` clean.
- [x] **Boot the app and confirm labels, marker lines, and the selection ring still
      draw.** A pure extraction that quietly drops one of eight constructions typechecks
      fine and only shows up visually. — carried to, and cleared by, the end-of-plan
      visual pass (task 10).
- [x] Commit.

---

## Task 2: `renderTargets.setSwapFormat(next)`

**Files:** `src/services/gpu/renderTargets.ts` (modify),
`src/@types/rendering/RenderTargets.d.ts` (modify),
`tests/services/gpu/renderTargets.test.ts` (modify).

The `swap` row carries a format but no texture (`renderTargets.ts:85-91`), so this
replaces one spec row and allocates nothing. Prefer replacing the `specs` array over
mutating a row in place (house preference for immutability); `specs` is already
`readonly RenderTargetSpec[]`.

**Contract:**

```ts
setSwapFormat(next: GPUTextureFormat): void;
```

- [x] Add the test `setSwapFormat replaces the swap row's format and leaves offscreen rows alone`
      — assert the `swap` spec's format changed and that `hdr` / `volume` / `foreground:0`
      formats and the offscreen textures are untouched (no reallocation).
- [x] Run it, watch it fail.
- [x] Implement against the existing `buildSpecs` shape (`renderTargets.ts:161-192`).
- [x] `npm test -- renderTargets` → passes. `npm run typecheck` clean.
- [x] Commit.

---

## Task 3: Split the `hdr` boolean into carried capability + derived activity

**Files:** `src/utils/gpu/hdrActiveOf.ts` (new),
`src/@types/rendering/GpuContext.d.ts`, `src/services/gpu/device.ts`,
`src/@types/engine/handles/EngineGpuHandles.d.ts`,
`src/@types/engine/frame/ReadyFrameContext.d.ts`,
`src/services/engine/{engine.ts,phases/initGpu.ts,frame/frameContext.ts,frame/renderFrame.ts}`
(modify), `tests/utils/gpu/hdrActiveOf.test.ts` (new).

Three booleans go away: `GpuContext.hdr` (`GpuContext.d.ts:58`), `EngineGpuHandles.hdr`
(`EngineGpuHandles.d.ts:97`, assigned `initGpu.ts:131`, seeded `engine.ts:280`),
`ReadyFrameContext.hdr` (`ReadyFrameContext.d.ts:127`, set `frameContext.ts:154,210`).
`GpuContext` gains `hdrCapable`. Read sites derive instead.

**Contract:**

```ts
// src/utils/gpu/hdrActiveOf.ts — one function per file
export function hdrActiveOf(renderTargets: RenderTargets): boolean;
```

Returns `true` when the `swap` spec's format is `'rgba16float'`.

Still behaviour-neutral: `device.ts` keeps its `?hdr` gate this task (it is removed in
task 6), so the boot format is unchanged and `hdrActiveOf` returns exactly what
`ctx.hdr` used to.

- [x] Add the test `hdrActiveOf is true only for an rgba16float swap row` — assert both
      arms against a stub `RenderTargets`.
- [x] Implement `hdrActiveOf`; delete the three boolean declarations and their
      assignments; repoint `renderFrame.ts:96-97` at `hdrActiveOf(ctx.renderTargets)`.
- [x] `GpuContext.hdrCapable` is **required, not optional** — the old field's optionality
      existed only to avoid touching call sites (its own doc comment says so). Fix the
      call sites.
- [x] Update `renderFrame.test.ts`'s fixture (`:304-305`, `:632-648`) for the new shape.
- [x] `npm test` (full suite — this touches the frame context) and `npm run typecheck`.
- [x] Commit.

---

## Task 4: Move `hdrKnee` / `hdrHeadroom` into a `settings.hdr` cluster

**Files:** `src/@types/settings/HdrSettings.d.ts` (new),
`src/@types/settings/EngineSettingsState.d.ts` (modify, `:136,141`),
`src/state/settings/{initialState.ts,settingsSlice.ts,selectors.ts}` (modify),
`src/data/defaults.ts` (doc comments only), `src/services/engine/frame/renderFrame.ts`,
`src/components/containers/DisplaySectionContainer.tsx`,
`tests/state/settings/makeSettingsFixture.ts` (modify).

Field rename plus cluster move; **no `enabled` yet** — that arrives in task 5, keeping
this diff behaviour-neutral. `tonemap` keeps `exposure` and `curve` only.

**Contract:**

```ts
export type HdrSettings = {
  knee: number;
  headroom: number;
};
```

`settings.hdr.knee` / `.headroom`; selectors stay named `selectHdrKnee` /
`selectHdrHeadroom`; reducers stay named `setHdrKnee` / `setHdrHeadroom` (only their
write targets change).

- [x] Use `npm run refactor -- rename` for the field renames where it applies; the
      cluster move itself is a hand-edit across the nine sites (grep
      `hdrKnee\|hdrHeadroom` — src has nine, tests have the fixtures).
- [x] Update the `DEFAULT_HDR_KNEE` / `DEFAULT_HDR_HEADROOM` doc comments in
      `defaults.ts:304-332`, which name `settings.tonemap.hdrKnee` explicitly.
- [x] No new test. This is a rename the compiler enforces; the existing
      `renderFrame.test.ts` tone assertions already cover the values reaching the GPU
      struct, and a test that restates the cluster path would fail only on a rename.
- [x] `npm test`, `npm run typecheck`, `npm run lint` all clean.
- [x] Commit. **This is the last prep commit** — tasks 1–4 should be four separate
      commits with no behaviour change between them.

---

## Task 5: `settings.hdr.enabled`

**Files:** `src/data/defaults.ts`, `src/@types/settings/HdrSettings.d.ts`,
`src/state/settings/{initialState.ts,settingsSlice.ts,selectors.ts}`,
`tests/state/settings/{makeSettingsFixture.ts,settingsSlice.test.ts}` (modify).

**Contract:**

```ts
export const DEFAULT_HDR_ENABLED = false;
// HdrSettings gains: enabled: boolean;
setHdrEnabled(next: boolean); // reducer
selectHdrEnabled(state: RootState): boolean;
```

Default `false` even on a capable display — spec D1. The `defaults.ts` doc comment should
carry that reasoning (the viewer chooses; it is not a consequence of their monitor).

- [x] Add the reducer test `setHdrEnabled flips the flag` mirroring the existing
      bloom-enabled reducer test. — no bloom-enabled reducer test exists (plan error);
      mirrored `setFlowEnabled` / `setStarCatalogEnabled` instead.
- [x] Implement beside `setHdrKnee` (`settingsSlice.ts:135`) and `selectHdrKnee`
      (`selectors.ts:121`).
- [x] `npm test -- settings`, `npm run typecheck`.
- [x] Commit.

---

## Task 6: Report display capability; drop the URL gate and the `any` cast

**Files:** `src/services/gpu/device.ts`, `src/@types/webgpuToneMapping.d.ts` (new),
`src/state/engine/{engineSlice.ts,selectors.ts}`,
`src/@types/store/EngineSliceState.d.ts` (`:40` — the slice shape),
`src/services/engine/phases/initGpu.ts`,
`tests/state/engine/engineSlice.test.ts` (modify).

Three changes that all belong to "the browser's answer reaches the app honestly":

1. `device.ts` stops gating on `hasUrlGate('hdr')` and stops choosing a format. It
   configures `getPreferredCanvasFormat()` and returns `hdrCapable`. Rewrite the
   `:96-127` comment block — it currently explains a spike gate that no longer exists.
2. The `toneMapping` `any` cast (`device.ts:162`) is deleted. `device.ts` no longer sets
   `toneMapping` at boot at all (boot is SDR). **No ambient widening** — the plan called
   for one on the assumption the pinned types lacked the field, but
   `@webgpu/types@0.1.69` already declares `toneMapping?: GPUCanvasToneMapping`
   (`index.d.ts:772,780`), and a merging `interface` declaration cannot satisfy the
   house `type`-never-`interface` lint rule. Dropping the cast alone achieves the goal.
3. `hdrCapable` lands on the engine slice beside `scale` / `sourceCounts`
   (`engineSlice.ts:50-58`) via `engineHdrCapabilityChanged`, with a
   `selectHdrCapable` selector. **Live, not a boot snapshot:** a `matchMedia` `change`
   listener re-dispatches, so moving the window to an SDR monitor updates it.
   `useIsMobile.ts:43-45` is the listener pattern; the listener must be removed on engine
   teardown.

- [x] Delete the `hasUrlGate('hdr')` read. Check whether `hasUrlGate` still has other
      callers (it does — `?debug`, `?gpuTimings`, `?perf`); leave it in place.
- [x] Add the reducer test `engineHdrCapabilityChanged records the display capability`.
- [x] Add the test `the media-query listener re-dispatches on change` — assert a
      dispatched capability update when a stub `MediaQueryList` fires `change`. This is
      the one piece of this task that can silently rot; a listener that is registered but
      never wired to a dispatch looks correct on inspection.
- [x] Verify no remaining `?hdr` references: grep `'hdr'` in `src/utils/url/` and
      `docs/`, and check `README` / `docs/RENDERER.md` for a documented `?hdr` flag that
      now needs updating to point at the setting. — `DisplaySection.tsx`'s stale comment
      is task 9's, per this plan.
- [x] `npm test`, `npm run typecheck`, `npm run lint`.
- [x] Commit.

---

## Task 7: The switch — reconfigure, repoint the swap row, rebuild

**Files:** `src/store/effects/watchSwapFormatSaga.ts` (new),
`src/store/effects/ReconcileEffects.ts` (modify), the root saga registration,
`src/services/engine/phases/applySwapFormat.ts` (new), the engine's
`ReconcileEffects` construction (`engine.ts`),
`tests/store/effects/watchSwapFormatSaga.test.ts` (new).

The store layer holds no engine imports: sagas reach the engine through the
`ReconcileEffects` closure via `getContext<ReconcileEffects>('reconcile')` —
`watchFlowReseedSaga.ts` is the closest model, including its "ignore payloads that
don't matter" guard.

**Contract:**

```ts
// ReconcileEffects gains:
applySwapFormat(desired: GPUTextureFormat): void;

// src/services/engine/phases/applySwapFormat.ts
export function applySwapFormat(state: EngineState, desired: GPUTextureFormat): void;
```

`applySwapFormat` **returns early when `desired` already equals the live swap format**
(`hdrActiveOf` plus the row's format) — the guard lives engine-side because the saga
cannot see the live format. Otherwise it does exactly three things, in this order:
`context.configure({ device, format: desired, alphaMode: 'premultiplied', ...(desired
=== 'rgba16float' ? { toneMapping: { mode: 'extended' } } : {}) })`, then
`renderTargets.setSwapFormat(desired)`, then `buildSwapRenderers(state, desired)`.

The saga takes `setHdrEnabled` **and** `engineHdrCapabilityChanged`, computes
`hdrCapable && enabled ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat()` from
the store, and hands it over. Both triggers matter: capability can change without the
setting changing (spec D2).

- [x] Read `watchFlowReseedSaga.ts` and `ReconcileEffects.ts` and match their shape,
      including how the engine registers the closure after construction.
- [x] Add the test `the saga asks for rgba16float when the toggle turns on with a capable display`
      — assert the `applySwapFormat` spy on a stub `ReconcileEffects`.
- [x] Add the test `losing display capability while enabled asks for the preferred format`
      — the D2 interaction, and the case a naive "watch settings only" saga misses.
- [x] Add the test `applySwapFormat is a no-op when the desired format already matches` —
      the guard that keeps a repeated dispatch from rebuilding eight pipelines. Assert
      `context.configure` was not called.
- [x] Implement. Order matters: reconfigure before the rebuild, because the rebuild's
      pipelines must target the format the swap chain now has.
- [x] **Not in the plan, found during execution:** `initGpu` dispatches
      `engineHdrCapabilityChanged` (`:133`) long before it assigns `renderTargets`
      (`:179`) or `uiCtx` (`:220`), so the boot dispatch reaches `applySwapFormat` with
      both null. Guarded engine-side, with a test.
- [x] `npm test`, `npm run typecheck`, `npm run lint`.
- [x] Commit.

---

## Task 8: The frame gate

**Files:** `src/services/engine/frame/renderFrame.ts` (modify, `:96-97`),
`tests/services/engine/frame/renderFrame.test.ts` (modify).

**Contract:**

```ts
const hdrActive = hdrActiveOf(ctx.renderTargets); // task 3's helper
// …
hdrKnee:     hdrActive && settings.hdr.enabled ? settings.hdr.knee : 0,
hdrHeadroom: hdrActive && settings.hdr.enabled ? settings.hdr.headroom : 0,
```

Both conjuncts are load-bearing: the format switch and the settings write are not
simultaneous, so a frame can land between them. Headroom 0 is exactly the SDR result, so
the transitional frame is correct rather than merely safe.

- [x] Add the test `the tone-map gets zero headroom when the HDR toggle is off even on a float swap chain`
      — the case an `hdrActive`-only gate gets wrong.
- [x] Run it, watch it fail against the current one-conjunct gate.
- [x] Implement, then **mutation-verify**: revert the `settings.hdr.enabled` conjunct and
      confirm the new test fails, then restore it.
- [x] `npm test -- renderFrame`, `npm run typecheck`.
- [x] Commit.

---

## Task 9: The Settings → Display HDR section

**Files:** `src/components/SettingsPanel/CollapsibleSection.tsx`,
`src/components/SettingsPanel/SettingsPanel.module.css` (or the section's own module —
check which owns the header styles),
`src/components/SettingsPanel/DisplaySection.tsx`,
`src/components/containers/DisplaySectionContainer.tsx`,
`tests/components/SettingsPanel/{CollapsibleSection,DisplaySection}.test.ts` (modify).

**Read `.claude/skills/create-component/SKILL.md` first.**

`CollapsibleSection` gains two props (it currently has `headerToggle` and
`headerToggleIndeterminate` but nothing for a disabled state):

```ts
readonly disabled?: boolean;
readonly disabledHint?: string;
```

When `disabled`, the header toggle is non-interactive and the hint is announced —
`aria-disabled` plus a `title`, not a visual-only grey. `DisplaySection`'s HDR section
(currently `:220-246`, no header toggle) becomes:

```tsx
<CollapsibleSection
  title="HDR"
  headerToggle={hdrEnabled}
  onHeaderToggleChange={onHdrEnabledChange}
  disabled={!hdrCapable}
  disabledHint="Needs a display with HDR range"
>
```

Knee and headroom `Slider` rows keep their current ranges and formats. `DisplaySection`'s
prop list is already wide (>8 fields), so keep the body-destructure form it uses.

- [x] Add the test `a disabled CollapsibleSection does not fire its header toggle on click`.
- [x] Add the test `DisplaySection toggles hdrEnabled via the HDR header toggle` —
      `fireEvent.click` on `/toggle hdr/i`, not `.change` (the controlled-checkbox gotcha
      the bloom test at `DisplaySection.test.ts:159-168` documents).
- [x] Update the HDR-section comment at `DisplaySection.tsx:217-219`, which says the
      knobs are inert and shown regardless because the panel cannot know the format.
      That is exactly what this task fixes.
- [x] Container: add the `hdrEnabled` / `hdrCapable` selectors and the
      `onHdrEnabledChange` handler as `useCallback(..., [dispatch])`.
- [x] Per the light-tests-for-UI convention, no restyle tests beyond the two above.
- [x] `npm test -- SettingsPanel`, `npm run typecheck`, `npm run lint`.
- [x] Commit.

---

## Task 10: Review gate — entanglement-radar, then hand back for the visual pass

**Files:** none for the radar (review only — house convention: bake it into every plan).
`docs/` only if the radar surfaces something worth recording.

- [x] Run the `entanglement-radar` skill over the whole diff (`git diff main...HEAD`).
      Pay attention to whether `hdrCapable` and `hdrActive` stayed separate — re-fusing
      them is the specific regression this design exists to prevent. — the split holds;
      the radar's one finding was `GpuContext.hdrCapable` surviving as a reader-less
      boot snapshot, left open as a follow-up (it contradicts task 3's text).
- [x] Confirm the three deleted booleans have no survivors: grep `\.hdr\b` across `src/`.
- [x] `npm test` full suite, `npm run typecheck`, `npm run lint`, `npm run build`.
- [x] Retitle PR #497 off "spike(hdr): …" and rewrite its body to describe the shipped
      feature: the toggle, the prep sequence, and the probe evidence for the runtime
      reconfigure.
- [x] Push and **stop.** The remaining verification needs an HDR display and a human —
      hand back the spec's Verification checklist rather than claiming it. Do not run
      `/feature-done` until the user confirms the visual pass. — confirmed 2026-07-31.
