# Dissolve `RenderFrameSettings`: passes read from `state` + `ctx` (design)

> **Status:** approved design, awaiting implementation plan. **Why this exists:**
> `RenderFrameSettings` is a per-frame struct assembled in `runFrame.ts:352-379` and
> threaded through every render pass as a `settings` parameter. It is named for
> settings but carries **four different provenances** — renamed user settings, the
> selection slice, two per-frame-derived values, and two module constants — fused
> into one bag. That is the value/place + provenance knot
> [`simplicity.md`](../conventions/simplicity.md) §3/§5 exists to remove: a reader
> can't tell from `settings.x` whether `x` is a user toggle, derived this frame, or a
> compile-time constant, and the settings paths are re-spelled here a second time
> (the selectors are the first). It is also a **half-finished migration**:
> `RenderFrameInput.d.ts:9-17` records that D.2 plumbed `state: EngineState` into
> `Pass.draw` *specifically* so passes could "read engine-side data ... without a
> `RenderFrameSettings` field for every consumer" — then the passes never moved off
> the bag. This finishes that migration and deletes the bag.

## The decision in one line

Delete `RenderFrameSettings` and drop the `settings` parameter from `Pass.enabled` /
`Pass.draw` and the four `encode*` functions. Each value flows from its **real
source**: user settings read directly off `state.settings.<path>`, selection off
`state.selection.select`, the two genuinely per-frame-derived values
(`visibleSourceMask`, `focus`) off `ctx`, and the two fade thresholds from the
module constant that already owns them.

### Why dissolve rather than tidy

The bag's 16 fields sort cleanly by where they are *actually* reachable, and 14 of 16
are already in scope at every consumer:

| Provenance | Count | Real home |
|---|---|---|
| User setting (`pointSizePx`, `biasMode`, `exposure`, …) | 12 | `state.settings.<path>` — passes already receive `state` |
| Selection (`selected`) | 1 | `state.selection.select` |
| Compile-time constant (`pxFadeStartPoints/EndPoints`) | 2 | `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` (their existing owner) |
| Per-frame derived (`visibleSourceMask`, `focus`) | 2 | `ctx` (the per-frame derived snapshot) |

Only the last row needs a new wire. Everything else is *already present* at the
consumer and merely re-bagged. Two passes prove the target shape already works:
`flowFieldPass` reads `state.settings.flow` directly (`flowFieldPass.ts:44,61`) and
`diskRadiusRingPass` reads `state.settings.debug` + `state.selection` directly
(`diskRadiusRingPass.ts:44-46`) — neither consults the bag.

### Why the two derived values belong on `ctx`

`ReadyFrameContext` is *defined* as "the per-frame derived snapshot" and its docblock
invites exactly this: "Adding a new derived per-frame quantity ... becomes a one-line
addition here." (`ctx` also re-exposes four `state.gpu.*`/`state.subsystems.*` handles
in non-null narrowed form — a deliberate, documented TS-ergonomics trade-off,
`frameContext.ts:57-72` — but the two new fields join the *genuinely-derived* half,
alongside `vp`/`drawCamPos`/`focusBlend`, which live nowhere but `ctx`.) Both values
are produced in `runFrame` around `ctx` construction:

- **`visibleSourceMask`** ← `deriveSourceMasks(state).draw`, computed at
  `runFrame.ts:99` — *before* `ctx` is built (`:240`). So it is passed **into**
  `deriveFrameContext` and set at construction (no post-hoc mutation).
- **`focus`** (`FocusUniformsValue`) ← `produceFocusUniforms(nowMs)` at
  `runFrame.ts:272` — *after* `ctx` is built, and `ctx.focusBlend` is **already** set
  by mutation at `:273` from that same value. The full uniform is set at the **same
  line**, so no new mutation point is introduced — `ctx.focus = focusUniforms`
  alongside the existing `ctx.focusBlend = focusUniforms.blend`.

This keeps the once-per-frame tick guarantee for the focus controller (still exactly
one `produceFocusUniforms` call) and the single-source-of-truth derivation for the
masks (still `deriveSourceMasks`, no mirror).

## Scope

**In scope:**

- **Delete** `src/@types/engine/frame/RenderFrameSettings.d.ts`.
- **`Pass` contract** (`Pass.d.ts`): `enabled(state, ctx)` and
  `draw(pass, ctx, state, deps)` — the `settings` parameter removed.
- **`ReadyFrameContext`** (`ReadyFrameContext.d.ts`) gains `visibleSourceMask: number`
  and `focus: FocusUniformsValue`. `deriveFrameContext` takes `visibleSourceMask` as
  an argument; `runFrame` sets `ctx.focus` at the existing `:273` site.
