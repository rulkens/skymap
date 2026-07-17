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
- **`SelectionRow`** gains `{ type: 'star'; positionMpc: Vec3; absMag: number;
  bpRp: number }` (`src/@types/engine/SelectionRow.d.ts`) — self-contained, so
  React-side framing/card read its fields directly (like the body row).
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
