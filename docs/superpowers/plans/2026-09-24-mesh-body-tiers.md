# Mesh-body tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesh bodies ship per-tier assets (geometry + textures), and the runtime fetches the largest tier at or below the app tier.

**Architecture:** A straight copy of the body-texture tier machinery. Each mesh source names one raw GLB per tier it has; `buildMeshes` bakes every tier to `meshes/<key>-<px>.*` with textures capped at `tierToTexturePx(tier)`. The generated `MeshAssetRow` records `tierCeiling`, and `meshBodyRow.req(tier)` sends `clampTier(tier, tierCeiling)`, exactly as `bodyTextureRow` does (`src/services/engine/wiring/assetWiring.ts:71-90`).

**Tech Stack:** TS, glTF-Transform, sharp, Vitest.

**Spec:** none — the user ruled plan-only on 2026-09-24; the design lives here. Context: `docs/backlog/2026-09-17-soendermarken-2019-mesh-body-on-earth.md` (the "Tiers" bullet).

**Ground preparation:** this PR *is* the ground preparation for the Søndermarken mesh body (PR 2: that body's 2K-decimated small tier + 4K medium tier, terrain hole, placement). No further prep needed — the body-texture tier path (`clampTier`, `tierToTexturePx`, `req(tier)`) already exists to copy.

## Rulings (user, 2026-09-24)

- Tiers vary geometry AND textures (PR 2's small tier is decimated).
- Each body lists the tiers it has; the fetcher gets the largest ≤ the app tier → implemented as a contiguous-from-`small` source set + `tierCeiling` + `clampTier`.
- Every file is renamed to the px-suffixed form, existing bodies included (`whale.mesh` → `whale-2048.mesh`); no "unsuffixed = small" special case. One R2 re-sync + prune of the old names.

## Global Constraints

- File names: `meshes/<key>-<px>.mesh`, `meshes/<key>-<px><slot.suffix>.webp` (`_albedo`, `_mr`, `_normal`), with `px = tierToTexturePx(tier)` (small 2048, medium 4096, large 8192). The contact mask stays UNTIERED: `meshes/<key>_contact.webp`.
- Every existing body in `MESH_SOURCES` has exactly one tier, `small` (the Blender prebake bakes 2048², `tools/meshes/prebake/meshPrebake.py:18`).
- `MESH_TRIANGLE_BUDGET` (600k) applies per tier file.
- The R2 allow-list regexes (`tools/deploy/r2/allowDataFile.ts:19-20`) already admit `-2048` — no change there.

## Review Focus

1. **A tier request above the ceiling** (a `large` app on a small-only body) must fetch the `small` files, never 404 → pinned in Task 2's `req` test.
2. **A tier change while the mesh is resident** must re-fetch the new tier's files, as body textures already do → pinned in Task 2 (the slot's `req` changes, so `reevaluateDemand` re-triggers; assert via the existing wiring-test pattern).
3. **A source whose tiers skip a rung** (`small` + `large`, no `medium`) would make a `medium` request 404 → Task 1 refuses it at build time.
4. **Per-tier metrics drifting** (a decimated small tier with a different `groundOffsetM` would seat a rover at a different height per tier) → the row takes its metrics from the CEILING tier only; Task 1 test pins which tier they come from.
5. **Main's `public/data` clobbered by the rebake** — this worktree's `public/data` is a symlink to main's; a bake through it renames main's live files under main's running dev server → Task 3 replaces the symlink first.

---

### Task 1: Build per-tier mesh files

**review: yes** (binary asset pipeline; generated-table contract)

**Files:**
- Modify: `tools/utils/io/meshSources.ts` — `native: RawDataKey` → `tiers`
- Modify: `tools/meshes/buildMeshes.ts` — `MeshBuildTarget`, `bake`, `writeTexture`, `main`; delete `TEXTURE_SIZE_BUDGET`
- Modify: `tools/meshes/meshAssetRowFields.ts` — drop `path`, add `tierCeiling`
- Modify: `tests/tools/meshes/buildMeshes.test.ts`, `tests/tools/meshes/meshAssetsRoundTrip.test.ts` (fixtures only)

**Interfaces — Produces:**

```ts
// meshSources.ts
export type MeshSourceEntry = {
  /** One raw GLB per tier this body ships; must be contiguous from `small`. */
  readonly tiers: Readonly<Partial<Record<Tier, RawDataKey>>>;
  readonly licence: string;
  readonly attribution: string;
  readonly bodyFromSource?: Mat3;
};

// buildMeshes.ts
export type MeshBuildTarget = {
  readonly key: string;
  readonly glbPaths: Readonly<Partial<Record<Tier, string>>>; // replaces glbPath
  readonly source: string;       // the CEILING tier's RAW_DATA upstream
  readonly licence: string;
  readonly attribution: string;
  readonly bodyFromSource?: Mat3;
  readonly groundUp?: Vec3;
};

// MeshAssetRow (generated): `path` removed; added
readonly tierCeiling: Tier;
```

Behaviour:
- `bake` runs the existing per-GLB pipeline (ground-stamp check, one material, triangle budget, `mergeGeometry`, slot textures) once per tier, writing `<key>-<px>.mesh` and `<key>-<px><suffix>.webp`; `writeTexture` takes the tier's `tierToTexturePx` as its resize edge.
- Row metrics (`boundingRadiusM`, `groundOffsetM`, `meanAlbedo`, `triangleCount`, `substituted`, `contactDecal`) and the contact mask come from the CEILING tier's GLB only.
- A `tiers` set that is not `TIER_LADDER` prefix-contiguous from `small` throws: `buildMeshes: <key> ships tiers [small, large] — tiers must run contiguously from small`.
- `main` maps each `MESH_SOURCES` entry's `tiers` through `rawDataPath`; every existing entry becomes `tiers: { small: 'meshes.<key>' }` (same raw key as today's `native`). `buildMeshes`'s stderr line prints `<key>` and its tiers instead of `row.path`.
- `path` has no runtime reader (grep `\.path` under `src/` — only the generated table carries it); delete it from `MESH_ASSET_ROW_FIELDS`.