- **`RenderFrameInput`** drops its `settings: RenderFrameSettings` field. `focus` is
  no longer a separate concern (rides `ctx`); `exposure`/`toneMapCurve` are read off
  `state.settings.tonemap` inside `renderFrame`.
- **The four `encode*` functions** (`encodeHdrSingle`, `encodeHdrSplit`,
  `encodeUiOverlay`, `encodeVolumePrepass`) drop the `settings` param and read off
  `state` directly (`encodeVolumePrepass` reads `state.settings.volumes.enabled`).
- **14 pass implementations** updated to the new signature; the ~7 that read settings
  re-source per the field-mapping table (see the implementation plan's surface map,
  derived from this spec).
- **`pointSpritesPass`** — the heaviest consumer — rebuilds its `PointDrawSettings`
  object from `state.settings` + `ctx` + `state.selection` + the imported constants.
- **`runFrame.ts`** assembly: the `settings: { … }` literal is removed; `masks.draw`
  flows into `deriveFrameContext`; `focusUniforms` is set on `ctx`.
- **Dead `catalogs` / `famousMeta` fields removed** from `RenderFrameInput.d.ts`
  (`:104-106`), `PassDeps.d.ts` (`catalogs`, `famousMeta`), and the `renderFrame`
  `deps` assembly (`:125-126`) + `runFrame` input assembly (`:380-381`). These are
  **vestigial**: no pass or `encode*` reads `deps.catalogs` / `deps.famousMeta`, and
  the thumbnail subsystem — the field's claimed consumer per the stale `PassDeps`
  docblock — actually reads `state.data.galaxies.catalogs` / `.famousMeta` **directly**
  at `runFrame.ts:303-308`. Pure deletion; no consumer is re-pointed.
- **Tests** updated to the new signatures (no settings bag constructed): the three
  high-effort fixtures (`renderFrame.test.ts`, `renderFrame.timing.test.ts`,
  `passes.test.ts`) plus the per-pass tests; the fixtures that set `catalogs` /
  `famousMeta` on the render input drop those keys.

**Out of scope (explicitly):**

- **The slice-typed-selector / `useSettings` unification.** Whether engine reads go
  through `selectX(state.settings)` vs raw `state.settings.<path>` is an orthogonal
  decision; this spec uses **raw paths**, consistent with the ~47 existing engine
  read sites and the two passes that already do so. The selector question can be
  taken or left later without touching this work.
- **The `labels.declutterEnabled` feature.** That is the *next* PR and the first
  feature built on the clean read surface; it is not part of the dissolution.

## Contract shapes

```ts
// Pass.d.ts — settings param removed
export type Pass = {
  readonly name: string;
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  draw(pass: GPURenderPassEncoder, ctx: ReadyFrameContext, state: EngineState, deps: PassDeps): void;
};

// ReadyFrameContext.d.ts — two derived values added
export type ReadyFrameContext = {
  // … existing fields …
  /** Galaxy-catalog draw mask (deriveSourceMasks(state).draw), this frame. */
  visibleSourceMask: number;
  /** Full cluster-focus uniform value (produceFocusUniforms, ticked once/frame). */
  focus: FocusUniformsValue;
};
```

The RenderFrameSettings-field → new-source mapping (per consumer, with line numbers)
lives in the implementation plan's surface table, not here — it is mechanical and
would rot if pasted twice.

## Behaviour neutrality

This is a **pure refactor**: every value delivered to every renderer is byte-identical
to today's, only its delivery path changes. There is no settings shape change, no new
user-facing toggle, no render-order change. The existing pass `enabled`/`draw` tests
and the `renderFrame` golden/baseline tests are the safety net; they change only in
*how they supply inputs* (off `state`/`ctx` instead of a settings bag), not in *what
they assert about output*.

## Definition of Done

- `RenderFrameSettings.d.ts` deleted; `grep -rn RenderFrameSettings src tests` is
  empty.
- `Pass.enabled`/`draw` and the four `encode*` functions carry no `settings`
  parameter; no pass references a `settings` argument.
- `RenderFrameInput` and `PassDeps` carry no `catalogs` / `famousMeta` field;
  `grep -rn "catalogs\|famousMeta" src/@types/engine/frame/` shows neither.
- `npm run typecheck` clean (both `src` and `tools` tsconfigs).
- `npm test` green — full suite, no reduction in pass count, output pristine.
- Manual visual parity check on the running dev server: points, thumbnails,
  filaments, Milky Way, volume, flow, selection ring, labels, and the pick-buffer
  debug overlay all render as before (behaviour-neutral).
