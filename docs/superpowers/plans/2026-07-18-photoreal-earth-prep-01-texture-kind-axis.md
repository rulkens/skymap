# Prep 1 — Texture-kind axis (`(body, kind)` texture family)

> **Spec.** `docs/superpowers/specs/2026-07-18-photoreal-earth-design.md` — §2
> (Ground preparation → "Prep 1 — Texture-kind axis"), §9, §12. This plan
> implements **Prep 1 only** (the first of two prep PRs; Prep 2 is a separate
> plan). It lands **before** feature PRs A–E.
>
> **Style.** Refactor plan — terse per
> `docs/superpowers/conventions/plan-style.md` ("Refactor vs green-field"). The
> existing code carries the context; the tasks point at what changes. Contract
> code (type signatures, test names + assertions) only — no implementation
> bodies. Tests follow `docs/superpowers/conventions/testing.md`.

## Goal

Generalize the body-texture asset family from keyed-by-`(body)` to
keyed-by-`(body, kind)`, so one body (Earth) can carry multiple maps
(`surface` / `night` / `clouds` / `material` / `normal`). Today the family is
strictly **one texture per body**; adding Earth's extra maps otherwise forces
fake body-ids (`earth-night`) that pollute `BodyTextureId` (which drives
partition / glint / **pick**), or hard-coding outside the slot family. This is
the BOLT-ON the `refactor-ground` pass flagged (spec §2 verdict table).

**Behavior-neutral.** Every existing body's day map keeps working, flowing
through `(id, 'surface')`. This PR adds the axis while Earth still loads only
its surface map. The night/cloud/material/normal maps + their GPU bindings are
feature PRs A–E — this plan puts the **axis + routing** in place, nothing more.

**Decision (grill §refactor-ground):** generalize the *shared* family, not
Earth-private slots. Clouds are body-agnostic (Venus/Titan reuse them), the
extension is modest and behavior-neutral, and the commit dispatch already routes
ring textures to a different renderer — so `(body, kind) → right renderer` is the
natural extension of `commitBodyTexture`.

## Architecture

The family's identity moves from a single id to a `(bodyId, kind)` pair,
represented two ways that never drift:

- **Structured entry** `BodyTextureKey = { bodyId, kind }` — the enumeration unit
  in `ALL_BODY_TEXTURE_KEYS`, carried through the wiring `req`, the commit
  dispatch, and the fetcher so `.bodyId` / `.kind` are read directly (no parse).
- **Composite string** `BodyTextureSlotKey = \`${bodyId}:${kind}\`` — the single
  primitive used as the `Map` key, the `AssetKey` union member, and the
  `AssetWiringRow.key`, because those three must agree on one comparable value
  (`slotFor` resolves `row.key` → the `bodyTextures` Map). Built by
  `bodyTextureSlotKey(bodyId, kind)`. Separator `:` — never appears in a body id
  (`saturn-ring` contains `-`, so `-` would be ambiguous) or a kind.

Which kinds a body has lives in the registry: `BodyTextureSpec.maxTier: Tier`
becomes `kinds: Readonly<Partial<Record<TextureKind, Tier>>>` — one field that
folds "which kinds does this body have" and "per-kind tier ceiling" into a single
home (spec §9.2: clouds/night can be lower-res than surface). Today every body is
`{ surface: <old maxTier> }`; the ring is always `(ringId, 'surface')`.

The runtime filename gains a `kind` segment **for non-surface kinds only**:
`surface` stays the unsegmented existing name (`${bodyId}-${px}.{jpg|png}`), and
`night`/`clouds`/`material`/`normal` get `${bodyId}-${kind}-${px}.{jpg|png}`.
`surface` is the default kind, and omitting its segment keeps every already-built
and already-deployed texture at its current name — so this refactor stays
**genuinely** behavior-neutral: the build tool re-emits byte-identical surface
filenames and **no rebuild / R2 re-sync / CDN purge is needed**. A new shared
helper `bodyTextureFilename(bodyId, kind, tier)` is the single home for that
convention (one `kind === 'surface'` ternary), called by **both** the runtime
fetcher and the build tool so they cannot diverge (today each constructs
`${id}-${px}.jpg` inline — a duplicated convention). See **Coupling** below.

## Coupling & assumptions (READ FIRST)

**The load-bearing coupling: runtime filename ⇔ build filename.** The runtime
fetcher requests `${bodyId}-${px}.jpg` (`bodyTextureFetcher.ts:40`) and the build
tool emits the matching name (`buildTextures.ts:233`); the two must never diverge
or **every body 404s and Earth renders the blue placeholder**. This plan un-braids
that by making **both** sides call one `bodyTextureFilename` helper (drift becomes
structurally impossible), and — decisively — keeps `surface` **unsegmented** so the
emitted bytes stay identical to today.

