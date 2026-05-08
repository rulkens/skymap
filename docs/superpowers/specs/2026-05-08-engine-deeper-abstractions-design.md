# Engine Deeper Abstractions (Spec D)

**Date:** 2026-05-08
**Status:** Spec
**Predecessors:**
- [Engine ↔ Renderer Boundary Tightening (Spec A)](2026-05-07-engine-renderer-boundaries-design.md) — landed 2026-05-07
- [Engine Internal Restructure (Spec B)](2026-05-08-engine-internal-restructure-design.md) — in progress
- [Services Folder Structure (Spec C)](2026-05-08-services-folder-structure-design.md) — in progress

## Goal

Specs A → B → C reduced `engine.ts` from 2377 to 1129 lines (52% reduction) and gave every file a logical folder.  What's left mangled isn't the file *layout* — that's done — it's the *abstractions* still missing inside the relocated files.  `runFrame.ts` (469 lines) re-derives the same per-frame snapshot in two places and gates every dispatch on a 5-way "is engine ready?" null-check.  `renderFrame.ts` (500 lines) is a flat sequence of inline draw blocks each with its own `if (settings.X)` gate, with no shared shape between them.  `engine.ts` (1129 lines) keeps the hover/select cluster (`setHovered`, `setSelected`, `selectionEq`, `pointInfoForSelection`) inline because nothing better exists yet.  Every "is the engine constructed yet?" site re-spells out the same five-field probe.

This spec proposes four small abstractions — each independently mergeable, each preserving observable behaviour — that take those mangled shapes and give them names: `FrameContext`, `Pass`, `selectionSubsystem`, `isEngineReady`.  When the four land, `runFrame` is ~250 lines, `renderFrame` is ~150 lines + 5 small pass files, `engine.ts` is ≤ 1000 lines, and the recurring "did the engine bootstrap finish?" question has exactly one answer site instead of ten.

This is the natural follow-on to Spec C: relocation surfaced the abstraction gaps so they can now be fixed without fighting the file structure.

## Background

### Current state — what relocation left mangled

```
engine.ts        1129 lines  (down from 2377; was 1500 in Spec B's plan)
runFrame.ts       469 lines  (Spec B carved this out; FrameContext + isEngineReady will halve it)
renderFrame.ts    500 lines  (flat sequence of 4 HDR passes + a tone-map post-process)
```

#### What `runFrame.ts` re-derives

A discovery walk through `runFrame.ts` finds **22 references to closure snapshots** (`camRef`, `rendererRef`, `thumbnailsRef`, `postProcessRef`) created at the top of the function body, then a 5-way null-check that bails the frame if any of them is unset:

```ts
const camRef = state.cam;
// …
const vp = camRef ? computeViewProj(camRef) : null;
const rendererRef = state.gpu.renderer;
const thumbnailsRef = state.subsystems.thumbnails;
const postProcessRef = state.gpu.postProcess;
if (!vp || !rendererRef || !camRef || !thumbnailsRef || !postProcessRef) {
  state.subsystems.scheduler.requestRender();
  return;
}
```

After the gate, the function passes 14 fields to `renderFrame()` — including `cam`, `viewProj`, and `canvasWidth/Height` — and `renderFrame()` then **re-derives the same camera-ish quantities** (`drawPxPerRad`, `drawCamPos`) at the top of *its* body before forwarding them to two callees (`pointRenderer.draw` and `thumbnails.runFrame`).  The work is duplicated because there's no named place to put "the per-frame view onto the world", so each file builds its own ad-hoc one.

#### What `renderFrame.ts` looks like

Five distinct draw blocks (verified against the current file), each with its own enable-gate:

| # | Block | Lines | Enable expression | Draw call |
|---|-------|-------|-------------------|-----------|
| 1 | Point sprites | 344–370 | always | `pointRenderer.draw(pass, viewProj, viewport, …17 args)` |
| 2 | Thumbnails | 382–397 | `settings.galaxyTexturesEnabled` | `thumbnails.runFrame({ cam, clouds, … })` |
| 3 | Filaments | 421–432 | `settings.filamentsEnabled && filamentRenderer` | `filamentRenderer.draw(pass, viewProj, viewport, 1.5, intensity)` |
| 4 | Milky Way | 451–469 | `settings.milkyWayEnabled && fadeAlpha > 0` | `milkyWayRenderer.draw(pass, viewProj, viewport, fadeAlpha, iTime, camPos)` |
| 5 | Tone-map | 491–496 | always | `postProcess.draw(encoder, swapView, exposure, curve)` |

Blocks 1–4 share the HDR `pass`; block 5 runs *after* `pass.end()` and operates on the encoder directly because it samples the texture the HDR pass wrote.  No shared shape: each block reads ad-hoc fields off `input` and decides for itself whether to draw.  Adding a sixth block means scrolling 500 lines to figure out where in the sequence it fits.

#### What `engine.ts` keeps that doesn't belong there

A grep for selection-related references in `engine.ts` finds **15 hits** across 5 helpers: `setHovered`, `setSelected`, `selectionEq`, `pointInfoForSelection`, plus 5 sites mutating `state.picking.{hovered,selected}` directly.  These were inline in the pre-Spec-B engine and stayed inline because the closure-returning subsystem pattern hadn't been generalised yet.  Spec B's `tweenManager` and `thumbnailSubsystem` proved the pattern; Spec D extracts the next obvious member.