Tests (existing fixtures build GLBs in-memory; give each target `glbPaths: { small: … }`):

- [ ] `it('writes <key>-<px> geometry and slot textures for every source tier')` — a two-tier target (`small`, `medium`) → both `k-2048.*` and `k-4096.*` exist; no unsuffixed `k.mesh`.
- [ ] `it('caps each tier's textures at tierToTexturePx(tier)')` — a 4096² source albedo → the small file is 2048 wide, the medium 4096 wide.
- [ ] `it('takes row metrics from the ceiling tier')` — small and medium GLBs with different lowest vertices → `groundOffsetM` equals the medium one; `tierCeiling === 'medium'`.
- [ ] `it('refuses a tier set that skips a rung')` — `{ small, large }` → throws the message above.
- [ ] `it('keeps the contact mask untiered')` — a seated two-tier target writes exactly one `k_contact.webp`.
- [ ] Update every existing test's target to `glbPaths: { small }` and every asserted path to the `-2048` form; `writes every MESH_TEXTURE_SLOTS suffix…` keeps its intent.
- [ ] `npm test -- tests/tools/meshes` green; `npm run typecheck:fast` green.
- [ ] Commit.

### Task 2: Fetch the clamped tier at runtime

**Files:**
- Modify: `src/@types/loading/MeshReq.d.ts`
- Modify: `src/services/loading/fetchers/meshFetcher.ts:38-71`
- Modify: `src/services/engine/wiring/assetWiring.ts:98-120` (`meshBodyRow`)
- Create: `src/utils/meshBodies/meshTierPrefix.ts` (one function per utils file)
- Modify: `tests/services/loading/fetchers/meshFetcher.test.ts`, `tests/services/engine/wiring/assetWiring.test.ts`

**Interfaces — Consumes:** `MeshAssetRow.tierCeiling` (Task 1). **Produces:**

