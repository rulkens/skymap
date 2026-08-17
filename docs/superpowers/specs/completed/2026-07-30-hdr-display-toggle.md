# HDR display toggle

Ungate extended-range canvas output from the `?hdr` URL flag and make it a real
setting: a Bloom-shaped section in Settings → Display with a master toggle, and the
knee/headroom knobs inside it. Flipping the toggle takes effect immediately — no
reload, and nothing allocated for people who leave it off.

Supersedes the "Prerequisites for productionising the `?hdr` path" section of
[`docs/backlog/2026-07-23-hdr-brightness-rebalance.md`](../../backlog/2026-07-23-hdr-brightness-rebalance.md);
the cross-layer brightness rebalance that file mainly describes remains separate and
unstarted.

## Problem

The HDR spike (PR #497) works, but it is reachable only via `?hdr` and only on a
display that reports `(dynamic-range: high)`. Three things follow from that:

- **Nobody finds it.** A URL flag is a developer affordance. The feature it gates is
  a user-visible picture-quality choice.
- **Two knobs sit in the panel doing nothing.** `settings.tonemap.hdrKnee` and
  `hdrHeadroom` render as sliders regardless of whether the swap chain is
  extended-range, because the panel has no way to know. The section's own doc comment
  admits this (`DisplaySection.tsx:217-219`).
- **The knobs are in the wrong cluster.** They live in `settings.tonemap` beside
  `exposure` and `curve`, which apply on every frame in every mode. Knee and headroom
  apply only when the swap chain is float. A toggle governing them from a third
  cluster would leave the section reading two clusters to decide whether a third
  thing applies.

The reason it was gated in the first place was cost: `initGpu` picks the swap format
once and every pipeline targeting the swap chain bakes it, so "just turn it on" meant
either paying for a float swap chain on every capable display or forcing a reload.
That framing turned out to be a missing joint rather than a real constraint — see
Ground preparation.

## Decisions

**D1 — Default off, even on a capable display.** Capable displays get the toggle, not
the behaviour. Extended-range output changes how the whole scene reads; it should be
something the viewer chooses, not something that happens to them because they bought a
particular monitor.

**D2 — On a display that cannot show HDR, the section renders disabled**, greyed with a
short hint, rather than hidden. Hiding it makes the feature invisible to exactly the
people asking "why does this look better on my other screen?". This requires the
display-capability answer to reach the panel, which it currently does not.

**D3 — The swap format changes at runtime. No reload.** Probe-verified (see below).
The alternative — persisting the preference and reading it at boot — was designed and
rejected: it needs a localStorage layer, a boot-read seam in `buildInitialSettings`,
and a reload that lands the viewer back at Earth, because the URL hash carries `focus`,
`t` and `orientation` but no camera pose (`hashParamSources.ts:141`).

**D4 — UI shape mirrors Bloom exactly**: `CollapsibleSection` with `headerToggle` /
`onHeaderToggleChange` for the master enable, knee and headroom as `Slider` rows in the
body. Bloom already established this idiom in this very section
(`DisplaySection.tsx:185-215`), so HDR is a sibling, not a new pattern.

**D5 — `hdrKnee`/`hdrHeadroom` move into `settings.hdr` as `knee`/`headroom`**, so the
cluster and the section that renders it are the same thing.

**D6 — Prep and feature both land on PR #497**, as separate commits in sequence. The
PR's title and body get rewritten from "spike(hdr): …" to the shipped feature.

### Probe: the runtime format switch is legal

Run against Playwright's `chromium` channel on a live canvas, reconfiguring the same
`GPUCanvasContext` twice:

| step                                            | result                                               |
| ----------------------------------------------- | ---------------------------------------------------- |
| `configure(bgra8unorm)`                         | ok — `getCurrentTexture().format` = `bgra8unorm`     |
| `configure(rgba16float + toneMapping extended)` | ok — `getCurrentTexture().format` = `rgba16float`    |
| draw into the float swap texture                | ok                                                   |
| **stale 8-bit pipeline vs float swap texture**  | **validation error** (attachment state incompatible) |
| pipeline rebuilt for `rgba16float`              | ok                                                   |
| `configure(bgra8unorm)` again                   | ok — format follows back down                        |
| pipeline rebuilt for `bgra8unorm`               | ok                                                   |

Reconfiguring needs no teardown, `toneMapping` is accepted on the reconfigure, and both
directions work. The stale-pipeline row is the load-bearing one: it is why the renderer
rebuild in Ground preparation is required rather than speculative.

Incidental: headless Chromium reports `(dynamic-range: high)` as **false**, so
`npm run perf` cannot exercise the HDR path without temporarily forcing the format.
That closes the "unmeasured" prerequisite — under this design nothing is paid unless
the toggle is on, so there is no always-on cost to measure.

## Ground preparation

Ideal shape, data delta first:

```ts
// src/@types/settings/HdrSettings.d.ts — new
export type HdrSettings = {
  enabled: boolean;
  knee: number; // moved from tonemap.hdrKnee
  headroom: number; // moved from tonemap.hdrHeadroom
};

// EngineSettingsState — tonemap sheds two fields, gains a sibling cluster
type EngineSettingsState = {
  tonemap: { exposure: number; curve: ToneMapCurveT };
  hdr: HdrSettings;
  // …everything else unchanged
};

// GpuContext — one meaning per field, replacing one boolean that meant three things
type GpuContext = {
  format: GPUTextureFormat; // 'rgba16float' ⇒ extended-range ACTIVE
  hdrCapable: boolean; // the display's (dynamic-range: high) answer
  // …device, context, canvas unchanged; the `hdr` boolean is gone
};
```

### Missing joints

**J1 — the swap-format renderers are built inline in `initGpu`, so there is no seam to
re-run.** Eight construction sites across six factories bake the swap format:
`labelRenderer` (`initGpu.ts:234`), `markerLineRenderer` (:237), `debugLineRenderer`
(:246), `selectionRingRenderer` (:253), `pickDebugOverlay` (:459), `diskRadiusRing`
(:467), `foregroundLabelRenderer` (:594), `foregroundMarkerLineRenderer` (:619).
Verdict: **bolt-on** — without the seam the feature has to force a reload. Everything a
rebuild needs is already true of these renderers: nullable handles on `state.gpu`
(`engine.ts:300-342`), a `destroy()` each (`engine.ts:830-867`), read fresh from
`state.gpu` by every layer every frame (`labelsLayer.ts:51`, `selectionRingLayer.ts:51`,
`diskRadiusRingLayer.ts:48`), and per-frame re-upload of all their data
(`runFrame.ts:553`) so nothing is lost. The single retained reference outside
`state.gpu` is the label director's two closure slots
(`labelDirectorSubsystem.ts:129,142`), which `attachRenderers` re-seats.

**J2 — the swap row's format is fixed at target-table construction.**
`createRenderTargets(device, format, …)` (`initGpu.ts:174`) builds the spec table, and
the `swap` row records the format (`renderTargets.ts:183`). Verdict: **bolt-on**, but a
small one — the swap row has no texture (`renderTargets.ts:85-91`), so the fix is a
one-field setter, not a table rebuild.

**J3 — `hdr` is one boolean carrying three fused facts, mirrored three times.**
`GpuContext.hdr` (`GpuContext.d.ts:58`), `EngineGpuHandles.hdr`
(`EngineGpuHandles.d.ts:97`), `ReadyFrameContext.hdr` (`ReadyFrameContext.d.ts:127`).
Verdict: **bolt-on**, and actively wrong once the format is mutable: all three are boot
snapshots that go stale on the first toggle. Adding a fourth `hdrCapable` boolean
alongside them would be the second special case.

**J4 — knee/headroom in the wrong cluster.** Verdict: **bolt-on** (see D5).

Everything else is growth: the reducer sits beside `setHdrKnee`
(`settingsSlice.ts:135`), the selectors beside `selectHdrKnee` (`selectors.ts:121`), the
UI is a second `CollapsibleSection` with a header toggle, and the frame gate is one
extra conjunct in an existing ternary.

### Prep list

Each its own commit, in this order, before any feature commit. All on PR #497 (D6).

1. **Extract `buildSwapRenderers(state, format)`** out of `initGpu` — the eight
   construction sites plus the label-director re-attach — and retain `fontAtlases` on
   `state.gpu` so a rebuild can re-run it. Behaviour-neutral: `initGpu` calls it once,
   exactly where the inline code stood.
2. **Add `renderTargets.setSwapFormat(next)`** — patches the one `swap` spec row.
3. **Split `GpuContext.hdr`** into carried `hdrCapable` plus `hdrActive` derived from
   `format === 'rgba16float'`; delete the `EngineGpuHandles` / `ReadyFrameContext`
   mirrors.
4. **Move `hdrKnee`/`hdrHeadroom`** → `settings.hdr.knee`/`.headroom`. The GPU-facing
   `ToneMap` struct keeps its `hdrKnee`/`hdrHeadroom` field names — it is a flat uniform,
   not a settings cluster.

Prep 1 is a lifecycle extraction, not a lifecycle move: the call stays at the same point
in `initGpu`'s sequence, so the invariants held by call order are untouched. Verify that
claim explicitly rather than assuming it — the renderers are constructed between the
point renderer and the galaxy-catalog loop, and the director attach follows immediately.

### Adjacent findings

Not required by this feature; backlog unless promoted.

- **Post-tone-map overlay headroom policy.** Labels and marker lines draw at white over
  a scene that can exceed it, so a caption over a bright star reads dim. Carries forward
  from the prerequisite list.
- **Non-Chrome behaviour unverified.** Other implementations will ignore the unknown
  `toneMapping` dict member and hand back a float swap chain that still clamps at 1.0 —
  the toggle would then do nothing visible. Check Safari rather than assume. Carries
  forward.
- **Stale comment**: `defaults.ts:460` claims the volume palette is "persisted to
  localStorage by the App shell". Nothing persists it; only the splash key exists.

## Design

### 1. Settings shape

`settings.hdr = { enabled, knee, headroom }`, seeded from `DEFAULT_HDR_ENABLED = false`
plus the existing `DEFAULT_HDR_KNEE` / `DEFAULT_HDR_HEADROOM`. Session-only, like every
other settings field — deliberately not persisted, which is what keeps the offline
harnesses (`tools/record`, `tools/site/makeOgImage`) on the SDR path with no special
casing: they boot with the default and never flip it.

Three reducers (`setHdrEnabled`, `setHdrKnee`, `setHdrHeadroom`) and three selectors,
each beside its existing sibling.

### 2. Capability versus activation

Two facts, never fused:

- **`hdrCapable`** — `matchMedia('(dynamic-range: high)').matches`, read in `initGpu`
  and carried on `GpuContext`. Status, not settings: it describes the hardware, not a
  choice, so it reaches the store as a field on the engine slice
  (`state/engine/engineSlice.ts`, beside `scale` and `sourceCounts`) via a
  `engineHdrCapabilityChanged` action, with a selector the container reads. Same split the
  singleton overlay layers use — the user's choice in `settings.<layer>`, the
  status-only fact in the store.
- **`hdrActive`** — `format === 'rgba16float'`, derived wherever it is needed. Never
  stored, because the format is now mutable.

The capability is live, not a boot snapshot: a `change` listener on the media query
updates it, so moving the window to an SDR monitor greys the section out and drops the
swap chain back to the preferred format. `useIsMobile.ts:43-45` is the listener pattern.

### 3. The switch

One function, called when `settings.hdr.enabled` or `hdrCapable` changes such that the
desired format differs from the live one:

```ts
function setSwapFormat(state, next: GPUTextureFormat): void {
  context.configure({
    device,
    format: next,
    alphaMode: 'premultiplied',
    ...(next === 'rgba16float' ? { toneMapping: { mode: 'extended' } } : {}),
  });
  state.gpu.renderTargets.setSwapFormat(next);
  buildSwapRenderers(state, next); // destroys the old eight, re-attaches the director
}
```

Desired format is `hdrCapable && settings.hdr.enabled ? 'rgba16float' : getPreferredCanvasFormat()`.
The compositor needs no attention: it takes `dstFormat` per draw and keys its pipeline
cache `${blend}:${dstFormat}` (`compositor.ts:247`), resolved from the swap row this
function just updated.

Cost is six shader-module compiles and eight pipeline creations — one hitched frame at
the moment of the click, nothing on any other frame. `toneMapping` also loses its `any`
cast here, in favour of an ambient widening of `GPUCanvasConfiguration` per the
`tools/vendor-types/` precedent.

Driven reactively, by the house pattern rather than by a new imperative entry point: a
saga in `src/store/effects/` watches `setHdrEnabled` and the capability action, computes
the desired format from the store, and reaches the engine through the `ReconcileEffects`
closure — the same `getContext('reconcile')` route `watchFlowReseedSaga` uses to keep the
store layer free of engine imports. That does mean one new `ReconcileEffects` method
(`applySwapFormat`); the alternative, letting the store layer hold a GPU handle, is worse.
The desired-vs-live comparison lives engine-side, because only the engine can see the
live format.

### 4. The frame gate

```ts
hdrKnee:     hdrActive && settings.hdr.enabled ? settings.hdr.knee : 0,
hdrHeadroom: hdrActive && settings.hdr.enabled ? settings.hdr.headroom : 0,
```

Both conjuncts are load-bearing and independent: `hdrActive` can lag `enabled` by a
frame if a settings change and a frame race, and zero headroom is exactly the SDR result
— the tone curve's own output, nothing added — so the transitional frame is correct
rather than merely safe.

### 5. UI

```tsx
<CollapsibleSection
  title="HDR"
  headerToggle={hdrEnabled}
  onHeaderToggleChange={onHdrEnabledChange}
  disabled={!hdrCapable}
  disabledHint="Needs a display with HDR range"
>
  <Slider label="Knee" … />
  <Slider label="Headroom" … />
</CollapsibleSection>
```

`disabled` / `disabledHint` are new to `CollapsibleSection` — no existing section needs
them, so they land as part of this feature rather than as prep. `DisplaySectionContainer`
gains the `hdrEnabled` / `hdrCapable` reads and the `onHdrEnabledChange` handler.

## Testing

Reducer/selector coverage for `setHdrEnabled` follows the existing bloom-enabled tests.
Beyond that, four tests that can actually fail on a real bug:

1. **The frame gate zeroes both knobs when the toggle is off** even on a float swap
   chain — the case a naive `hdrActive`-only gate would get wrong. Extends the existing
   `renderFrame.test.ts` tone assertions.
2. **The desired-format derivation**: capability × enabled → format, as a pure function,
   including the "capable but disabled" cell that is the whole point of D1.
3. **`buildSwapRenderers` re-attaches the label director.** A rebuild that leaves the
   director pointing at destroyed renderers is silent until labels vanish, so assert the
   attach happens with the new instances.
4. **`setSwapFormat` updates the swap row** so the compositor's per-draw `dstFormat`
   follows. Guards the one link that would otherwise fail as a validation error at draw
   time.

No test for "reconfigure is legal" — that is a browser guarantee, established by the
probe, and a unit test would only re-assert a mock.

## Verification

Needs an HDR display; not reachable from the harness (see the probe note).

- Toggle on: highlights above the knee push past paper white, everything else unchanged.
- Toggle off: output returns to exactly the SDR image, no hitch beyond one frame.
- Toggle repeatedly: no leak, no validation errors in the console, labels and marker
  lines still draw after each rebuild (they are the renderers being recreated).
- On an SDR display: the section renders disabled with its hint, and the swap chain
  stays at the preferred format.
- Drag the window between an HDR and an SDR monitor with the toggle on: the section's
  enabled state follows and the format follows with it.
- `tools/record` and `makeOgImage` still produce SDR output.

## Out of scope

- **The cross-layer brightness rebalance** — six brightness currencies under one static
  exposure, and scene-adaptive auto-exposure. Stays in
  `docs/backlog/2026-07-23-hdr-brightness-rebalance.md`; this spec only makes the
  existing spill controllable.
- **Overlay headroom policy** and **the Safari check** — carried forward as backlog
  (see Adjacent findings).
- **Persisting the preference across sessions.** Deliberately not done (D3); if it is
  wanted later it is a settings-wide question, not an HDR one.
