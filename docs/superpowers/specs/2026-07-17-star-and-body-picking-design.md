# Star & Foreground-Body Picking — Design

**Status:** Draft (2026-07-17)

**Goal:** Make Gaia catalog stars and the NEAR0 foreground bodies (Earth, the
planets, the ~25 seeded scene stars incl. the Sun) click/hover-pickable through
the **existing** unified pick spine — no parallel pipeline. Picking a star or a
body then composes the full selection experience the galaxies already have:
InfoCard, a selection ring at the picked position, a deep-linkable URL hash, and
camera focus framing.

This is one design, delivered in three stages: **stars first, then bodies, then
ring/card polish** (§ Staging). The two families share almost everything —
the pick spine, the identity encoding, the selection-ref/row/table plumbing,
the ring renderer — and differ only in how each rasterises its pick geometry and
how each reconstructs a display row.

---

## 1. The unified pick spine (what already exists)

A pick is a single, object-agnostic path, and every step of it is already built.
`pickProgram` (`src/services/engine/frame/pickProgram.ts`) is the spine:

```
pickablesBySlab            (filter CONTENT_LAYERS by drawPick + enabled, group by slab)
  → per-slab r32uint pass  (each slab rasterises its pickable layers, DEPTH-TESTED)
  → copyTextureToBuffer    (one cursor texel per slab)
  → frontmostPick          (near→far CPU fold: first non-zero slab wins)
  → unpackPick             (raw u32 → { sourceCode, localIdx })
  → RESOLVE_PICK[type]     (→ SelectionRef, an identity)
  → extractSelectionRow    (→ serializable SelectionRow, a display projection)
  → buildFocusable         (React-side → FocusableTarget view-model)
```

Two facts make this design mostly plumbing rather than new machinery:

- **The spine is slab-parametric and demand-driven.** `pickablesBySlab`
  (`pickProgram.ts:221`) filters `layers` by `l.drawPick && l.enabled(state, ctx)`
  and groups by `l.slab`; a slab with no enabled pickable layer allocates nothing.
  The cross-slab occlusion rule is a pure CPU fold — `unpackPick(frontmostPick(...))`
  (`pickProgram.ts:286`) — so NEAR0 already sits **in front of** COSMO for free.
- **NEAR0 is already a live pick slab.** The Milky-Way impostor is a NEAR0
  pickable today, so `pick:near0` (r32uint + `NEAR0_DEPTH_FORMAT = 'depth32float'`,
  `pickProgram.ts:61`) is already allocated and depth-tested when the near field
  is in view. The visual star pass is depthless additive, but the *pick* pass is
  depth-tested (the pass clears depth to 1 and every pickable declares a matching
  `depthStencil`), so a star/body pick resolves the nearest surface correctly with
  no new pass infrastructure. Both new families join NEAR0 as additional
  `drawPick`-bearing layers.

The identity encoding is likewise fixed: `packSelection(sourceCode, localIdx) =
(sourceCode << 27) | localIdx` with a `+ PICK_SENTINEL_OFFSET` bias so the
cleared-to-zero texel stays "no hit" (`src/data/selectionEncoding.ts:40,59,68`;
source code 31 reserved as the all-ones sentinel, `:82`). Source codes are
append-only. The Gaia bin already owns `Source.GaiaStars = 24`; the seeded
bodies own `FamousStar = 21` / `Planet = 22` / `Earth = 23`. The 27-bit localIdx
budget (134 M) dwarfs the largest star tier (~75 MB / 6 B ≈ 12.5 M records).

**Non-goal:** a second pick pipeline, a CPU octree raycast, or a frame-snapshot
resolve. The spine already answers "what is under the cursor?" object-agnostically;
new families add pick *rasterisation* (a small shader each) plus resolve/extract
arms, nothing else.

---

## 2. Staging

One plan, three stages, each independently shippable and reviewable:

1. **Stars** (§3–§7). Gaia leaf stars become NEAR0 pickables; picking one shows
   a derived-data "Field star" card, a ring at the reconstructed position, and a
   `star-<index>` deep link. This carries the most new machinery (record-index
   identity, in-shader compose, the NEAR0 ring layer, the new `star` ref).
