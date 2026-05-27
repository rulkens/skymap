# ADR 0001 — Fade is a Subsystem; Renderers Consume It, They Don't Store It

- **Status:** Accepted
- **Date:** 2026-05-27
- **Decision-makers:** rulkens
- **Supersedes:** —
- **Superseded by:** —
- **Related:** forthcoming plan `docs/superpowers/plans/2026-05-27-renderer-interface-extraction.md`

> **About this document.** This is the first Architecture Decision Record
> for Skymap. ADRs capture a single decision — its context, the choice
> made, and the consequences — at the moment the decision was made, so
> later readers (humans, agents) can reconstruct *why* the code looks
> the way it does without having to git-archaeology their way to the
> answer. ADRs are immutable once accepted: if we change our minds, we
> write a new ADR that supersedes this one. Format borrowed from
> Michael Nygard's 2011 essay, deliberately kept lightweight.

---

## Context

### What "fade" is in Skymap

The unified-fade architecture (`590e622`, `815ac17`, `6e34775`,
`0ce5621`, May 2026) gives every rendered layer in the engine a single
mechanism for animated opacity transitions: tier swaps fading old data
out and new data in, filaments fading on/off when the user toggles
them, labels fading in as they reach legibility distance, the cosmic-web
volumes fading in after their SCFDs finish loading. Before this work the
codebase had several bespoke "cloud fade" / "opacity tween" snippets
sprinkled across renderers; the refactor consolidated them into one
subsystem.

The consolidation landed in three architectural pieces:

1. **`FadeController`** — one per fade-able thing, owns the opacity
   value and its in-flight tween. Tickable, returns a Promise from
   `fadeTo`.
2. **`FadeRegistry`** — engine subsystem at `state.subsystems.fades`.
   Owns a `Map<string, FadeController>` keyed by a stable serialization
   of every registered `FadeHandle`. Renderers call `register(handle)`
   at construction and `opacityOf(handle, now)` per frame. See
   `src/services/animation/fadeRegistry.ts` for the rationale (value-
   keyed vs. WeakMap, fail-safe 1.0 vs. strict throw).
3. **Per-renderer GPU plumbing** — every renderer that participates in
   fade allocates a 16-byte `fadeBuffer` and a `fadeBindGroup` per
   handle, and writes the registry's opacity into that buffer once per
   frame from inside its `draw` loop. See for example
   `scalarVolumeRenderer.ts:347-356` (allocation) and `:555-579`
   (per-frame write).

Pieces (1) and (2) are clean. The fade subsystem owns its state, has a
narrow public surface, and is tested in isolation. The problem this ADR
addresses lives in piece (3).

### Where it went wrong: GPU plumbing leaked into per-instance state

The post-mortem of the volume renderer feature (see
`docs/superpowers/plans/completed/` for the original 2026-05-09 plan
and adjacent SCFD-v2 / fade-integration plans) surfaced a structural
wart that wasn't visible from inside any single PR:

`FieldEntry` — the renderer-internal record for each registered scalar
field — carries **two GPU resources owned by the fade subsystem**:

```ts
// src/@types/rendering/FieldEntry.d.ts:88-93
fadeBuffer: GPUBuffer;
fadeBindGroup: GPUBindGroup;
```

The same shape repeats in every renderer that participates in fade —
`pointRenderer`, `filamentRenderer`, `clusterMarkerRenderer`,
`scalarVolumeRenderer`, and the label renderers. Each renderer:

1. Creates a `fadeBuffer` + `fadeBindGroup` per registered handle at
   `addField` / `addInstance` time.
2. Imports the shared `fadeBgl` (bind group layout) from a renderer-
   adjacent module.
3. In its `draw` loop, calls `fadeOpacityOf(handle)` and writes the
   result into the per-instance `fadeBuffer` via `queue.writeBuffer`,
   then binds `fadeBindGroup`.

This shape has three concrete costs:

**Cost 1 — Type pollution.** `FieldEntry` has 12 mutable properties; two
of them (`fadeBuffer`, `fadeBindGroup`) are entirely opaque to the
renderer's own logic. The renderer doesn't compute anything from them;
it allocates them, writes them, binds them, and destroys them. Same
story for `PointDrawSettings`, `FilamentRenderer` internal state, etc.
The per-instance type — which should describe what the renderer needs
to render — is contaminated with what an orthogonal subsystem happens
to need.

**Cost 2 — Duplicated GPU plumbing.** The 16-byte buffer allocation,
the bind group construction against `fadeBgl`, the per-frame
`writeBuffer`, the scratch `Float32Array` — every renderer has its own
copy. When (`b413396`) we discovered the filament renderer wasn't
respecting the `filamentsEnabled` setting at slot commit time, the fix
had to touch fade plumbing inside the filament renderer specifically.
A bug in one renderer's fade write doesn't get caught by tests of
another renderer's fade write.

