# Fade ownership + stateless renderers (braid #2) — design

> **Superseded for execution by
> [`2026-06-15-fade-ownership-visibility-seam-merged-design.md`](2026-06-15-fade-ownership-visibility-seam-merged-design.md),**
> which resolves the four Open decisions below and merges this braid with the #38
> visibility seam so the fade manifest has one home. This doc remains the
> background/rationale; the merged design is the source of truth for the plans.

**Status:** design direction captured; architecture **not yet locked** (see Open
decisions). Larger than braid #1 — likely 2–3 implementation plans.

**Goal:** the fade subsystem owns the *whole* fade concern. Every fade layer is
declared in **one** manifest (its existence + settings-derived seed opacity +
intent source), and every change to a fade goes **through one high-level intent
API** — not ~10 call-sites each re-deriving target/duration. As a direct
consequence, renderers stop holding fade-adjacent state and stop reaching into
the fade registry.

This is the second of two un-braidings from the state-topology pass (braid #1:
`docs/superpowers/specs/2026-06-14-load-state-consolidation-design.md`). It is on
the critical path: the manifest below **is** the `VISIBILITY_LAYERS` registry the
#38 visibility seam needs, which the #39 cinematic tour depends on.

## The braid

User's framing: *"the fade registry could hold everything fade related, and any
changes to fades are made through it. Now there are many places where fades are
registered and called. Also renderers should not be stateful."*

Today the FadeRegistry (`state.subsystems.fades`) is pure **mechanism** —
`register / unregister / fadeTo / setImmediate / opacityOf / isAnyAnimating /
tick`. It owns no **policy**. The policy is scattered:

### Registration — split across 2+ homes

- `registerOverlayFades` (one module, settings-seeded): overlays, `volumesMaster`,
  the category-less label layers, and per-category `markerLayer` +
  `labelLayer{structure}`. **This is the prototype manifest** — a pure function
  of `state.settings` + `STRUCTURE_CATEGORIES`, zero GPU.
- `galaxyCatalogSourceRegistry.ts:154` — `survey` handles, per source, in the
  slot factory.
- `filamentSlot.ts:30` — `filaments`, in the slot factory.
- `flowFieldSlot.ts:34` — `flow`, in the slot factory.
- `initGpu.ts:338` — `scalarField` handles, via the **renderer callback**
  `scalarVolumeRenderer.onFieldAdded/onFieldRemoved` (the inversion below).

### Driving — split across ~10 homes

Each of these re-implements the same `enabled ? fadeTo(1, IN) : fadeTo(0, OUT)`:

- Settings handlers: `setSourceVisible`, `setStructureItemEnabled`,
  `setStructureLabelEnabled`, `setSurveyLabelEnabled`, and the engine.ts closures
  for `milkyWay` / `filaments` / `volumesMaster` / `volumes.setFieldEnabled` /
  `flow.setProperties`.
- Slot commits (first-load fade-in, gated on `settings.X.enabled`): survey,
  filaments, flow, cf4Density, mcpm, synthetic volumes.

### Renderer involvement (the "renderers shouldn't be stateful" half)

- **Inversion:** `scalarVolumeRenderer` fires `onFieldAdded/onFieldRemoved` which
  **mutate the fade registry** from inside a renderer.
- **Mirrors:** `flowFieldRenderer.hasField` (an internal mirror of
  `field !== null`); `selectionRingRenderer.currentSelection` (a cache of
  `state.subsystems.selection`).
- **Drive-guards** exist because `fadeTo` throws on an unregistered handle and
  some handles register late (slot/wireSlots time) while their toggle is reachable
  earlier (splash-skip) — e.g. the flow re-enable guard in engine.ts. Accidental:
  rooted in late registration.

## Essential vs accidental (radar discipline)

Not every per-layer difference is accidental — un-braid only the accidental ones,
preserve the essential.

**Accidental (consolidate):**
- Seed opacity is settings-derived for *every* layer — already true in
  `registerOverlayFades`; just not applied uniformly. → one manifest seeds all.
- The intent→fade mapping (`enabled ? fadeTo(1, IN) : fadeTo(0, OUT)`) is
  identical at every toggle site. → one intent API.
- `scalarField` handles registering via a renderer callback. The *set* of
  possible fields is known at construction from the volume registry (cf4 + the
  three rhizome tiers + dev synthetics), same principle as
  [[project_volume_field_seeding]]. → seed them at construction; dissolve the
  callback.
- Late registration → drive-guards. → seed all handles at construction; guards
  dissolve (`fadeTo` never hits an unregistered handle).

**Essential (preserve, do NOT flatten):**
- **survey** has a tier-swap fade-out → upload → fade-in cycle no other layer has.
- **overlays** (proceduralDisks/texturedDisks) are always-on at 1, gated by
  apparent-size LOD, not by an intent fade.