2. **Bodies** (§8). Earth / planets / scene stars become NEAR0 pickables carrying
   their stable seed index; the `body` selection plumbing (already half-built by
   the zoom-to-earth work) gains its missing pieces — RESOLVE_PICK arms, a real
   bodies-InfoCard (`buildFocusable`'s body arm is a deliberate `null` today),
   and a filled selection-ring row.
3. **Ring/card polish** (§9). Cross-cutting tuning once both families select:
   ring radius/appearance in the NEAR0 layer, card copy, hover behaviour.

The prep refactors (§10, P1 + P2) land as their own PR(s) **before** stage 1.

---

## 3. Stable star identity — the record index (approach A)

A pick must name a star that survives the frame — the same star must resolve on
the next hover, on a URL round-trip, and on a re-render. The Gaia renderer draws
the whole octree cut in **one** `draw(3, totalInstances)` (`starCatalogRenderer.ts:487`),
routing each instance to its node by binary-searching a per-frame `prefix` sum,
so `@builtin(instance_index)` is a per-frame, cut-dependent quantity — never a
stable id.

**The stable id is the bin-global record index.** Each node carries `firstRecord`
(byte 8 of the on-disk 16-byte node, `starCatalogFormat.ts:259`; uploaded at byte
16 of the 32-byte GPU `NodeParams`, `starCatalogRenderer.ts:116`). The visual
vertex shader **already** computes exactly this record index —
`node.firstRecord + (ii - prefix[slotLo])` (`vertex.wesl:296`) — to vertex-pull
the record. So the pick id composes in the shader from data already in hand:

```
pickId = packSelection(Source.GaiaStars, recordIndex + PICK_SENTINEL_OFFSET)
```

`recordIndex` is stable per loaded tier bin: it invalidates on a tier switch
(the bin changes), exactly like galaxy-catalog positional refs, whose stale
indices the tier saga re-anchors or drops. No format change, no sidecar.

**Rejected alternatives** (recorded so they are not reopened):

- **(B) raw `instance_index` + a CPU frame-snapshot resolve.** Would require
  snapshotting the frame's cut (node list + prefix sum) so a later readback can
  map an instance back to a record, plus lifetime machinery for that snapshot and
  frame-timing subtlety about which frame's cut a given pick belongs to. The
  record index is already in the shader; snapshotting is strictly more moving
  parts for the same answer.
- **(C) a CPU octree raycast.** Re-derives "which star is under the cursor" on
  the CPU, duplicating the entire visibility/LOD story (the octree walk, the
  budget cut, the leaf/aggregate split) as a second pipeline that must stay in
  lockstep with the GPU one — the exact parallel-pipeline the spine exists to
  avoid.

---

## 4. Pick footprint — leaf stars only, visible only

What rasterises into the star pick pass:

- **Leaf stars only. Aggregates NEVER pick.** An aggregate record is a merged
  subtree's flux-weighted mean, not a star — there is no single object to name.
  The layer already partitions the cut into a leaf stream and an aggregate stream
  by `childMask` (`starCatalogLayer.ts:367–404`); the pick draw packs the **leaf
  stream** only.
- **Visibility gates picking.** Nodes with draw `opacity === 0` are excluded — a
  fully-faded star is not on screen and must not pick (the house rule: pick follows
  visibility, gate at `enabled`). The layer's `enabled = starCatalogVisible`
  (`starCatalogLayer.ts:458`) already means cosmic-zoom frames never allocate
  `pick:near0`.
- **A legibility pick footprint.** The pick billboard is the visual dot clamped
  to a ~3 px minimum, so a sub-pixel star is still clickable at its true screen
  position. **No brightness floor** — a dim-but-visible star is as pickable as a
  bright one.

There is **no re-traversal.** `prepareStarCut(state, ctx)` is exported and
memoised per-`ctx` in a `WeakMap` (`starCatalogLayer.ts:267,278`), so the pick
draw consumes the **same** per-frame cut the visual pass built, filtered to the
leaf stream with `opacity > 0`.

---

## 5. Shader architecture — the galaxy points-family idiom

The star pick pipeline follows the galaxy `points/` family verbatim
(`src/services/gpu/shaders/galaxyCatalog/points/io.wesl` documents the idiom):
one shared vertex source compiled into both the visual and pick pipelines, with
each pipeline compiling its **own** `GPUShaderModule` (the WebGPU `auto`-layout
trap forbids sharing a compiled module across pipelines — `points/io.wesl:29–34`),
swappable fragments, a `pickPass` uniform toggle, and an extra `VSOut` field the
visual fragment ignores (`VSOut.instanceIdx` + `Uniforms.pickPass` in
`points/io.wesl`, the latter at byte offset 168).

Concretely for `starCatalog`:

- **`io.wesl`** — `StarUniforms` gains `pickPass: u32` (in the existing 16-byte
  rounding tail, so the struct size is unchanged); `VSOut` gains
  `recordIdx: u32 @interpolate(flat)`.
- **`vertex.wesl`** — populate `out.recordIdx = node.firstRecord + (ii -
  prefix[slotLo])` (the value it already computes at `:296`); when
  `u.pickPass == 1u`, clamp the billboard to the ~3 px minimum footprint. The
  visual far-plane clip-z clamp (`vertex.wesl:374`) carries over so distant stars
  stay pickable — ties beyond the far bracket fall to draw order (accepted).
- **`pickFragment.wesl`** — NEW. Imports `lib::selectionEncoding::packSelection`
  and writes `packSelection(SOURCE_GAIA_STARS, in.recordIdx + PICK_SENTINEL_OFFSET)`
  into the r32uint target. WESL comments use single quotes, never backticks
  (parse errors).
- **`starCatalogPickRenderer.ts`** — NEW. r32uint colour target + `depth32float`
  depth (`NEAR0_DEPTH_FORMAT`), `depthCompare: 'less'`, `depthWriteEnabled: true`
  — the visual pass is depthless additive, but the pick pass is depth-tested so
  the nearest star wins. It reuses the leaf stream's per-source `nodeParams` /
  `prefix` storage buffers.
- **`starCatalogLayer.drawPick`** — NEW. Consumes `prepareStarCut`'s leaf stream
  filtered to `opacity > 0`, calls the pick renderer. Because `enabled`
  (`starCatalogVisible`) already carries the foreground-distance + crossfade gate,
  a cosmic-zoom frame never reaches this draw.

**Cost note.** The pick pass runs on demand (hover/click), not every frame, and
≤2.5 M pick triangles into r32uint with **no blending** and no HDR tone-map is
strictly cheaper than the visual pass it mirrors.

---

## 6. The identity-less "Field star" card

SKST v1 carries no star identity: the 6-byte record is 10-bit xyz offsets +
7-bit absMagIdx + 6-bit colorIdx, and the Gaia `source_id` / HIP designation is
discarded in `tools/stars-rs` before packing. So a picked star has **no name** —
and v1 deliberately keeps it that way (a format v2 with an identity sidecar was
considered and rejected for v1).

The card is therefore **derived data**, reconstructed entirely from the record:

| Field | Derivation |
|---|---|
| title | "Field star" (no catalogued identity) |
| distance from Sun | `length(positionMpc)` → pc |
| absolute magnitude | `lutIndexToAbsMag(absMagIdx)` (`starCatalogFormat.ts:146`) |
| apparent magnitude | `absMag + 5·log10(d_pc / 10)` |
| BP−RP colour | `colorIdxToBpRp(colorIdx)` (`starCatalogFormat.ts:157`) |
| spectral class | rough O/B/A/F/G/K/M bin from BP−RP |

The two derived quantities (apparent magnitude, spectral-class bin) are pure
functions with a clear right answer, so they get focused unit tests (§11). The
rest is dequantisation the format module already owns.

Because a star has a real card + URL hash + focus framing, **a star IS a full
`FocusableTarget` in v1** — a new `StarInfo` arm (§7), not a body-style null.

---

## 7. Star selection plumbing — refs, rows, tables

The star family threads through the same tagged-union + table-dispatch spine the
galaxies use. Several dispatch tables are `[K in SelectionRef['type']]`-style
**mapped types**, so adding the variant is a compile error until every arm is
handled — the machine enforces completeness.

- **`SelectionRef`** gains `{ type: 'star'; index: number }`
  (`src/@types/engine/SelectionRef.d.ts`). Valid per loaded tier bin; invalidates
  on a tier switch — identical semantics to the galaxy positional ref. An
  out-of-range index at resolve time → warn + null (the existing pattern).
- **`SelectionRow`** gains `{ type: 'star'; index: number; positionMpc: Vec3;
  absMag: number; bpRp: number }` (`src/@types/engine/SelectionRow.d.ts`) —
  self-contained, so React-side framing/card read its fields directly (like the
  body row). It carries `index` because `buildFocusable` is row-only and the
  `StarInfo` focusable must round-trip through `refOf` / the `star-<index>` URL
  — the galaxy precedent (`GalaxyRow` carries `index`).
- **`RESOLVE_PICK`** (`resolvePickTable.ts:16`) gains a `starCatalog` arm →
  `{ type: 'star', index: pick.localIdx }`.
- **`EXTRACT_ROW`** (`extractSelectionRow.ts:21`) gains a `star` arm. It
  **binary-searches the octree nodes by `firstRecord`** to find the record's
  owning node, `unpackStarRecord`s it (`starCatalogFormat.ts:205`), reconstructs
  the world position (`cellOrigin + offset / 1024 × cellEdge` — the format's own
  reconstruction, `starCatalogFormat.ts:15–16`), and dequantises absMag/bpRp via
  `lutIndexToAbsMag` / `colorIdxToBpRp`.
- **`BUILD_FOCUSABLE`** (`buildFocusable.ts:20`) gains a `star` arm producing the
  new `StarInfo` view-model (title + derived fields, §6).
- **`selectionHaloTable`** (`selectionHaloTable.ts:40`) gains a `star` arm
  returning the picked position + a px-based ring radius.
- **URL scheme.** Focus id is `star-<index>` (tier-scoped). A stale index after a
  tier switch resolves to null — the same acceptance as galaxy refs. `focusIdOf`'s
  `ENCODE` (`focusIdOf.ts:43`, a mapped type) gains the encode arm; `resolveFocusId`
  gains the `star-` decode row (via the P1 decoder table, §10).

Because a star is a `FocusableTarget`, the three focusable-keyed Record tables —
`DETAIL_CARD` (`detailCardTable.ts:64`), `URL_HASH_FOR` (`urlHashFor.ts`),
`TARGET_IDENTITY_KEY` (`targetIdentityKey.ts`) — and `refOf` (`refOf.ts:28`) each
gain a star arm. P2 (§10) makes `FocusableTargetType` derived so those tables
compile-error until filled, rather than silently missing an arm.

---

## 8. Bodies (stage 2)

The `body` selection plumbing is **half-built already** (from the zoom-to-earth
palette body search): `SelectionRef` and `SelectionRow` carry a `body` arm,
`EXTRACT_ROW` resolves it against the static `SCENE_BODIES` table
(`extractSelectionRow.ts:34`), and `focusIdOf`/`resolveFocusId` round-trip
`body-<seedId>`. What is missing is everything that turns a *pick* into a body
ref, and everything that gives a body a *card*.

### 8.1 Body pick ids carry the stable seed index

`@builtin(instance_index)` is **not** a stable body id: `planetsLayer` packs only
the resolved planets, and `starSpheresLayer` / `starPointsLayer` draw
`partitionStarsByResolution`'s **camera-dependent** subset of `SCENE_STARS`
(`partitionStarsByResolution.ts`) — so an instance slot shifts as bodies enter
and leave the resolved set. The pick id must carry each body's **stable seed
index** (its index into `SCENE_STARS` / `SCENE_PLANETS`; Earth = index 0 of code
23), composed CPU-side into a per-draw uniform, never read from `instance_index`.

### 8.2 RESOLVE_PICK gains the body arms

`RESOLVE_PICK` gains three arms — `famousStar` / `planet` / `earth` — each mapping
`(code, seedIndex)` → `{ type: 'body', id }` by looking the seed index up in its
family array to recover the durable seed id. This reuses the existing
`{ type: 'body', id }` ref arm end-to-end.

### 8.3 Body pick rasterisation — own-uniform, no shared camera

Bodies do **not** use the COSMO shared-pick-camera `@group(0)` contract (that
contract exists only for the shared point-pick camera BGL). Body renderers bake
MVP CPU-side via the bodies' own `composeBodyMvp` (f64 → `narrowMat4` at upload),
so their pick pipelines follow that **own-uniform** pattern:

- **`renderers/bodies/bodyPickRenderer.ts`** — NEW. A flat sphere pick with a
  per-draw uniform `{ mvp, packedId }`. ≤10 draws (Earth + planets + resolved
  scene-star spheres), so **no instancing**.
- **`earthLayer` / `planetsLayer` / `starSpheresLayer`** gain `drawPick` calling
  it; each passes its body's stable seed index as `packedId`.
- **`starPointsLayer`** gets a small instanced pick-billboard variant (≤25
  instances) with the same ~3 px minimum footprint — the sub-pixel scene-star dots
  are pickable too, at their true position.

All body pick pipelines declare the NEAR0 `depth32float` depth profile their
visual siblings use, so Moon-in-front-of-Earth style overlaps resolve correctly.

### 8.4 Bodies-InfoCard is real feature work

`buildFocusable`'s body arm is a **deliberate `null`** today —
"a scene body has no InfoCard / URL-hash presence yet" (`buildFocusable.ts:26`).
Filling it is the substantive part of the bodies stage, not free composition:

- A new `BodyInfo` `FocusableTarget` arm + its detail/compact cards.
- The three focusable Record tables + `refOf` gain body arms (auto-forced by P2).
- `SelectionRow`'s body arm is **extended** to carry `absMag` / colour for the
  scene-star bodies (so a picked Sirius shows the same stellar fields a picked
  Gaia star does), alongside the existing `positionMpc` / `radiusKm`.
- `selectionHaloTable`'s body arm — a deliberate `null` today under the COSMO
  Mpc-scale assumption that "a Mpc-scale halo ring around a ~2e-16 Mpc planet
  would be meaningless chrome" (`selectionHaloTable.ts:62`) — is **filled**: the
  NEAR0 ring layer (§9) draws px-based rings, which ARE meaningful around a body.

---

## 9. Selection feedback — a NEAR0 ring layer

The selection marker is a ring at the reconstructed position, drawn by the
**existing** `selectionRingRenderer` (`selectionRingRenderer.ts`), which is
already slab-agnostic: single-instance, `ringRadiusPx`-based, taking
`(viewProj, viewportPx, { worldPos, ringRadiusPx })` (`:125`). Today only
`selectionRingLayer` (COSMO, `selectionRingLayer.ts:39`) drives it.

We add a **thin NEAR0 ring layer** (~40 lines), a sibling of the COSMO one,
doing the f64 rebase the other NEAR0 layers do (`narrowMat4(rebaseViewProj(...))`,
the `starCatalogLayer` idiom). It gates on and sizes from the same
`selectionHalo` table (now with star + body arms) and reuses the renderer
unchanged.

**Rejected feedback approaches:**

- *In-shader halo* (draw the ring inside the star/body pass) — the instance-routing
  plumbing to single out one star among a one-draw instanced cut is fiddlier than
  a one-instance overlay draw.
- *InfoCard-only, no ring* — you can't tell **which** star you hit from a card
  alone; the ring is the "this one" affordance.

---

## 10. Ground preparation

Per the refactor-the-ground convention, this section records the growth vs
bolt-on verdict per touchpoint.

### Growth (no prep needed)

- The star pick shader via the points-family idiom (shared vertex, own module,
  `pickPass` toggle, extra `VSOut` field) — the family already proves the shape.
- The pick draw-list via the exported, memoised `prepareStarCut` — no new
  traversal, no snapshot.
- Optional `drawPick` on a `ContentLayer` — `pickablesBySlab` already filters on
  `drawPick` presence, so a layer opting in is additive.
- The mapped-type dispatch tables — `EXTRACT_ROW`, `BUILD_FOCUSABLE`, and
  `ENCODE` in `focusIdOf` are `[K in SelectionRef['type']]`-style, so a new
  variant is a **compile error** until every arm is handled.
- `selectionRingRenderer` reused unchanged (already slab-agnostic, px-based).

### Prep P1 — decoder table for `resolveFocusId` (own PR, lands BEFORE the feature)

`resolveFocusId` (`resolveFocusId.ts:66–132`) is a **hand-ordered if/else prefix
ladder**: `pgc-`, `sdss-`, `pos@`, the structure prefixes, `MILKY_WAY_FOCUS_ID`,
the `BODY_FOCUS_PREFIX` block, ending in a **regex famous-id fallback** (`:130`).
A forgotten `star-` branch fails **silently** — the token falls through into the
famous scan and resolves to null (or worse, a coincidental famous id) with no
compiler complaint. This is the one selection site the type system cannot guard.

**Prep:** restructure the ladder into an ordered decoder table
`[{ matches, decode }]`, with the famous fallback as the explicit last row. Star
then lands as one table row, and the ordering intent (structure/body/milkyWay
before the greedy famous regex) is data, not comment discipline. Lands as its own
PR before stage 1.

### Prep P2 — derive `FocusableTargetType` (rides P1's PR, user-approved)

`FocusableTargetType` is a **hand-written literal union**
(`'galaxyCatalog' | 'structure' | 'milkyWay'`, `FocusableTargetType.d.ts`),
mirrored across three hand-spelled `Record<FocusableTargetType, …>` tables
(`DETAIL_CARD`, `URL_HASH_FOR`, `TARGET_IDENTITY_KEY`) plus `refOf`. Adding a
`star` (and later `body`) focusable arm to `FocusableTarget` would NOT force
those tables to grow, because the key type is hand-maintained separately.

**Prep:** derive `FocusableTargetType = FocusableTarget['type']`. Then adding a
`FocusableTarget` arm auto-extends the key union, and each Record table becomes a
compile error until its new arm is filled — the same completeness guarantee the
`SelectionRef`-keyed mapped tables already enjoy.

### Adjacent (noted, no action this design)

- `selectionRingLayer` (COSMO) + the new NEAR0 ring sibling are two thin layers
  sharing one renderer. A **third** slab flavour would be the consolidation
  trigger; two is not yet.
- The star-field-own-slab backlog item (2026-07-13) stays independent: this
  design keys off the **layer's declared slab**, so a future STARS-slab split
  re-keys in one line.

---

## 11. Testing

Per `docs/superpowers/conventions/testing.md` ("will it ever fail on a real bug
no other test or the compiler catches?"):

- **Record-index round-trip** — a record index → node binary-search (by
  `firstRecord`) → position reconstruction, round-tripped through
  `packStarRecord` / `unpackStarRecord`, recovers the packed position within
  quantisation. This is the load-bearing "the pick names the right star" guard.
- **The four `RESOLVE_PICK` arms** — `starCatalog` → `{ type: 'star', index }`;
  `famousStar` / `planet` / `earth` → `{ type: 'body', id }` via seed-index
  lookup.
- **Seed-index stability under compaction** — a `planetsLayer` pack test where a
  culled planet shifts instance slots but the pick ids do **not** move (the
  regression that proves §8.1).
- **Pick-draw-list packing** — leaf-only inclusion and zero-opacity exclusion
  (an aggregate or a fully-faded leaf never enters the pick draw).
- **Derived-card math** — apparent-magnitude (`absMag + 5·log10(d/10)`) and the
  spectral-class BP−RP binning.
- **The `resolveFocusId` star row** — `star-<index>` encode → decode round-trip
  through the P1 decoder table (and that `star-` beats the famous fallback).

Shader correctness (the pick footprint, the depth-tested nearest-wins, the ring
placement) is verified **visually on the dev server** per the meticulous-WGSL
rule. NO runtime type tests, no constant restatements, no clamp-boundary mirrors.

---

## 12. Doc cleanup (rides the stage that makes each false)

Several docblocks assert "not pickable" and become false when their subject
becomes pickable — update them in the same stage:

- `starCatalogLayer.ts` header "Not pickable…" paragraph (`:94–100`) → stage 1.
- `StarCatalogSourceEntry.d.ts` "not pickable" comment → stage 1.
- `sources.ts` `starCatalog` "not pickable" doc → stage 1.
- The Famous / Planet / Earth `SourceEntry` "not pickable" comments → stage 2.

---

## 13. Out of scope

- A SKST v2 with star identity (name/HIP/source_id) — explicitly rejected for v1;
  the derived-data card is the v1 answer.
- Aggregate picking — aggregates are subtree means, never selectable.
- A STARS-only depth slab — independent backlog item; this design keys off the
  layer's declared slab and re-keys in one line if that lands.
- Touch/pen picking of stars/bodies — inherits the existing mouse-only hover gate
  unchanged.

---

## References

- Pick spine: `src/services/engine/frame/pickProgram.ts`,
  `src/data/selectionEncoding.ts`
- Star format + renderer: `src/data/starCatalog/starCatalogFormat.ts`,
  `src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts`,
  `src/services/engine/frame/passes/starCatalogLayer.ts`,
  `src/services/gpu/shaders/starCatalog/{vertex,io}.wesl`
- Points-family pick idiom: `src/services/gpu/shaders/galaxyCatalog/points/io.wesl`
- Selection plumbing: `src/services/engine/helpers/{resolvePickTable,
  extractSelectionRow,buildFocusable,selectionHaloTable,refOf}.ts`,
  `src/services/url/{focusIdOf,resolveFocusId}.ts`,
  `src/components/InfoCard/detailCardTable.ts`
- Ring: `src/services/gpu/renderers/selectionRing/selectionRingRenderer.ts`,
  `src/services/engine/frame/passes/selectionRingLayer.ts`
- Gaia star bin design: `docs/superpowers/specs/completed/2026-07-13-gaia-star-bin-design.md`
- Pick-as-service design: `docs/superpowers/specs/completed/2026-06-22-pick-out-of-frame-design.md`

---

## Amendment (2026-07-17): field-star close-range sphere

**Status:** Amendment (adjudicated during Stage-1 visual verification). Ships as
**Stage 1.5**, between Stage 1 (stars) and Stage 2 (bodies).

### Why

Double-clicking a Gaia field star focuses it and frames the camera down to
solar-radius distance (`focusFraming`'s `star` arm → `bodyFocusDistance`). Two
gaps surface there:

1. **No close-range geometry.** At the framing distance only the point sprite
   exists — the picked star has no resolved surface, so the descent bottoms out
   on a dot instead of a body.
2. **The sprite swims.** The `starCatalog` visual vertex path reconstructs each
   star as `originRelCamMpc + offset · cellScaleMpc` in f32 (`vertex.wesl:262`).
   Within ~a couple of AU of a star those two terms nearly cancel, so the result
   carries the ulp-of-the-big-terms error — AU-scale for parsec-scale cells. The
   f64 focus **target** keeps the camera stable, but the f32 **sprite** hops by
   AUs, and at solar-radius framing distance an AU is many screen-widths: the
   sprite visibly flies around.

The fix is to **build the sphere**: render a real close-range sphere for the
focused field star on the f64 camera-relative scene-body path (`composeBodyMvp`
→ `starRenderer`), which is precisely the path that is well-conditioned at the
distances where the sphere is the visible representation. The wobble is not
"fixed" in the sprite — the sprite is retired from the near field (below), and
the sphere, composed in f64, does not wobble.

### Mechanism — a thin dedicated sphere layer (option B), NOT a transient scene star (option A)

A picked field star becomes a close-range sphere by adding **one thin
`ContentLayer`** — `focusedFieldStarSphereLayer` — that reuses the existing
`starRenderer` unchanged, exactly as `near0SelectionRingLayer` (Stage 1, §9) is
a thin NEAR0 sibling reusing `selectionRingRenderer`. It reads the current
`state.selectionRows.select` `star` row and, when the star's sphere clears the
resolve threshold, composes its MVP via `composeBodyMvp(view.slab.vp,
row.positionMpc, RENDER_ORIGIN_MPC, radiusMpc)` and draws it tinted by
`starTintFromBpRp(row.bpRp)`.

**Rejected — option A (inject a transient scene-star `StarBody`).** Appending
the picked star to `visibleStars(state)` so `partitionStarsByResolution` /
`starSpheresLayer` / `starPointsLayer` pick it up "for free" reads tidy but is a
braid: it makes the authored **scene-body star set** (a static seed table + one
settings toggle) depend on **runtime selection state**, and it drives the
catalog star through the point-partition path it does not need — the star
**already** has a representation there (its `starCatalog` sprite). Option A
would then draw the picked star as a scene point *and* a Gaia sprite across the
whole foreground range, widening the very sprite/sphere overlap this amendment
must resolve. Option B keeps the scene-body set pure and scopes the new geometry
to exactly the focused star at exactly close range — **growth at the "NEAR0
foreground sphere layer" seam**, the same seam Stage 1 just grew for the ring.

The layer reuses the *renderer* machinery (`starRenderer`, `composeBodyMvp`,
`RENDER_ORIGIN_MPC`, `SCALE_UNITS.KM_TO_MPC`, `apparentSizePx`/`resolvesToSphere`)
— **not** the *scene-set* machinery (`visibleStars`/`partitionStarsByResolution`),
which is authored-body plumbing.

### Data delta

- **`SelectionRow` `star` arm gains `radiusKm: number`** — the nominal solar
  radius, snapshotted at extract time (`extractSelectionRow.ts` `star`). It
  serves two consumers: the sphere layer (MVP scale) and the framing fold
  (below). The bin stores no per-star size (SKST v1 quantises position +
  photometry only), so this is a single representative radius, not a per-star
  fact — the `FieldStarInfo` card still shows no physical size (§6).
- **No format change, no new renderer, no new GPU handle.** `starRenderer`
  already exists on `state.gpu` and already draws famous-star spheres.

### Constraint resolutions

**(1) Single-source the solar radius** (absorbs Task-8 radar Finding 2). One
exported `SOLAR_RADIUS_KM` in a new `src/data/bodies/solarRadiusKm.ts`
(one-const data module, importable by `data/bodies/makers/star.ts`,
`extractSelectionRow.ts`, and `focusFraming.ts` with no import cycle). The
**canonical value is `696340`** — the value `makers/star.ts` already scales real
`radiusSolar` by, so authored star radii are unchanged. `focusFraming`'s drifted
`NOMINAL_STAR_RADIUS_KM = 6.957e5` (695700) is deleted; the ~0.09% framing-distance
shift that produces is accepted (framing fill has a 0.4-of-viewport tolerance).

**(2) Colour from BP−RP — reuse the one canonical ramp.** The single canonical
Gaia BP−RP → linear-RGB mapping is `starTint` in
`src/services/gpu/shaders/starCatalog/tint.wesl` (the survey sprite's own tint,
already imported by `vertex.wesl`). The sphere renders through the CPU-colour
`starRenderer.draw(pass, mvp, color)`, so it needs a CPU evaluation of that
**same** ramp: a new `src/utils/color/starTintFromBpRp.ts` that mirrors
`tint.wesl`'s five spectral-class anchors + four breakpoints **verbatim** — the
CPU evaluation of the one ramp, not a second ramp. This is a deliberate,
cross-referenced TS↔WESL mirror in the exact idiom `vertex.wesl` already uses for
the dequant windows (`STAR_ABSMAG_MIN`/`STEP`, `STAR_COLORIDX_MIN`/`STEP`, which
mirror `starCatalogFormat.ts`). `tint.wesl`'s header (which today asserts "no CPU
twin to drift against") is corrected to name the twin and the sync obligation. A
TS↔WESL parity test for the ramp anchors is deferred (same disposition as the
dequant-constant parity item in Finding 3) — the value is small and the mirror is
short.

**(3) Sprite→sphere handoff — retire the near sprite in-shader.** At framing
distance the sphere is the visible body, but the wobbling Gaia sprite for the
same star does **not** hide behind it — the opaque foreground sphere composites
over the additive HDR sprite only *at the sphere's own pixels*, while the swum
sprite lands elsewhere as a bright floating dot. So the sprite must be suppressed,
not occluded. The chosen mechanism is an **in-shader apparent-size dissolve** in
`vertex.wesl`: on the **visual pass only** (`u.pickPass == 0u`), the vertex stage
computes the star's would-be solar-diameter sphere size in px — from the
camera-relative depth already in hand (`worldRelCam` → `center.w`) and the
already-bound viewport, via the shared `worldLenToPx` path — and collapses the
billboard radius to zero as that size crosses the sphere-resolve threshold (a
`smoothstep` from `STAR_RESOLVE_PX` to a fixed ratio above it). This is pure
vertex math plus WESL consts mirroring their TS twins (`SOLAR_RADIUS_KM`,
`STAR_RESOLVE_PX`) — **it adds no uniform field and does not touch the shared
`starCatalogLayout` packing surface** (which a concurrent refactor owns). Because
the fade keys on the same apparent-size threshold the sphere layer gates on, the
sphere is resolved before the sprite starts dissolving **at every viewport
size**, giving a seamless crossover with no gap and no double-image. The pick
pass is left unfaded, so the star stays pickable at close range.

  Numeric anchor (1080 px viewport, the 60° default fov): a solar-diameter
  sphere (2 · 696340 km ≈ 4.513e-14 Mpc) subtends `STAR_RESOLVE_PX` = 4 px at
  ≈ 1.06e-11 Mpc ≈ 2.18 AU — matching the "wobble within ~a couple of AU"
  observation above. The shader's `worldLenToPx` estimate omits the projection's
  1/tan(fovY/2) factor (it has only clip.w + the viewport), so at 60° the fade
  in practice begins once the true sphere size is ~1.7× the threshold (~1.3 AU)
  and completes at 4× the fade start (~0.3 AU) — comfortably outside the
  ~0.02 AU focus-framing distance, with the sphere always resolved before the
  fade begins (the safe direction for any fov below 90°).

  _Amended during execution (Task 8e):_ the original draft specified a fixed
  near/far distance band in Mpc (`STAR_SPRITE_NEAR_FADE`). A fixed band agrees
  with the sphere layer's gate at exactly one viewport height + fov (the gate's
  resolve distance scales with both), producing a double-image on larger
  viewports and a gap on smaller ones; the px-keyed fade is viewport-exact and
  single-sources the handoff threshold (`STAR_RESOLVE_PX`) with the sphere layer
  it hands off to.

- *Why distance, not a focused-record match.* Fading **any** near star (not just
  the focused one) targets exactly the set that wobbles — a star only wobbles
  when the camera is within ~AU of it — and needs no per-focus uniform. The
  accepted trade-off: free-flying within the band of a **non-focused** star fades
  its sprite with no sphere to replace it (only the focused star gets a sphere).
  You reach AU-proximity to a star essentially only by focus-framing it, so a
  transiently-vanishing fly-through sprite is unobtrusive.
- *Rejected — per-record suppression uniform.* Passing the focused
  `recordIdx` (or its camera-relative position) as a uniform and collapsing only
  that star is more precise but adds a field to `StarUniforms` — the packing
  surface the concurrent layout refactor owns — and per-focus plumbing for a case
  the local distance band already covers. Not worth the coupling.
- *Rejected — "sphere covers the sprite; no suppression."* Dishonest here: the
  sprite swims off the sphere rather than staying under it, so occlusion alone
  leaves a floating wobbling dot.

**(4) Framing fold** (absorbs Task-8 radar Finding 4). With the `star` row now
carrying a real `radiusKm`, `focusFraming`'s `star` arm becomes byte-identical to
its `body` arm (both frame `row.positionMpc` on `row.radiusKm` through
`bodyFocusDistance`). Extract a shared `bodyLikeFraming(positionMpc, radiusKm,
fovYRad): FocusFraming` that both arms delegate to in one line each. The two arms
stay (the row shapes differ — the essential asymmetry), but the duplicated body
is gone (the accidental one). The framing distance is unchanged apart from the
~0.09% solar-radius shift (1), and `bodyFocusDistance`'s 0.4 fill already frames
the sphere at ~40% of viewport height — comfortably visible.

### Layer placement, gate, and draw

- **Registered** in `CONTENT_LAYERS` in the near-field foreground group, right
  after `starSpheresLayer` (`passes/index.ts` — same `(foreground:0, NEAR0)`
  render step; order within an opaque depth-tested group is a listing choice).
- **`enabled`**: `state.gpu.starRenderer !== null`, the current
  `selectionRows.select` is a `star` row, AND the star's sphere clears
  `STAR_RESOLVE_PX` at the **camera-to-star** distance (via `apparentSizePx` +
  `resolvesToSphere`, the shared threshold). Note this gates on camera-to-**star**
  distance, not `ctx.cam.distance` from the render origin (`starSpheresLayer`'s
  gate) — a field star sits parsecs from the Sun, so the origin distance is
  irrelevant; only its apparent sphere size matters.
- **`draw`**: `composeBodyMvp(view.slab.vp, row.positionMpc, RENDER_ORIGIN_MPC,
  row.radiusKm · SCALE_UNITS.KM_TO_MPC)` (no oblateness), colour
  `starTintFromBpRp(row.bpRp)`, `starRenderer.draw(pass, mvp, colour)`. The f64
  `composeBodyMvp` seam is what kills the wobble at these distances (§ the
  starSpheresLayer / composeBodyMvp headers).

### Ground preparation

Growth, no prep refactor: the sphere layer is a thin sibling reusing an existing
renderer (the `near0SelectionRingLayer` precedent); the framing fold and the
solar-radius single-source are the two Task-8 radar findings this amendment was
explicitly created to absorb. The BP−RP CPU twin is an in-idiom TS↔WESL mirror.
No packing-surface edit (constraint 3 keeps the shader change to pure vertex math
+ a constant).

### Testing

Per `docs/superpowers/conventions/testing.md`:

- **`starTintFromBpRp`** — hand-computed anchor + one midpoint (a very blue input
  returns the O/B anchor; a value halfway along a segment returns the segment
  midpoint colour). The CPU-evaluation-of-the-ramp guard.
- **The framing fold** — a `star` row and a `body` row with equal position +
  radius return equal `FocusFraming` (pins that the arms share one helper), and a
  `star` row frames at `bodyFocusDistance(SOLAR_RADIUS_KM · KM_TO_MPC, fov)`.
- **`extractSelectionRow.star` carries `radiusKm`** — the row snapshot includes
  the nominal solar radius.
- **The sphere layer `enabled` gate** — a `star` row at close range enables; the
  same row at far range (sphere sub-pixel) and a non-`star` row disable.

The sphere geometry, the tint on-screen, and the sprite→sphere dissolve are
verified **visually on the dev server** (meticulous-WGSL): descend into a focused
field star; confirm a resolved sphere of the right colour, the near sprite gone
(no swimming dot), and a seamless crossover with no gap.