**Cost 3 — N writeBuffers per frame instead of N.** Today each
renderer's draw walks its registered handles and writes the opacity
for each one, even if two renderers share a handle (e.g.
`{ kind: 'volumesMaster' }` is observed by every volume layer and by
the volume post-process). One opacity value, multiple GPU writes. Not
expensive in absolute terms, but symptomatic of unclear ownership.

### Why we didn't catch this in design

The unified-fade architecture was designed bottom-up from the
controllers and the registry. The "where do the GPU resources live"
question was answered by precedent — `pointRenderer` already had a per-
instance fade-uniform buffer from its pre-unified-fade days, and the
new renderers (filaments, volumes, labels) followed that precedent
without revisiting it. The registry was added *above* the existing
shape rather than replacing it. This is a classic case of [Hyrum's
Law][hyrum] applied to internal APIs: the de-facto "renderers own fade
GPU resources" contract calcified before anyone asked whether it
should.

[hyrum]: https://www.hyrumslaw.com/

The same shape will recur for selection (`pickRenderer`), label
visibility cross-fade, and any future cross-cutting visual subsystem
that needs per-handle per-frame GPU state. Locking the precedent in
now, before those land, is the whole reason for writing this ADR.

---

## Decision

### The principle

**Cross-cutting subsystems own their GPU resources end-to-end.
Renderers consume them through a typed query, never by storing
subsystem-allocated buffers or bind groups in their own per-instance
records.**

For fade specifically: the `FadeRegistry` becomes responsible for
allocating, writing, and lending the per-handle fade `GPUBindGroup`.
Renderers ask `fades.bindGroupFor(handle)` at bind time and
`fades.opacityOf(handle, now)` if they need the scalar (e.g. for
visibility gating). Renderers no longer hold `fadeBuffer` /
`fadeBindGroup` fields.

### What changes — concretely

1. **`FadeRegistry` grows two methods:**

   ```ts
   // returns the bind group for the canonical fadeBgl, allocating on
   // first call for a given handle. Subsequent calls return the cached
   // bind group.
   bindGroupFor(handle: FadeHandle): GPUBindGroup;

   // called once per frame from runFrame, after tick(), before any
   // renderer's draw. Walks all registered handles, writes each
   // controller's current opacity into its corresponding 16-byte
   // GPU buffer. One writeBuffer per handle per frame, regardless
   // of how many renderers read it.
   flushGpu(now: number): void;
   ```

2. **`FadeRegistry` constructor takes the `GPUDevice` and the canonical
   `fadeBgl`.** Today the registry is GPU-agnostic; this couples it to
   the device, which is fine because the registry is already an engine
   subsystem constructed after device init.

3. **Renderers drop `fadeBuffer` and `fadeBindGroup` from their per-
   instance entry types.** Their draw loops change from "write
   `fadeBuffer`, then bind `fadeBindGroup`" to "bind
   `fades.bindGroupFor(handle)`". The shared `fadeBgl` import moves
   from renderer-adjacent modules into the fade subsystem.

4. **`runFrame.ts` calls `fades.flushGpu(now)` once per frame** before
   the first draw. The per-renderer per-frame writes go away.

5. **`Destroyable` semantics:** when `FadeRegistry.unregister(handle)`
   runs, the registry destroys the corresponding buffer + bind group.
   Renderers no longer have any fade-related cleanup in their
   `removeField` / `removeInstance` paths.

### What we are explicitly **not** deciding here

- **Selection / picking GPU resources.** Selection is the next likely
  candidate for the same treatment, but it has different constraints
  (the pick texture is per-camera, not per-handle) and deserves its
  own ADR if we go there.
- **The `Renderer` interface contract.** That's the subject of a
  forthcoming plan (`2026-05-27-renderer-interface-extraction.md`).
  This ADR pins down one specific responsibility — fade GPU resource
  ownership — and the interface ADR can take this as a precedent
  rather than re-arguing it.
- **Whether fade should be tween-based at all.** The `FadeController`'s
  internal animation model (eased tween, Promise-returning `fadeTo`) is
  out of scope.
- **Label fades.** Labels have a different opacity model — per-character
  in MSDF rendering — and may opt out of the registry-owned bind group
  pattern if performance demands it. If they do, that gets a follow-up
  ADR.

---

## Consequences

### Positive

- **`FieldEntry` shrinks from 12 mutable properties to 10**, with the
  two removed being the two that the renderer didn't actually use. The
  same applies to every other renderer's per-instance type.
- **One canonical fade write path** — bugs in the per-frame write are
  fixed once, in the subsystem, instead of N renderers. Unit-testable
  in isolation (mock device, assert `writeBuffer` calls).