- **producer-driven** fades (`youAreHere`, `galaxyNames`, per-category structure
  labels) fade in on *first content emit*, not on a settings toggle.
- **focus-recession** fades (`structureFocusSubsystem`) are selection-driven and
  per-frame — a different concern from visibility intent entirely.

## Proposed design

### 1. One fade manifest, seeded at construction

Generalize `registerOverlayFades` into the fade subsystem's own construction-time
seeding, driven by a declarative manifest that enumerates every fade layer and
its `seed(settings) → opacity`. It absorbs the four out-of-band registration
sites (survey / filaments / flow / scalarField). Because the FadeRegistry is
already built eagerly *before* any renderer, and seeding is a pure opacity write
with no GPU dependency, all handles — including the now-static `scalarField` set —
can be seeded at t=0.

Result: registration has exactly one home; the slot factories and `initGpu` no
longer call `register`; `scalarVolumeRenderer` no longer needs the
`onFieldAdded/onFieldRemoved` callbacks.

### 2. One intent → fade home

A high-level API on the fade subsystem maps **intent** to fades in one place,
e.g. `setVisible(handle, enabled)` doing the `enabled ? fadeTo(1, IN) :
fadeTo(0, OUT)` once. Every settings-toggle driver calls it instead of computing
target/duration itself. Slot-commit first-load fade-ins route through the same
direction (a `fadeIn(handle)` that respects the current intent). Producer-driven
and focus-recession fades stay as they are (essential, not intent toggles).

This API is exactly what the #38 visibility seam's `syncVisibilityFades` needs:
the seam restores a settings snapshot by driving the same per-handle intent
mapping over the same manifest. **One registry, two callers** (live toggles +
snapshot restore).

### 3. Renderers shed fade-adjacent state

- Delete `scalarVolumeRenderer.onFieldAdded/onFieldRemoved` (handles seeded by the
  manifest). The renderer no longer touches the fade registry.
- Delete `flowFieldRenderer.hasField` → read `field !== null`.
- Delete `selectionRingRenderer.currentSelection` → derive from
  `state.subsystems.selection` per frame (pass it in, like other per-frame inputs).
- Delete the drive-guards (e.g. flow re-enable in engine.ts) once every handle is
  construction-seeded — `fadeTo` can no longer throw on a missing handle.

## Open decisions (resolve before / during writing-plans)

1. **Manifest shape** — a pure data table (`FADE_LAYERS` rows with a
   `seed(settings)` + `expand` for per-category/per-source/per-field families), or
   an extended imperative seeder like today's `registerOverlayFades`. The data
   table is the project-preferred un-braided shape, but the heterogeneity
   (static / per-category / per-source / per-field families) may make a hybrid
   cleaner. Decide at design time.
2. **Intent API surface** — push (`setVisible(handle, enabled)` per toggle) vs
   pull (`syncFromSettings(next)` reconciling the whole settings tree). The seam
   wants pull for snapshot restore; the toggles fit push. Likely **both**, with
   push implemented via the same per-handle mapping pull uses.
3. **`fadeTo` throw vs fail-safe** — once all handles seed at construction, the
   `fadeTo`-throws-on-unregistered asymmetry (vs `opacityOf` returning 1.0) is
   moot for the static set. Decide whether to keep the throw (defensive) or align
   the two now that no caller should ever hit it.
4. **Plan decomposition** — almost certainly 2–3 plans: (a) construction-time
   manifest seeding + dissolve the four out-of-band registrations + the
   scalarVolume callback; (b) the intent API + repoint the ~10 drivers + delete
   drive-guards; (c) the renderer-mirror cleanups (`hasField`,
   `currentSelection`). (a) and (c) can land independently; (b) pairs naturally
   with the #38 seam.

## Verification (per plan)

- `npm run typecheck` + `npm test` green after each plan.
- Visual smoke on the dev server: every toggle still fades correctly, no
  frame-1 flash (the seed-opacity coherence `registerOverlayFades` documents),
  tier swaps still fade-out→upload→fade-in, producer/focus fades unchanged.
- Re-run entanglement-radar on each diff: registration has one home, intent→fade
  has one home, no renderer mutates the fade registry, no new mirror.

## Downstream

- **#38 visibility snapshot/restore seam** — consumes this manifest + intent API
  as `VISIBILITY_LAYERS` / `syncVisibilityFades`. Spec:
  `docs/superpowers/specs/2026-06-10-visibility-seam-reconciled-design.md`.
- **#39 cinematic tour** — drives the seam to script camera + visibility states.

## Relationship to braid #1

Independent but complementary. Braid #1 removes the flow/filament status-store
mirrors (read the slot via `slotReady`). Braid #2's construction-time seeding is
what lets braid #1's flow re-enable guard finally be **deleted** rather than just
repointed — so braid #1 repoints that guard to `slotReady`, braid #2 removes it.