(Note: `lastClickedInfo` *was* in `engine.ts` pre-Spec-B; Spec B's `wireInput` phase already pulled it into a closure local in `phases/wireInput.ts:269`, so the prompt's mention of it is one step behind — it's not part of Spec D's selection extraction.)

#### What "is engine ready?" looks like today

A grep for null-checks against the bootstrap-late state fields (`state.cam`, `state.gpu.renderer`, `state.gpu.postProcess`, `state.gpu.pickRenderer`, `state.gpu.filamentRenderer`, `state.subsystems.thumbnails`, `state.subsystems.clickResolver`, `state.subsystems.inputBindings`, `state.subsystems.loadProgress`) finds **13 distinct sites** across 5 files:

| File | Sites |
|------|-------|
| `engine.ts` | 6  (lines 540, 640, 651, 657, 663, 669 — the `destroy()` cluster + the `updateScaleBar` cam-null guard) |
| `runFrame.ts` | 5  (lines 198, 255, 264–265, 464–467 — postProcess resize, autoRotate gate, 5-way frame gate, still-animating predicate) |
| `wiring/pointSourceRegistry.ts` | 1  (line 252 — the commit subscriber's renderer guard) |
| `phases/wireSlots.ts` | 1  (line 130 — the filament commit guard) |

Some are legitimately about teardown order (`destroy()`'s symmetric nulling), but the **frame-side and slot-commit-side checks all ask the same question**: "has the bootstrap completed?".  Each site re-spells out a slightly different subset of fields.  When a future renderer joins the bag (e.g. a label renderer from MSDF labels), every "is engine ready?" site needs to be hand-updated to include it.  A single typed predicate consolidates 7+ of those sites and makes the type-narrowing a TypeScript guarantee instead of a folkloric conviction.

### Why this is the next pass after Spec B / C

Spec B moved code; Spec C moved files.  Neither could rewrite the *shape* of the moved code without conflating two reviewable concerns into one PR.  Now that everything is in its right folder, the abstraction gaps are visible:

- `runFrame` and `renderFrame` are siblings in `frame/` that re-derive the same camera/viewport snapshot — the seam between them needs a shared type.
- `renderFrame` is a sequence of independent draw blocks with no naming convention — each block wants to be its own file.
- `engine.ts` keeps the selection cluster inline because the prior factories (`tweenManager`, `thumbnailSubsystem`) are siblings of a not-yet-existing `selectionSubsystem`.
- The repeated "is engine ready?" probe is a cross-file pattern that needs one type-narrowing predicate, not ten ad-hoc checks.

The four migrations are:

1. **`FrameContext`** — derive once per frame, consume everywhere.
2. **`Pass` abstraction** — formalise each draw block in `renderFrame.ts`.
3. **`selectionSubsystem`** — extract the hover/select cluster into a sibling of `tweenManager`/`thumbnailSubsystem`.
4. **`isEngineReady` predicate** — one TypeScript discriminated narrowing for "post-bootstrap" checks.

Each is small.  Each preserves observable behaviour.  Each has at least one regression test for the contract being relocated.

## Architecture

### D.1 — `FrameContext`

#### What it is

A typed snapshot of "what the world looks like this frame", derived once at the top of `runFrame()` and forwarded as a single struct to `renderFrame()`.  Lives in `services/engine/frame/frameContext.ts` (new file beside `runFrame.ts`).

```ts
// frameContext.ts
import type { mat4 } from 'gl-matrix';
import type { OrbitCamera } from '../../../@types';

/** The not-yet-ready case: bootstrap hasn't finished. */
export type NotReadyFrameContext = { isReady: false };

/** The ready case: every per-frame derived value is non-null. */
export type ReadyFrameContext = {
  isReady: true;
  /** Live camera reference. */
  cam: OrbitCamera;
  /** Combined view-projection matrix, computed once per frame. */
  vp: mat4;
  /** Backing-store-pixel viewport size; same as `canvas.{width,height}`. */
  canvasSize: { width: number; height: number };
  /** Snapshot of `cam.position` as a readonly tuple (no live Float32Array aliasing). */
  drawCamPos: Readonly<[number, number, number]>;
  /** `canvasSize.height / (2·tan(fovY/2))` — pinhole rad→px conversion. */
  drawPxPerRad: number;
  /** `performance.now()`-shaped wall-clock for the frame. */
  nowMs: number;
};

/** Discriminated union — narrow to ReadyFrameContext via `ctx.isReady`. */
export type FrameContext = ReadyFrameContext | NotReadyFrameContext;
```

The derivation function:

```ts
export function deriveFrameContext(
  state: EngineState,
  canvasSize: { width: number; height: number },
  nowMs: number,
): FrameContext;
```

The function checks `state.cam`, computes `vp = computeViewProj(cam)`, snapshots `cam.position`, computes `drawPxPerRad`, and returns either the `{ isReady: true, ... }` shape or `{ isReady: false }` if the camera isn't ready yet.

#### How `runFrame` consumes it

```ts
const ctx = deriveFrameContext(
  state,
  { width: deps.canvas.width, height: deps.canvas.height },
  nowMs,
);
if (!ctx.isReady) {
  state.subsystems.scheduler.requestRender();
  return;
}
// `ctx` is now narrowed to ReadyFrameContext — `ctx.cam`, `ctx.vp`, etc. are all non-null.
```

The remainder of `runFrame` reads `ctx.cam`, `ctx.vp`, `ctx.drawCamPos`, `ctx.drawPxPerRad` instead of the closure-snapshot locals.  `renderFrame()` takes `ctx` as one of its inputs and stops re-deriving `drawPxPerRad` and `drawCamPos`.

#### Why this earns its place

- **Eliminates the duplicated derivation.**  `drawPxPerRad` and `drawCamPos` are computed in `renderFrame.ts:286–297` today; with `FrameContext` they exist exactly once per frame.
- **Replaces the 5-way null-check with one discriminated narrowing.**  `if (!ctx.isReady) return;` does what the current `if (!vp || !rendererRef || !camRef || !thumbnailsRef || !postProcessRef)` does, but the type system enforces it — every read against `ctx.cam` past that check is type-safe.
- **Gives downstream code a stable contract.**  When a future Pass (D.2) needs to know "where is the camera?" it reads `ctx.drawCamPos`, not `state.cam!.position`.  Adding a new derived per-frame quantity (e.g. `frustumPlanes` for culling) is a one-line addition to `ReadyFrameContext` instead of 4–5 closure snapshots scattered across two files.

#### Alternatives considered

- **Keep the closure snapshots, just collapse them to a struct literal.**  Half the win — the duplicated work between `runFrame` and `renderFrame` would still happen, because the literal is local to one file.  Rejected: cross-file reuse is half the point.
- **Promote `ctx` to `state.frameContext`.**  Tempting (every frame already mutates `state.*` anyway), but `EngineState` is documented as the *runtime-mutable* shape, and a per-frame derived view doesn't fit that role.  Rejected: keeps `EngineState` honest as "things the engine owns across frames", not "things the engine recomputes every frame".
- **Skip the discriminated union; use `FrameContext | null`.**  Loses the named "isReady" boolean which makes the intent obvious at every read site.  Rejected: a tagged union reads better for one extra field.

### D.2 — `Pass` abstraction

#### What it is

A formal interface that every draw block in `renderFrame` conforms to, plus a `PASSES` array that `renderFrame` iterates over.  Each pass lives in its own file under `services/engine/frame/passes/` (new subfolder under `frame/`, distinct from `services/gpu/passes/` which holds `postProcess.ts` — the gpu folder is about *GPU-pass implementation*, this folder is about *per-frame draw orchestration*).

```ts
// services/engine/frame/passes/Pass.ts (the type)
import type { ReadyFrameContext } from '../frameContext';
import type { EngineState } from '../../../../@types';
import type { RenderFrameSettings } from '../renderFrame';

export type Pass = {
  /** Stable identifier for debugging and test assertions. */
  name: string;
  /**
   * Whether this pass should draw this frame.  Reads from the
   * narrowed-ready frame context plus the engine state plus settings.
   * Pure: no side effects.
   */
  enabled(state: EngineState, ctx: ReadyFrameContext, settings: RenderFrameSettings): boolean;
  /**
   * Record draw commands into the supplied HDR render pass.  Called
   * only when `enabled()` returned true.  Pre-condition: `pass` is
   * the live HDR `GPURenderPassEncoder`; the function must not call
   * `pass.end()`.
   */
  draw(
    pass: GPURenderPassEncoder,
    state: EngineState,
    ctx: ReadyFrameContext,
    settings: RenderFrameSettings,
    deps: PassDeps,
  ): void;
};

/** Renderer + GPU handles every pass might need. */
export type PassDeps = {
  pointRenderer: PointRenderer;
  thumbnails: ThumbnailSubsystem;
  quadRenderer: QuadRenderer;
  diskRenderer: DiskRenderer;
  filamentRenderer: FilamentRenderer | null;
  milkyWayRenderer: MilkyWayRenderer;
  // …per-pass-specific extras stay in the per-pass file's closure if needed
};
```

#### The five passes

Verified against the current `renderFrame.ts`.  Each becomes one file under `services/engine/frame/passes/`:

| File | Name | Enable | Notes |
|------|------|--------|-------|
| `pointSpritesPass.ts` | `'point-sprites'` | `() => true` | Always-on; the headline draw.  17-arg call to `pointRenderer.draw` collapsed inside this file. |
| `thumbnailsPass.ts` | `'thumbnails'` | `(_, _, s) => s.galaxyTexturesEnabled` | Forwards `clouds`, `famousMeta`, `famousXrefs` to `thumbnails.runFrame`. |
| `filamentsPass.ts` | `'filaments'` | `(_, _, s) => s.filamentsEnabled` (additionally drops out if `filamentRenderer === null`) | Renderer null is treated as "disabled" — the filament `.bin` is optional. |
| `milkyWayPass.ts` | `'milky-way'` | `(_, ctx, s) => s.milkyWayEnabled && milkyWayFadeAlpha(hypot(ctx.drawCamPos)) > 0` | The fade-alpha computation moves into `enabled()` so the pass disables cleanly when the camera is far away. |

```ts
// services/engine/frame/passes/index.ts (new — exports the array)
export const PASSES: readonly Pass[] = [
  pointSpritesPass,
  thumbnailsPass,
  filamentsPass,
  milkyWayPass,
];
```

The order matches the current draw order in `renderFrame.ts` exactly.  Each entry is a const object literal exported from its file (no factory function — passes are stateless across frames).

#### How `renderFrame` consumes the array

```ts
// renderFrame.ts (post-D.2)
const pass = encoder.beginRenderPass({ colorAttachments: [{ view: postProcess.view, … }] });
for (const p of PASSES) {
  if (p.enabled(state, ctx, settings)) {
    p.draw(pass, state, ctx, settings, passDeps);
  }
}
pass.end();

// Tone-map post-process — runs OUTSIDE the HDR pass.
postProcess.draw(encoder, context.getCurrentTexture().createView(), settings.exposure, settings.toneMapCurve);

device.queue.submit([encoder.finish()]);
```

#### The tone-map special case

The 5th draw block in today's `renderFrame.ts` — the tone-map post-process — is structurally different from the other four: it samples the HDR target the other four wrote into and writes to the swap chain, so it begins its own internal render pass on the same encoder *after* `pass.end()`.  Modelling it as a `Pass` would force an awkward signature (different first arg: encoder instead of pass-encoder) or a divergent "post" interface.

**Decision: inline tone-map after the loop.**  The `for (const p of PASSES)` covers the four HDR passes; the one tone-map line stays inline at the bottom of `renderFrame()`.  Reasoning:

- Tone-map runs exactly once and isn't user-configurable in the way the four HDR passes are (no enable/disable toggle — there's a `toneMapCurve` selector, but the *pass* always runs).
- The signature mismatch (encoder vs. pass-encoder) is real, not cosmetic — forcing `Pass` to abstract over both would either double the interface surface or hand every HDR pass a useless encoder reference.
- Future "post" passes (a likely-future bloom or DoF) would slot in next to tone-map as a separate `POST_PASSES` array if their count grows past one.  Not worth the abstraction for one file today.

The alternative — a unified `Pass` with `phase: 'hdr' | 'post'` — was considered and rejected: it bundles two unrelated decisions (HDR-pass enable gating and post-process composition) into one interface, and the latter has only one inhabitant.

#### Why this earns its place

- **Each pass becomes a one-file unit.**  A reader asking "what does the filament overlay actually draw?" opens `filamentsPass.ts` and sees ~40 lines instead of scrolling 500 lines of `renderFrame.ts` to find lines 421–432.
- **Adding a new pass is a one-file diff.**  A label-pass from MSDF-labels work creates `labelsPass.ts` and adds one entry to `PASSES`.  No edits to `renderFrame.ts`, no question of "where in the sequence does it go" beyond the array entry.
- **Enable gates become testable in isolation.**  A unit test for `filamentsPass.enabled(...)` constructs a minimal `EngineState` + settings stub and asserts the expected boolean — no GPU device, no encoder.
- **Order is one obvious place.**  Today the order is folkloric (lines in a function); after D.2 it's the array literal.  Reordering is a one-line diff with a clear semantic.

#### Why an array of objects, not a class hierarchy or a registry?

- **Class hierarchy** (`abstract class Pass`).  Imports a Java-shaped pattern this codebase otherwise avoids; the `type` aliases convention (CLAUDE.md) extends to "no classes for things that don't own state".  Passes are stateless — a `const` object literal is the right shape.
- **Registry** (`registerPass(...)`).  Trades a clear array for a module-side-effect dance and obscures the order — registry order depends on import order, which TypeScript module loading doesn't guarantee.  Rejected.
- **Plain function array** (`(state, ctx, settings) => boolean | void`).  Loses the named `enabled`/`draw` separation — a future test can't assert "this pass would have been enabled but the renderer was null" without splitting the function.  Rejected.

The `Phase` abstraction in `phases/bootstrap.ts` (Spec B) is direct prior art for the shape: a typed signature shared by N siblings, an array that orchestrates them in declared order, no inheritance.  `Pass` is the per-frame analogue of `Phase`.

### D.3 — `selectionSubsystem`

#### What it is

The hover/select cluster currently inline in `engine.ts` (lines 420–521 — `pointInfoForSelection`, `selectionEq`, `setHovered`, `setSelected`) extracted into a closure-returning factory in `services/engine/subsystems/selectionSubsystem.ts` (new file, sibling of `thumbnailSubsystem.ts` / `spaceMouseSubsystem.ts`).

```ts
// selectionSubsystem.ts
import type { Selection, EngineCallbacks, PointCloud, PointInfo } from '../../../@types';
import type { Source } from '../../../data/sources';
import type { FamousMetaEntry, FamousXrefMap } from '../../loading/fetchers/famousMetaFetcher';

export type SelectionSubsystemDeps = {
  cb: Pick<EngineCallbacks, 'onHoverChange' | 'onSelectChange'>;
  /** Live read of source clouds; closure rather than snapshot so tier swaps land. */
  clouds: () => Map<Source, PointCloud>;
  famousMeta: () => readonly FamousMetaEntry[];
  famousXrefs: () => FamousXrefMap;
};

export type SelectionSubsystem = {
  /** Update hover; idempotent on equal selection.  Fires `onHoverChange` exactly once on change. */
  setHovered(sel: Selection | null): void;
  /** Update selection; optional prebuilt info for the pre-GPU-upload race window. */
  setSelected(sel: Selection | null, prebuiltInfo?: PointInfo | null): void;
  /** Read-only access to current hover + selected. */
  current(): { hovered: Selection | null; selected: Selection | null };
  /** Build a PointInfo for a selection, or null if cloud not loaded / index OOB. */
  pointInfoFor(sel: Selection): PointInfo | null;
  /** No-op today; reserved for symmetry with sibling subsystems. */
  destroy(): void;
};

export function createSelectionSubsystem(deps: SelectionSubsystemDeps): SelectionSubsystem;
```

#### State migration

Today's `state.picking.hovered` and `state.picking.selected` are read by 5+ sites: `runFrame` (animation predicate), `renderFrame` (`settings.selected` for halo encoding), `engine.ts` clearSelection, the click handler, the public-handle selection methods.  Two options for where the truth lives post-extraction:

- **(A) Internal-only.**  The subsystem holds its own `let hovered`, `let selected` closure variables; `state.picking.hovered/selected` go away.  Every external read becomes `state.subsystems.selection.current().hovered` (or a memo).
- **(B) Subsystem owns the writes; `state.picking` mirrors them.**  The factory mutates `state.picking.hovered/selected` for backward compatibility; external reads stay the same.

**Decision: (A), internal-only.**  Reasoning:

- The point of the extraction is single-source-of-truth.  Letting `state.picking.*` mirror the internal state means two write sites — the subsystem and any future code that forgets the subsystem exists.
- The 5+ external read sites are mechanical to update (a `current()` call instead of a state read).  `runFrame`'s animation predicate reads neither `hovered` nor `selected` today (re-checking — confirmed; runFrame reads `state.picking.latestMouseCss`, not the selection itself).  So in practice the read-site count is smaller than feared.
- `EnginePickingState` survives — it still owns `latestMouseCss`, `lastPickedMouseCss`, `pickInFlight`, `pointerDown` (the per-frame pick gate state, which IS what `runFrame` reads).  Only `hovered` and `selected` move out.

#### How callers consume it

```ts
// engine.ts (post-D.3)
const selection = createSelectionSubsystem({
  cb: { onHoverChange: cb.onHoverChange, onSelectChange: cb.onSelectChange },
  clouds: () => state.sources.clouds,
  famousMeta: () => state.sources.famousMeta,
  famousXrefs: () => state.sources.famousXrefs,
});
state.subsystems.selection = selection;

// in clickHandler / public-handle:
state.subsystems.selection.setSelected({ source, localIdx });
state.subsystems.selection.setSelected({ source, localIdx }, prebuiltInfo);
```

The `onHoverChange` / `onSelectChange` callbacks fire from inside the subsystem, not from inline `engine.ts` helpers.

The public handle methods that today inline `setSelected(...)` (`focusOn`, `selectFamous`, `selectByAlias`, `clearSelection`) become `state.subsystems.selection.setSelected(...)` calls — same structural shape as `state.subsystems.tweens.start(...)` calls already do for the camera tween.

`renderFrame` reads `state.subsystems.selection.current().selected` to pack the halo uniform (or, equivalently, the engine's per-frame settings construction reads it once and passes it via `RenderFrameSettings.selected` as it does today).

#### Why this earns its place

- **Removes ~150 lines from `engine.ts`** — the four helpers (`pointInfoForSelection`, `selectionEq`, `setHovered`, `setSelected`) plus the inline state declarations they read.
- **Makes the contract testable.**  Today's `setSelected` is reachable only by spinning up a full engine; post-extraction a unit test can assert "calling setSelected → onSelectChange fires once → current().selected matches" with a stub `cb` and a single fake cloud.
- **Single source of truth for hover/select state.**  External readers that today reach into `state.picking.hovered` directly (with the per-bag types implying it's just a public field) get a typed accessor instead.  Future refactors that change selection-equality semantics (e.g. tier-aware deduping) update one file.
- **Sibling of `tweenManager` / `thumbnailSubsystem`** — Spec B and Spec C both call out the closure-returning factory pattern as the engine's preferred shape for "owns long-lived state, exposes a small imperative API".  Selection has the same shape (multi-frame state, fires callbacks on transitions, is built once at startup); pulling it into the same idiom is straight-line work.

#### Alternatives considered

- **Use a class.**  Same objection as Pass: the codebase's `type` convention extends to "factories return typed handles, not class instances".  The other subsystems already follow the closure pattern; adding a class for selection would diverge for no reason.
- **Inline forever.**  Defended by inertia, but the 150 lines aren't paying their rent in `engine.ts` — none of the helpers reference any other engine.ts-local helper (they read `state.*` and `cb.*`, both available everywhere).  Extraction has only upside.
- **Move into `state.picking` itself as methods.**  Mixes a data type with an API surface.  Rejected: `EnginePickingState` is documented as "hover / click / drag mutables", a value type — adding methods conflates concerns.

### D.4 — `isEngineReady` predicate

#### What it is

A TypeScript discriminated narrowing function used everywhere the codebase asks "has bootstrap completed?".  Lives in `services/engine/helpers/engineReady.ts` (new file in the existing `helpers/` folder).

```ts
// engineReady.ts
import type {
  EngineState,
  OrbitCamera,
} from '../../../@types';
import type { PointRenderer } from '../../gpu/renderers/pointRenderer';
import type { PostProcess } from '../../gpu/passes/postProcess';
import type { ThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
import type { createPickRenderer } from '../../gpu/renderers/pickRenderer';

/**
 * The engine after bootstrap finishes — every nullable bag field is
 * non-null.  Returned by `isEngineReady` as a narrowing target.
 */
export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    renderer: PointRenderer;
    pickRenderer: ReturnType<typeof createPickRenderer>;
    postProcess: PostProcess;
    // filamentRenderer stays optional — `filaments.bin` may be absent;
    // sites that need it null-check independently.
  };
  subsystems: EngineState['subsystems'] & {
    thumbnails: ThumbnailSubsystem;
    // selection (D.3) joins here.
  };
};

/**
 * Predicate: true iff the bootstrap has fully run.
 *
 * Use this everywhere a per-frame body, slot-commit subscriber, or
 * public-handle method needs to know "did initGpu / wireSlots
 * complete?".  Calling site:
 *
 *   if (!isEngineReady(state)) return;     // narrows `state` to ReadyEngineState
 *   state.gpu.renderer.draw(...);          // type-safe; no `!` needed
 */
export function isEngineReady(state: EngineState): state is ReadyEngineState;
```

The implementation is the canonical 5-field check today's `runFrame.ts` open-codes:

```ts
export function isEngineReady(state: EngineState): state is ReadyEngineState {
  return (
    state.cam !== null &&
    state.gpu.renderer !== null &&
    state.gpu.pickRenderer !== null &&
    state.gpu.postProcess !== null &&
    state.subsystems.thumbnails !== null
  );
}
```

Note `filamentRenderer` is deliberately excluded — its lifecycle is "constructed at GPU init, optionally populated when filaments.bin loads", and the no-bin deployment is a supported configuration.  The `filamentsPass` (D.2) gates its own draw on the renderer being non-null; nothing else in the codebase requires a populated filament renderer to call the engine "ready".

#### Where it gets used

The 7 sites today's code spells out explicit-or-implicit:

- `runFrame.ts:264–265` — the 5-way frame gate becomes `if (!isEngineReady(state)) { state.subsystems.scheduler.requestRender(); return; }`.
- `runFrame.ts:464–467` — the still-animating predicate's `state.gpu.renderer !== null && …` clauses collapse to `isEngineReady(state) && state.gpu.renderer.isFading()` etc.  (Three field checks become one.)
- `wiring/pointSourceRegistry.ts:252` — the slot-commit subscriber's `if (!state.gpu.renderer) return;` becomes `if (!isEngineReady(state)) return;` (the function the predicate guards calls `state.gpu.renderer.upload`, which is what makes the broader narrowing safe).
- `phases/wireSlots.ts:130` — the filament commit's `if (!state.gpu.filamentRenderer) return;` stays as-is because that's the filament-specific check, NOT the bootstrap-completed check.  (Documented in the spec to forestall the "but you missed one" review comment.)
- Future Pass `enabled()` and `draw()` signatures take `ReadyFrameContext` not `FrameContext` — they're called only post-narrowing in `renderFrame`, so the type system carries the guarantee.

The `engine.ts` `destroy()` cluster (lines 640, 651, 657, 663, 669) uses `?.` chains rather than the `!=` check — those are teardown-shaped and don't benefit from the predicate; left alone.

#### Why this earns its place

- **One answer site instead of seven.**  Adding a new field to the bootstrap-complete bag (e.g. a label renderer from MSDF-labels work) means updating `engineReady.ts` once instead of grepping for every "is engine ready?" check across the codebase.
- **Type-system-enforced.**  Today's `state.gpu.renderer!.upload(...)` non-null assertions are folkloric — a developer "knows" the field is non-null because the surrounding `if` checked it.  After D.4, narrowing through `isEngineReady` removes the `!` and tsc proves the safety.
- **Cheap.**  The implementation is one boolean expression.  Branch prediction makes the per-frame cost negligible; the win is at the source-readability and refactor-safety level, not runtime.

#### Alternatives considered

- **Per-bag predicates** (`isGpuReady`, `areSubsystemsReady`).  Trades one abstract for several, each with the same shape — more boilerplate, less clarity.  Rejected: nothing reads "GPU ready but subsystems not" today, so the split would be cosmetic.
- **Make every field non-null on the `EngineState` type** (lazy initialisation via accessors).  Big lift; would require a deferred-construction pattern across every nullable field; breaks the "EngineState is the runtime data shape" invariant documented in `EngineState.d.ts`.  Rejected as out of scope.
- **A single `EngineState['ready']: boolean` field set after bootstrap.**  Doesn't narrow the *types* — every consumer still has to non-null-assert because the boolean doesn't tell tsc anything about the field types.  Rejected: predicates with `is` clauses are how TypeScript expresses this.

#### `EngineState` shape change

`isEngineReady` is implemented against today's `EngineState` shape — no type changes are required to the canonical `EngineState`.  The `ReadyEngineState` type is built via intersection:

```ts
type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & { renderer: PointRenderer; … };
  subsystems: EngineState['subsystems'] & { thumbnails: ThumbnailSubsystem; … };
};
```

The intersection narrows individual fields without rewriting the canonical type.  This matters for the migration: D.4 lands without touching any `EngineState` declaration, which keeps the diff tight and avoids merge-conflict surface.

The "careful sub-bag rewrites needed in EngineState's type" the prompt anticipates aren't actually required — TypeScript's intersection-narrowing handles it via the `state is ReadyEngineState` guard.  This was the simpler path the brainstorm landed on.

## Migration strategy

Four PRs in this order, smallest blast radius first.  Each is independently mergeable; each preserves observable behaviour (verified by the existing 931+ test suite).

1. **D.1 — `FrameContext`.**  New file `frame/frameContext.ts`; `runFrame` and `renderFrame` updated to consume it.  Net: runFrame -50 lines, renderFrame -30 lines, +1 new ~80-line file.  No behavioural change; the 5-way null-check becomes one `if (!ctx.isReady)`.
2. **D.2 — `Pass` abstraction.**  New folder `frame/passes/` with 4 pass files + an `index.ts` that exports the `PASSES` array.  `renderFrame.ts` collapses to ~150 lines: the encoder lifecycle plus the for-loop plus the inline tone-map.  Net: renderFrame -350 lines, +5–6 new files (4 passes + index + the `Pass` type file).  Net dispersion not reduction; the win is shape — every pass becomes a one-file unit.
3. **D.3 — `selectionSubsystem`.**  New file `subsystems/selectionSubsystem.ts`; `engine.ts` removes the four selection helpers, replaces inline `setSelected`/`setHovered` calls with `state.subsystems.selection.set*`.  `EnginePickingState` loses its `hovered`/`selected` fields (kept on the subsystem instead).  Net: engine.ts -150 lines, +1 new ~120-line file.
4. **D.4 — `isEngineReady` predicate.**  New file `helpers/engineReady.ts`; 7+ call-site simplifications across `runFrame`, `renderFrame`, `wiring/pointSourceRegistry`, future passes.  Net: 10+ small per-file edits; each individual edit is 3–5 lines shrinking to 1.  The win is type-clarity, not raw line count.

Each PR adds at least one regression test for the contract being relocated (see Testing).

### Why this order?

- **D.1 first.**  It's the seed every later migration leans on: `Pass` (D.2) takes `ReadyFrameContext` as a `draw` arg; `isEngineReady` (D.4) is the cousin predicate.  Landing it first means D.2 and D.4 can use the type without re-introducing it.
- **D.2 before D.3.**  `renderFrame` is a hotter path of code review attention than `engine.ts`'s public handle; landing D.2 while attention is on the per-frame area minimises rebase cost.
- **D.3 before D.4.**  D.3 adds a new subsystem field (`state.subsystems.selection`); D.4's `ReadyEngineState` includes it.  Landing D.3 first means D.4's `ReadyEngineState` is correct first time and doesn't need a follow-up update.
- **D.4 last.**  Cross-cutting touch on multiple files; benefits from every prior PR having shrunk those files first.  Smallest cognitive load by the time we get there.

## Testing

Each PR adds at least one regression test for the contract being introduced.  Existing `tests/services/engine/frame/{runFrame,renderFrame}.test.ts` stay green throughout.

### D.1 — `FrameContext`

A new `tests/services/engine/frame/frameContext.test.ts`:

- Given a fully-bootstrapped state stub (camera + GPU handles populated), `deriveFrameContext` returns `{ isReady: true, ... }` with `vp` non-null and `drawPxPerRad` matching `height / (2·tan(fovY/2))`.
- Given `state.cam = null`, returns `{ isReady: false }`.
- After narrowing via `if (!ctx.isReady) return;`, type-check assertions confirm `ctx.cam`, `ctx.vp`, `ctx.drawCamPos` are typed non-null (compile-time assertion via `@ts-expect-error` blocks against unsafe access on the not-ready branch).

### D.2 — `Pass` abstraction

A new `tests/services/engine/frame/passes/passes.test.ts`:

- `PASSES` array contains exactly the expected names in the expected order (`['point-sprites', 'thumbnails', 'filaments', 'milky-way']`).
- For each pass, `enabled(...)` returns the expected boolean given representative settings:
  - `pointSpritesPass.enabled(state, ctx, settings)` → always true.
  - `thumbnailsPass.enabled(state, ctx, { galaxyTexturesEnabled: false, ... })` → false.
  - `filamentsPass.enabled(state, ctx, { filamentsEnabled: true, ... })` with `filamentRenderer === null` (via state) → false.
  - `milkyWayPass.enabled(state, ctx, { milkyWayEnabled: true, ... })` with `ctx.drawCamPos = [10000, 0, 0]` (far) → false (fade alpha hits zero).
- `renderFrame.test.ts` (existing) stays green: it observes the same draw calls landing in the same order, just dispatched through the array iterator instead of inline.

### D.3 — `selectionSubsystem`

A new `tests/services/engine/subsystems/selectionSubsystem.test.ts`:

- `setSelected({ source, localIdx })` fires `cb.onSelectChange` exactly once with the built `PointInfo`.
- `setSelected(sel)` then `setSelected(sel)` (same value) fires `onSelectChange` only once total — equality dedup works.
- `setSelected(sel, prebuiltInfo)` uses the prebuilt info instead of calling `pointInfoFor` — the pre-GPU-upload race-window contract.
- `setHovered` mirrors the same dedup behaviour against `cb.onHoverChange`.
- `current()` reflects the latest `setHovered` / `setSelected` calls.
- An integration test in the existing `engine.tier-swap-race.test.ts` (or a new `tests/services/engine/selection-flow.test.ts`) covers the full `setSelected → onSelectChange callback fires → halo updates next frame` cycle through the public-handle façade.

### D.4 — `isEngineReady` predicate

A new `tests/services/engine/helpers/engineReady.test.ts`:

- Returns `false` for a partial state (each of cam, renderer, pickRenderer, postProcess, thumbnails missing in turn).
- Returns `true` for a fully-populated state.
- Type-narrowing test:
  ```ts
  if (isEngineReady(state)) {
    state.gpu.renderer.upload(...);  // ok — no `!` needed
    state.cam.distance;              // ok
  }
  // Outside the guard:
  // @ts-expect-error — `state.cam` is `OrbitCamera | null`, not `OrbitCamera`.
  state.cam.distance;
  ```
  The `@ts-expect-error` block is the regression test: if a future change accidentally weakens the predicate, tsc starts accepting the unsafe access and the test fails.

## What this spec deliberately does NOT do

- **Doesn't extract more from the public handle.**  `focusOn`, `setTier`, `loadPgcAliases`, `selectFamous`, `selectByAlias` are real features with their own gravity (focusOn coordinates a tween + URL update + onFocusChange callback; setTier orchestrates a multi-source slot reload; loadPgcAliases is a Promise-returning shim over an async slot).  None duplicates a pattern Spec D extracts.  Each could become its own subsystem if a future feature pulls on them — flagged in Follow-up below.
- **Doesn't introduce snapshot/render immutability boundaries.**  A future "render the world from a snapshot, not from `state` directly" boundary is plausible (would make the renderer testable without an engine), but it's a much larger lift than D.1's `FrameContext` and would force rewrites of every renderer's `.draw()` call.  Out of scope; possible Spec E.
- **Doesn't unify the subsystem API.**  Spec C's "Follow-up — subsystem API consistency" note documents that the seven `state.subsystems.*` handles don't share a `runFrame() / destroy()` interface.  D.3 adds an eighth (selectionSubsystem) that mirrors the existing closure-returning-factory shape — same loose fit as the others.  The rename + docstring refresh from Spec C's note can land separately if/when desired; D.3 doesn't try to enforce a contract that doesn't exist.
- **Doesn't touch the renderer interface.**  Spec D's `Pass` is the FRAME-side composition; the corresponding RENDERER-side composition (a unified `Renderer` interface with `initialize/upload/draw/destroy` lifecycle) is a different, larger spec that would force every `*Renderer.ts` to conform.  Out of scope.
- **Doesn't introduce ECS / scene graph / material system.**  Wrong abstractions for a 4-renderer codebase; YAGNI.  Re-evaluate when a 10th renderer joins, not at 7.
- **Doesn't merge `services/engine/frame/passes/` with `services/gpu/passes/`.**  Different concerns: the engine folder is *per-frame draw orchestration* (which engine-side passes run, in what order, gated on what); the gpu folder is *GPU-pass implementation* (the post-process pass that owns its own bind groups and pipeline).  Same name, different layer.  Documented at the folder docstring to avoid the future "should these merge?" question.

## Success criteria

- **All four PRs merged.**
- **`engine.ts` ≤ ~1000 lines** (down from 1129; D.3's `selectionSubsystem` alone removes ~150).
- **`runFrame.ts` ≤ 250 lines** (down from 469; D.1 + D.4 together).
- **`renderFrame.ts` ≤ 150 lines** (down from 500), with 4–5 new pass files in `engine/frame/passes/` (4 HDR passes + the `Pass` type file + an `index.ts` that exports `PASSES`).
- **All existing tests green.**  931+ tests pre-D, no count regression post-D.  Each PR adds at least one regression test for its specific contract.
- **The "is engine ready?" question has ONE answer site.**  `isEngineReady` is the one source of truth; every per-frame and slot-commit-side check that today re-spells out a 5-field probe consolidates onto the predicate.
- **One regression test per PR for the contract being introduced.**  `frameContext.test.ts`, `passes.test.ts`, `selectionSubsystem.test.ts`, `engineReady.test.ts`.
- **Type-narrowing carries the guarantees.**  Post-D.1 and D.4, the per-frame body and Pass `draw` callees access `ctx.cam`/`state.gpu.renderer` without `!` non-null assertions; tsc proves the safety.

The win is measurable: a reader who asks "what runs this frame?" lands on the four-line `for (const p of PASSES)` loop in `renderFrame.ts`; a reader who asks "is the engine bootstrapped?" lands on `isEngineReady`; a reader who asks "what does the world look like this frame?" lands on `FrameContext`.  None of those questions has an obvious answer today.

## Follow-up — NOT in scope here

The work Spec D deliberately defers but knows is coming:

- **Public handle further extraction.**  `selectFamous`, `selectByAlias`, `focusOn`, `setTier`, `loadPgcAliases` could each become their own subsystem if a feature pulls on the pattern.  Today they're each ~30–80 lines of one-off orchestration; the cost-benefit doesn't favour extraction yet.  Re-evaluate when a 6th method of similar shape joins or when one of these methods needs to be testable in isolation.
- **Renderer interface unification.**  A proper `Renderer` type with `initialize/upload/draw/destroy` lifecycle, unifying the seven `*Renderer.ts` files in `services/gpu/renderers/`.  Spec D's `Pass[]` is the frame-side composition; this would be the renderer-side composition.  Substantial design surface; possible Spec E.
- **Snapshot/render immutability boundary.**  Today's renderers read `state.*` indirectly through `RenderFrameInput`; tomorrow's could read from an immutable snapshot the engine commits at the top of each frame.  Would make every renderer unit-testable without an engine and would close the door on the per-frame mutation race surface.  Larger lift than D.1's per-frame derivation; warrants its own spec.
- **Subsystem API consistency pass.**  Spec C's noted follow-up — rename the 5 non-`*Subsystem` handles (or drop the suffix from the 2 that have it) plus a docstring refresh on `EngineSubsystemHandles.d.ts`.  Independent of D.3 (D.3 adds one more handle following the existing — loose — convention).
- **Tone-map / post pass abstraction.**  If a second post-process pass appears (bloom, DoF), promote tone-map + the new pass to a `POST_PASSES` array following the same pattern D.2 establishes for HDR passes.  Not worth the abstraction for one inhabitant.