- **One `writeBuffer` per handle per frame** instead of one per handle
  per renderer per frame. Marginal perf win; non-marginal clarity win.
- **Adding a new renderer that participates in fade** becomes a one-
  liner: call `fades.bindGroupFor(handle)` at bind time. No buffer
  allocation, no `fadeBgl` import, no per-frame write.
- **Sets a precedent** for the next cross-cutting subsystem (selection,
  picking, possibly post-process exposure) — they own their GPU
  resources too.

### Negative

- **One-time migration cost** across `scalarVolumeRenderer`,
  `filamentRenderer`, `pointRenderer`, `clusterMarkerRenderer`, and the
  label renderers. Each migration is mechanical (delete two fields,
  swap one bind call) but touches GPU code, which means visual
  regression risk. Mitigation: the project's visual smoke tests
  (`cf4-density-volume.spec.ts`, etc.) catch the gross failures; the
  per-renderer unit tests catch the fine-grained ones.
- **The `FadeRegistry` becomes GPU-coupled.** Previously you could
  reason about the registry as pure logic; now it allocates GPU
  buffers. We accept this trade because the registry is already a GPU-
  era subsystem (it's constructed after `device`, lives at
  `state.subsystems.fades`), and the alternative — a separate "fade GPU
  resources" service that mirrors the registry's handle set — is more
  surface area for the same job.
- **`bindGroupFor` allocates on first call**, which means the first
  frame after `register` does a buffer + bind group allocation
  synchronously on the render thread. In practice every handle is
  registered during slot commit (well before its first draw), so the
  first draw doesn't pay this cost. Tests should cover the
  register-then-immediately-draw case to make sure the lazy allocation
  doesn't surprise anyone.

### Neutral / forward-looking

- **No on-disk format change.** The `.scfd` binary format, the catalog
  `.bin` files, the `_headers` Cache-Control rules — nothing the
  pipeline outputs touches fade. This is a purely runtime refactor.
- **CLAUDE.md gains one line** in the project-conventions section:
  > Cross-cutting subsystems own their GPU resources end-to-end.
  > Renderers consume them by typed query (e.g.
  > `fades.bindGroupFor(handle)`), never by storing subsystem-allocated
  > buffers in their own per-instance state.

  That line is the operational form of this ADR.

---

## Implementation notes (non-binding)

These don't bind the implementer — the plan can revise them — but
they're the shape I had in mind while writing the ADR.

1. **Migration order, lowest risk first:** `clusterMarkerRenderer`
   (smallest surface) → `filamentRenderer` → `scalarVolumeRenderer` →
   `pointRenderer` (highest stakes, biggest test suite) → label
   renderers (only if they opt in).
2. **Test the registry's `flushGpu` against a mock device** asserting
   one `writeBuffer` per registered handle per call, plus a sanity
   test that `bindGroupFor` caches.
3. **Keep `fadeOpacityOf` as a public method on the registry.**
   Renderers still need the scalar for visibility-gating logic
   (`if (!enabled && opacity <= 0) continue` in
   `scalarVolumeRenderer.ts:556`).
4. **The `fadeBgl` constant moves into the fade subsystem.** It's
   currently a bind group layout shared across renderers; making the
   registry own it removes a circular import temptation.

---

## References

### Commits that shipped the current shape

- `590e622` — *feat(animation): unified fade architecture — foundation
  + registry + BGLs (#137)*
- `815ac17` — *feat(animation): unified fade — filaments + volumes +
  labels + overlays (#140)*
- `6e34775` — *feat(animation): unified fade — pointRenderer migration
  + tier-swap choreography (#142)*
- `0ce5621` — *feat(animation): unified fade — UI toggle, RoD tick,
  CloudFade deletion (#141)*

### Code touched by this decision

- `src/services/animation/fadeRegistry.ts` — gains `bindGroupFor`,
  `flushGpu`; constructor takes device + bgl.
- `src/@types/animation/FadeRegistry.d.ts` — public surface update.
- `src/@types/rendering/FieldEntry.d.ts` — remove `fadeBuffer`,
  `fadeBindGroup`.
- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — drop fade
  buffer allocation in `addField`, swap per-frame write for
  `bindGroupFor`.
- `src/services/gpu/renderers/{filament,pointRenderer,clusterMarker}*`
  — same pattern.
- `src/services/engine/frame/runFrame.ts` — call
  `fades.flushGpu(now)` once per frame.

### External references

- Nygard, Michael. *Documenting Architecture Decisions* (2011) —
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Cockburn, Alistair. *Hexagonal Architecture* (2005) — the broader
  precedent for "subsystems own their dependencies, consumers query
  by port."