**Decision encoded here (revised from the spec's first sketch):** `surface` is the
default kind and omits the filename segment, so `bodyTextureFilename(id, 'surface',
tier)` returns the **exact current name** (`${id}-${px}.jpg` /
`saturn-ring-${px}.png`). The build tool re-emits byte-identical files ⇒ **no
rebuild, no `sync-r2-secure`, no CDN purge, no deploy-coordination window.** Prep 1
is a pure code refactor with **zero data ops.** Non-surface kinds
(`night`/`clouds`/`material`/`normal`) get the `-${kind}-` segment and land with
their feature PRs (A–E), each of which already fetches + builds + syncs the new map
— so the segment rides the map that needs it.

- **Why not always-segment** (the spec §2 sketch's `${id}-${kind}-${px}`): a uniform
  segment renames all 13 bodies' already-deployed tiers (742 MB synced 2026-07-18),
  forcing a rebuild + re-sync + CDN purge + a bundle↔R2 flip window — real deploy
  risk riding a behavior-neutral prep, to save one ternary in the single
  source-of-truth helper. Judge-the-artifact says the ternary wins. The `(body,kind)`
  *data shape* (the refactor-ground checkpoint) is unchanged; only the `surface`
  filename *encoding* differs. Spec §9.3 amended to match.
- `collectTextureImages` still globs the whole textures dir, so future segmented maps
  sweep to R2 automatically when their feature PR builds them.

**No `.ts` file is moved or renamed** — this plan only creates new files and edits
existing ones in place, so no `npm run move-files` invocation is needed. (The
`EarthRenderer.setTexture` → `setMap` change is a *method* rename inside a file,
not a file move.)

## Tech stack

TypeScript + Vite; RTK/React untouched (no slice touched). WebGPU renderer
(`earthRenderer.ts`) touched only for the setter rename. `tools/textures/` is a
Node build tool that already imports from `src/`. Vitest.

## Tasks

### Task 1 — New identity types + composite-key builder

**Files:** `src/@types/data/TextureKind.d.ts` (new), `src/@types/data/BodyTextureKey.d.ts` (new),
`src/@types/data/BodyTextureSlotKey.d.ts` (new), `src/utils/scene/bodyTextureSlotKey.ts` (new),
`tests/utils/scene/bodyTextureSlotKey.test.ts` (new),
`src/@types/loading/BodyTextureReq.d.ts` (modify).

**Types (one per file, `type` not `interface`):**
```ts
export type TextureKind = 'surface' | 'night' | 'clouds' | 'material' | 'normal';
export type BodyTextureKey = { readonly bodyId: BodyTextureId | RingTextureId; readonly kind: TextureKind };
export type BodyTextureSlotKey = `${BodyTextureId | RingTextureId}:${TextureKind}`;
```
**Helper:** `bodyTextureSlotKey(bodyId: BodyTextureId | RingTextureId, kind: TextureKind): BodyTextureSlotKey`
— joins with `:`. One function, filename = symbol name.

**`BodyTextureReq`** (`BodyTextureReq.d.ts:19-22`) gains `kind`:
```ts
export type BodyTextureReq = { readonly bodyId: BodyTextureId | RingTextureId; readonly kind: TextureKind; readonly tier: Tier };
```
Update its docblock (the `saturn-ring` filename note) to mention the kind segment.

- [ ] Add test `bodyTextureSlotKey joins body and kind with a colon` asserting
      `bodyTextureSlotKey('earth', 'surface') === 'earth:surface'` and
      `bodyTextureSlotKey('saturn-ring', 'surface') === 'saturn-ring:surface'`
      (hand-computed, not re-derived from the source expression).
- [ ] No standalone test for the pure type aliases (`tsc` proves them; testing.md
      "no runtime type tests").
- [ ] `npm test -- bodyTextureSlotKey` → passes.

### Task 2 — Shared filename helper (the coupling un-braid)

**Files:** `src/utils/scene/bodyTextureFilename.ts` (new),
`tests/utils/scene/bodyTextureFilename.test.ts` (new).

**Signature:** `bodyTextureFilename(bodyId: BodyTextureId | RingTextureId, kind: TextureKind, tier: Tier): string`
**Behaviour:** returns `${bodyId}${seg}-${px}.${ext}` where
`seg = kind === 'surface' ? '' : \`-${kind}\`` (the **surface = default, unsegmented**
convention — see Coupling: keeps existing deployed names, zero data op),
`px = tierToTexturePx(tier)` (`tierToTexturePx.ts`), and
`ext = bodyId === 'saturn-ring' ? 'png' : 'jpg'` (the ring carries alpha; every
sphere is an opaque JPG — same rule as `bodyTextureFetcher.ts:40`). One function
per file.

This helper is the single home for the on-disk name; Tasks 3 and 7 make the
runtime fetcher and the build tool both call it, so the name can never drift
across the two sides (the coupling above becomes structurally impossible to
break).

- [ ] Add test `bodyTextureFilename leaves the surface kind unsegmented` asserting
      `bodyTextureFilename('mars', 'surface', 'small') === 'mars-2048.jpg'` and
      `bodyTextureFilename('earth', 'surface', 'large') === 'earth-8192.jpg'` — the
      **byte-identical-to-today** contract that makes Prep 1 a zero-data-op refactor
      (hand-computed px from the `small=2048 / large=8192` ladder).
- [ ] Add test `bodyTextureFilename segments a non-surface kind` asserting
      `bodyTextureFilename('earth', 'night', 'large') === 'earth-night-8192.jpg'` —
      the future feature-map naming (no such map ships in Prep 1, but the helper's
      branch is exercised).
- [ ] Add test `bodyTextureFilename uses PNG for the ring strip` asserting
      `bodyTextureFilename('saturn-ring', 'surface', 'large') === 'saturn-ring-8192.png'`.
- [ ] `npm test -- bodyTextureFilename` → passes.

### Task 3 — Fetcher consumes kind via the shared helper

**Files:** `src/services/loading/fetchers/bodyTextureFetcher.ts` (modify, ~line 36-46),
`tests/services/loading/fetchers/bodyTextureFetcher.test.ts` (modify).

Replace the inline `filename` construction (`bodyTextureFetcher.ts:40-41`) with
`bodyTextureFilename(req.bodyId, req.kind, req.tier)`. The `saturn-ring` PNG
branch moves into the helper (Task 2), so the fetcher no longer special-cases the
ring id. Update the module docblock (it currently narrates the inline
`${bodyId}-${px}.jpg` and the ring branch).

- [ ] Update test `requests the tier-sized JPG url` to pass
      `{ bodyId: 'mars', kind: 'surface', tier: 'small' }` and assert the url ends
      with `images/textures/mars-2048.jpg` (unchanged from today — surface is
      unsegmented, proving the behavior-neutral filename).
- [ ] Update test `requests the ring PNG` to pass
      `{ bodyId: 'saturn-ring', kind: 'surface', tier: 'large' }` and assert the url
      ends with `images/textures/saturn-ring-8192.png` (unchanged).
- [ ] `npm test -- bodyTextureFetcher` → passes.

### Task 4 — Registry expresses per-`(body,kind)` tier ceilings

**Files:** `src/@types/scene/BodyTextureSpec.d.ts` (modify),
`src/data/bodies/bodyTextureRegistry.ts` (modify, the 13 rows),
`tools/textures/emittedTiersForBody.ts` (modify),
`src/services/engine/wiring/assetWiring.ts` (`ceilingOf`, ~line 159-163),
`tests/data/bodies/bodyTextureRegistry.test.ts` (modify).

**`BodyTextureSpec`** (`BodyTextureSpec.d.ts:24-33`): replace `maxTier: Tier` with
```ts
readonly kinds: Readonly<Partial<Record<TextureKind, Tier>>>;
```
Each present kind maps to its tier ceiling. Update the `maxTier` docblock
(§9.2 rationale: near-featureless discs cap low; masks may cap lower than colour).

**Registry rows** (`bodyTextureRegistry.ts:49-74`): every row's `maxTier: X`
becomes `kinds: { surface: X }` (behavior-neutral — the surface ceiling equals
the old `maxTier`). e.g. `earth: { bodyId: 'earth', kinds: { surface: 'large' }, provenance: 'nasa' }`.

**`emittedTiersForBody`** (`emittedTiersForBody.ts:34-37`): reads `.kinds` instead
of `.maxTier`. Signature gains a kind: `emittedTiersForBody(id, kind: TextureKind)`
→ slices the ladder to `spec.kinds[kind]`. (Callers in `buildTextures.ts` pass
`'surface'` — Task 7.)

**`ceilingOf`** (`assetWiring.ts:159-163`): gains a kind param, reads
`BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]`.

- [ ] Update `structural invariants` in `bodyTextureRegistry.test.ts`: keep the
      `spec.bodyId === key` and grayscale-tint invariants; replace any `maxTier`
      reference with a check that every row's `kinds` has a `surface` entry
      (`spec.kinds.surface !== undefined`) — the day-map contract every body must
      satisfy. Do **not** restate the full per-body kind/ceiling table (registry
      restatement, testing.md).
- [ ] `npm test -- bodyTextureRegistry` → passes; `npm run typecheck` clean
      (build-side `emittedTiersForBody` callers updated in Task 7 must also compile).

### Task 5 — Enumerate `(body,kind)` entries; route the composite key home

**Files:** `src/data/bodies/bodyTextureKeys.ts` (modify),
`src/utils/scene/isBodyTextureKey.ts` (modify),
`src/@types/loading/AssetKey.d.ts` (modify),
`src/@types/engine/state/EngineAssetSlots.d.ts` (modify, line 167),
`tests/data/bodies/bodyTextureKeys.test.ts` (new — see below).

**`ALL_BODY_TEXTURE_KEYS`** (`bodyTextureKeys.ts:18-21`): becomes
`readonly BodyTextureKey[]` — for each registry body, one entry per
`Object.keys(spec.kinds)`; plus for each `SCENE_RINGS` ring, `{ bodyId: ring.textureId, kind: 'surface' }`.
Today this yields 14 entries (13 bodies × `surface` + 1 ring × `surface`) —
behavior-neutral vs the current 14 keys. Update the module docblock.

**`isBodyTextureKey`** (`isBodyTextureKey.ts:9,25-27`): build the membership Set
from the composite strings — `new Set(ALL_BODY_TEXTURE_KEYS.map((e) => bodyTextureSlotKey(e.bodyId, e.kind)))`
— and narrow to `BodyTextureSlotKey` (was `BodyTextureId | RingTextureId`).

**`AssetKey`** (`AssetKey.d.ts` union tail): replace `| BodyTextureId | RingTextureId`
with `| BodyTextureSlotKey`. Update the docblock paragraph describing the
`bodyTextures` family (it currently says the keys are body/ring ids).

**`EngineAssetSlots.bodyTextures`** (`EngineAssetSlots.d.ts:167`):
`Map<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>`.

- [ ] Add test `ALL_BODY_TEXTURE_KEYS enumerates one surface entry per textured body plus the ring`:
      assert every entry's `kind === 'surface'` today, and that the set of
      `bodyId`s equals the registry keys ∪ ring texture ids (structural invariant —
      catches a body dropped from the enumeration; not a count restatement).
- [ ] `npm run typecheck` clean (the `slotFor` / `installLoadProgress` routing
      through `isBodyTextureKey` must still narrow).

### Task 6 — Wiring row + commit dispatch carry `(bodyId, kind)`; Earth setter is kind-aware

**Files:** `src/services/engine/wiring/assetWiring.ts` (`bodyTextureRow`, ~line 153-185, 291),
`src/services/engine/wiring/bodyTextureSlotRegistry.ts` (modify),
`src/@types/rendering/EarthRenderer.d.ts` (modify),
`src/services/gpu/renderers/bodies/earthRenderer.ts` (modify),
`tests/services/engine/wiring/assetWiring.test.ts` (modify),
`tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts` (modify).

**`bodyTextureRow`** (`assetWiring.ts:176-185`): takes a `BodyTextureKey` entry.
`key: bodyTextureSlotKey(entry.bodyId, entry.kind)`; `req: (tier) => ({ bodyId: entry.bodyId, kind: entry.kind, tier: clampTier(tier, ceilingOf(entry.bodyId, entry.kind)) })`;
`demand`/`release` read `entry.bodyId` (via `bodyPosOf` / `loadRadiusMpc` /
`hostBodyId`) exactly as today. The spread at `assetWiring.ts:291` maps over the
entries.

**`commitBodyTexture`** (`bodyTextureSlotRegistry.ts:79-95`) and
`wireBodyTextureSlots` (`:114-126`): iterate entries; mint each slot at
`bodyTextureSlotKey(entry.bodyId, entry.kind)`; the commit closure captures the
structured `entry` and dispatches on `entry.bodyId` + `entry.kind`:
```
(earth,  kind)         → earthRenderer.setMap(kind, bitmap)   // clouds later → cloudShellRenderer (PR D)
(other,  'surface')    → texturedBodyRenderer.setTexture(bodyId, bitmap)
(ring,   'surface')    → texturedBodyRenderer.setRingTexture(hostBodyId(bodyId), …) + ringRenderer.setTexture
```
`releaseBodyTexture` keys off `entry.bodyId` (`isTexturedBodyKey`) as today. The
dispatch reads `entry`, never parses the composite string. Leave a comment naming
the `clouds → cloudShellRenderer` extension point (added in PR D) — do **not**
wire it now (no `cloudShellRenderer` exists yet).

**`EarthRenderer.setTexture` → `setMap`** (`EarthRenderer.d.ts:30-37`,
`earthRenderer.ts:283-312,336-341`): rename to
`setMap(kind: TextureKind, bitmap: ImageBitmap): void`. Implement the `'surface'`
case as the current `setTexture` body verbatim (upload → mip → rebuild bind
group). Other kinds are inert in Prep 1 — the night/cloud/material/normal bindings
are PRs A–E, which just add cases. **Do not** add extra GPU bindings, textures, or
bind-group entries here. Grep for other `earthRenderer.setTexture` callers
(expect only the commit dispatch + the test) and update them.

- [ ] Update `assetWiring.test.ts` (line 128-132): iterate the entries; for each,
      `rowFor(bodyTextureSlotKey(e.bodyId, e.kind)).req('large')` `toMatchObject
      { bodyId: e.bodyId, kind: e.kind }`. Update the `rowFor('earth')` proximity
      test (line 274-292) to `rowFor('earth:surface')` — the demand/release
      hysteresis assertions are unchanged.
- [ ] Update `bodyTextureSlotRegistry.test.ts`: the mint test keys become the
      composite strings (`state.assetSlots.bodyTextures.get('earth:surface')`,
      `…get('mars:surface')`, `…get('saturn-ring:surface')`); `slot.load(...)` reqs
      gain `kind: 'surface'`; the Earth commit assertion becomes
      `expect(gpu.earthRenderer.setMap).toHaveBeenCalledWith('surface', bitmap)`.
      Non-Earth `setTexture(bodyId, bitmap)` and ring `setRingTexture('saturn', bitmap)`
      assertions are otherwise unchanged. Keep the "the 14 slots" count sanity line.
- [ ] `npm test -- assetWiring bodyTextureSlotRegistry` → passes; `npm run typecheck` clean.

### Task 7 — Build tool emits the name via the shared helper (byte-identical)

**Files:** `tools/textures/buildTextures.ts` (modify, ~line 217-251).

**`buildTextures`** (`buildTextures.ts:233,247`): replace the two inline output
names (`${id}-${px}.jpg`, `saturn-ring-${px}.png`) with
`bodyTextureFilename(id, 'surface', tier)` — the same helper the runtime fetcher
calls (Task 2), so build and runtime names cannot drift. Because `surface` is
unsegmented (Task 2), the emitted names are **byte-identical to today**
(`${id}-${px}.jpg` / `saturn-ring-${px}.png`). The tier loop reads
`emittedTiersForBody(id, 'surface')` (Task 4). Update the module docblock's
"one sharp path" narration (it names the old `<bodyId>-<px>.jpg` output — the name
is unchanged, but it now comes from the shared helper).

No new test: the filename contract is pinned by Task 2's `bodyTextureFilename`
test, and both sides now call that one helper — a `buildTextures` unit test
asserting the constructed name would either re-run sharp or restate the helper
(mirror). Compile-gating (both import the helper) is the guarantee.

**No rebuild, no re-sync.** Surface output is byte-identical, so the existing
`public/data/images/textures/*` and the deployed R2 objects stay valid — Prep 1
ships **zero data ops**. (Feature PRs A–E fetch + build + sync their new
`-${kind}-` maps when they land.)

- [ ] After the edit, a fresh `npm run build-textures` (optional, main worktree)
      emits the **same filenames** as before — spot-check one (`mars-8192.jpg`,
      `saturn-ring-8192.png`) to confirm no rename slipped in. No `sync-r2-secure`.

## Definition of done

- [ ] `npm run build` (tsc + vite) and `npm run typecheck` clean (src + tools).
- [ ] `npm test` green — the suite stays green (600+ files).
- [ ] Every existing body still textures through `(id, 'surface')` — the fetcher,
      slot-registry, and assetWiring tests prove the surface path end-to-end.
- [ ] No new GPU bindings for night/cloud/material/normal (those are PRs A–E);
      `earthRenderer.setMap` implements only `'surface'`.
- [ ] Zero data ops: the build tool emits byte-identical surface filenames, so no
      rebuild / R2 re-sync / CDN purge is required (Task 7).
- [ ] Docs: this plan + the spec ride the **first prep PR** (grill Q10 / spec §12
      — not a separate docs PR).
</content>
</invoke>