```ts
export type MeshReq = { readonly meshKey: string; readonly tier: Tier };
/** `meshes/<meshKey>-<px>` — the stem every tiered mesh file hangs off. */
export function meshTierPrefix(meshKey: string, tier: Tier): string;
```

- `meshFetcher` fetches `${meshTierPrefix(req.meshKey, req.tier)}.mesh` and `…${slot.suffix}.webp`; the contact mask keeps `meshes/${meshKey}_contact.webp`.
- `meshBodyRow.req` becomes `(tier) => ({ meshKey, tier: clampTier(tier, MESH_ASSETS[meshKey]!.tierCeiling) })` — mirror `bodyTextureRow`'s shape and its doc line.

Tests:

- [ ] `meshFetcher`: `it('fetches the requested tier's geometry and textures')` — `{ meshKey: 'curiosity', tier: 'small' }` → the fetch URLs end `meshes/curiosity-2048.mesh` / `_albedo.webp` …; `it('fetches the contact mask untiered')` → `meshes/curiosity_contact.webp`.
- [ ] `assetWiring`: `it('clamps a mesh body's tier to its tierCeiling')` — `req('large')` on a small-ceiling body → `tier: 'small'`.
- [ ] `assetWiring` (Review Focus 2): a tier flip on a resident mesh body changes its `req` → re-trigger, following how the existing file asserts it for body textures (if the file has no such pattern, assert `req('small')` ≠ `req('medium')` on a medium-ceiling fixture row instead and say so in the commit).
- [ ] `npm test` green; `npm run typecheck:fast` green.
- [ ] Commit.

### Task 3: Rebake the real assets and regenerate the table

**Files:**
- Modify (generated): `src/data/bodies/meshAssets.generated.ts`
- Outputs (gitignored): `public/data/meshes/*-2048.*`, `public/data/manifest.json`

- [ ] **First**, un-share `public/data`: it is a symlink to main's (`readlink public/data`). Replace it with an APFS clone so the bake cannot touch main's live files: `rm public/data && cp -Rc /Users/rulkens/Development/js/skymap/public/data public/data` (clone = no extra disk).
- [ ] Raw GLBs: `rawDataPath` resolves against cwd; if `data/raw/meshes/` is missing in this worktree, symlink it from main (`ln -s /Users/rulkens/Development/js/skymap/data/raw/meshes data/raw/meshes`, creating `data/raw/` first).
- [ ] `npm run build-meshes` → every key writes `-2048` files; the generated table gains `tierCeiling: 'small'` and loses `path`; all other row values byte-identical to before (diff the table).
- [ ] Remove the now-orphaned unsuffixed `meshes/<key>.*` (+hash) files from THIS worktree's `public/data/meshes`, then regenerate the manifest the way `npm run dev`'s predev does (check `package.json` for the script name).
- [ ] `npm test` green (the round-trip test pins the committed table to the serializer).
- [ ] Commit the generated table.

## Definition of Done

- **Deliverables:** `MeshSourceEntry.tiers`, `MeshBuildTarget.glbPaths`, `MeshAssetRow.tierCeiling` (and `path` gone), `MeshReq.tier`, `meshTierPrefix`, regenerated `meshAssets.generated.ts`; every mesh file on disk px-suffixed.
- **Smoke (user eye-check, dev server in this worktree):** Curiosity and Perseverance on Mars render textured and seated with contact shadows; Hubble and a Voyager render textured; the whale and petunias render; the Network tab shows `-2048` mesh URLs; toggling the tier (small ↔ medium via the tier route) keeps every mesh loaded (medium clamps to small).
- **Deploy (user, before merging — main's deploy will request the new names):** `sync-r2` the renamed mesh files; after the deploy, prune the unsuffixed `meshes/<key>.*` objects from R2 and from main's `public/data/meshes`.
- **Deferral boundary:** no body gains a second tier here — Søndermarken's `small` (decimated 2K) and `medium` (4K) sources, meshoptimizer decimation, computed normals, the terrain hole and placement are PR 2. No change to the Blender prebake's 2048 atlas.
