# Photoreal Earth B — Night Lights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blend a NASA Black Marble (VIIRS) **night map** into Earth's surface fragment so city lights appear on the dark hemisphere and fade through the terminator, dimmed where clouds later cover them — the acceptance win is **city lights on the dark side** (spec §12 row B).

**Architecture:** A small growth on plan A's PBR surface. The night contribution is **emissive** (added after the PBR day term, not lit), scaled by the night factor `(1 − dayFactor)` where `dayFactor` tracks the Lambert/Sun term (`NoL`). The blend maths live in a new `shaders/lib/nightLights.wesl` (Earth composes it now; body-agnostic in shape). The night map flows through the **same** `(body, kind)` texture family + single `TEXTURE_SOURCES` table plan A's preps established — adding `night` is one registry row, one source row, one `kinds` entry, and the renderer binding + `setMap` case. Night is **sRGB colour** (JPG), so it is NOT a linear kind and needs no new build capability — it rides the existing sRGB `writeBodyTier` path. **No uniform change:** the day/night factor derives from the existing sun term; the night-brightness knob is a named WESL module const, so `EarthSurfaceUniforms` and `packEarthSurfaceUniforms` are untouched. The **cloud-occlusion seam** (`night × (1 − cloudAlpha)`) is exposed as a `nightLights` parameter now and passed `0.0` — plan D binds the cloud texture and passes the real sample; no cloud binding lands in B.

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders, `sharp`/libvips for the offline texture build, Vitest.

**Spec:** docs/superpowers/specs/2026-07-18-photoreal-earth-design.md (§6, §9 night row)

**Depends on:** plan A (`docs/superpowers/plans/2026-07-19-photoreal-earth-a-cubesphere-pbr-surface.md`) — `EarthSurfaceUniforms` (112 bytes, unchanged here), the PBR surface fragment (`earth/fragment.wesl` composing `pbrDirect`), the `(body, kind)` material-wiring pattern, the `isLinearTextureKind` single-home predicate, and the fetch/build `(body, kind)` iteration rewire (LANDMINE — already fixed in A). **All line citations below assume plan A has landed**; where A shifts a line, read the current file — do not trust a stale offset.

### Header notes — resolved decisions (do not re-litigate)

- **Night is sRGB colour, JPG, NOT linear.** Do NOT add `'night'` to `isLinearTextureKind` (plan A's single home for the sRGB/linear axis) — it stays JPG + `rgba8unorm-srgb` + colour-managed decode, exactly like `surface`. Adding it would 404 the map (PNG name) and gamma-shift the lights.
- **No new uniform scalar.** Spec §6's night factor is `(1 − dayFactor)`, and `dayFactor` is the Lambert/Sun term the fragment already has in scope (`n`, `l = u.sunDirLocal` from plan A Task 8). The night-brightness multiplier is a **named WESL const** (`NIGHT_BRIGHTNESS`) in `nightLights.wesl`, matching plan A's `MIN_ROUGHNESS`/`OCEAN_ROUGHNESS` pattern in `pbr.wesl`. `EarthSurfaceUniforms`/`packEarthSurfaceUniforms` and the `_pad0`/`_pad1` slots are **untouched** — plan C/D drafters can rely on that.
- **The fetch/build iteration is already rewired (plan A Task 6).** Both `fetchTextures` and `buildTextures` iterate `(bodyId, kind)` over `ALL_BODY_TEXTURE_KEYS` / `textureBuildEntries()`. Plan B only **adds** a `TEXTURE_SOURCES.earth.night` row + a `kinds.night` entry; the iteration picks up the new pair automatically, and plan A's drift tests go red if it ever regresses. **Do NOT re-plan the rewire** — Task 2 adds a one-line assertion that `(earth,'night')` is covered, nothing more.
- **The build writer dispatch routes `night` to the sRGB path.** In plan A's rewired `buildTextures` loop, non-linear kinds write via `writeBodyTier` (JPG/sRGB) and linear kinds via `writeLinearTier` (PNG). `night` is non-linear → `writeBodyTier`. If plan A implemented the dispatch as `isLinearTextureKind(kind) ? writeLinearTier : writeBodyTier`, `night` needs **zero** build edit; if it is an explicit per-kind switch, add the `night → writeBodyTier` branch. Either way the contract is: `night → writeBodyTier`.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **Night blend (spec §6):** the Black Marble night map is **emissive — added, not lit**, blended in by the night factor `(1 − dayFactor)` where `dayFactor` tracks the Lambert/Sun term (`NoL`), so lights appear only on the dark hemisphere and fade smoothly through the terminator.
- **Cloud-occlusion seam (spec §6, §7.3):** the night contribution is multiplied by `(1 − cloudAlpha)`. In plan B `cloudAlpha = 0.0` (no cloud texture bound). Plan D samples the cloud map at the fragment's own UV and passes the real alpha. The seam is a `nightLights` parameter so plan D adds an argument value, not a signature change.
- **Texture data (spec §9.1):** night is **sRGB**, **8K** (`kinds.night = 'large'`), JPG. NOT a linear kind.
- **Named tunables (spec §11):** `NIGHT_BRIGHTNESS` + the terminator-fade band are named WESL module consts — NO adaptive-quality machinery, NO uniform field.
- **Downloads (spec §9.4):** the Black Marble source fetch (~10–20 MB) announces its size + exact URL and **gets user go-ahead BEFORE fetching** (announce-big-downloads). Nothing downloads except in the explicit fetch task (Task 4). Verify the exact upstream URL + native dimensions live before writing the registry row (verify-external-data-before-spec).
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name); deep relative imports, no barrels; didactic multi-paragraph module headers; WESL comments use single quotes (NO backticks), WESL imports use literal `package::` paths; raw-data paths via `rawDataPath('<key>')`; stage specific paths on commit (never `git add -A`). No TS file moves are expected in this plan.

---

## Task 1: `lib/nightLights.wesl` — day/night blend + cloud-occlusion seam

**Files:**

- Create `src/services/gpu/shaders/lib/nightLights.wesl`

**Interfaces — Produces (WESL, `package::lib::nightLights::*`):**

```wgsl
// Emissive city-lights contribution to ADD to the lit surface colour (spec §6).
//   nightColour : the Black Marble night map sample (linear rgb, from an sRGB texture).
//   NoL         : clamped sun/surface Lambert term — 1 at the sub-solar point, 0 on the dark side.
//   cloudAlpha  : cloud coverage at the fragment's own uv — 0.0 in plan B; plan D passes the real sample (spec §7.3).
// Returns nightColour * (1 - dayFactor(NoL)) * (1 - cloudAlpha) * NIGHT_BRIGHTNESS.
fn nightLights(nightColour: vec3<f32>, NoL: f32, cloudAlpha: f32) -> vec3<f32>;
```

- `dayFactor(NoL)` is a `smoothstep` over `NoL` across a named terminator band (`NIGHT_TERMINATOR_LO`/`NIGHT_TERMINATOR_HI`), so `(1 − dayFactor)` fades the lights smoothly from full on the dark side to zero past the terminator rather than a hard cut. Keep this the single home for the terminator-fade shape — the surface fragment passes raw `NoL`, not a pre-shaped factor.
- Named tunable consts local to this module (spec §11): `NIGHT_BRIGHTNESS` (emissive scale into the HDR foreground target), `NIGHT_TERMINATOR_LO`, `NIGHT_TERMINATOR_HI` (the `smoothstep` band). No adaptive machinery, no uniform field.
- Comments single-quoted, no backticks. This module runs on the GPU and is **not** unit-testable; its correctness is verified visually via the Task 3 fragment (Task 4). Do NOT add a runtime-type or source-grep test for it.
- **Cloud coupling (state explicitly in the header):** `cloudAlpha` is the plan-D seam — B passes `0.0` so the function shape is final and D only supplies the sampled value. No cloud texture is bound in plan B.

**Steps:**

- [ ] Write `lib/nightLights.wesl` with `nightLights` + a `dayFactor` helper + a didactic header (emissive-not-lit, the `(1 − dayFactor)` night weight, the terminator `smoothstep` band, and the `cloudAlpha`-is-the-plan-D-seam note).
- [ ] `npm run build` clean (the module links; no consumer yet — imported in Task 3).
- [ ] Commit (`src/services/gpu/shaders/lib/nightLights.wesl`).

---

## Task 2: Night map data chain — registry, source, kind ceiling

**Files:**

- Modify `tools/utils/io/rawDataRegistry.ts` (Black Marble source row)
- Modify `tools/utils/io/textureSources.ts` (`earth.night` source row)
- Modify `src/data/bodies/bodyTextureRegistry.ts` (`earth.kinds.night`)
- Modify `data/raw/textures/README.md` (provenance for the night map)
- Modify `tests/utils/scene/bodyTextureFilename.test.ts`
- Modify `tools/textures/buildTextures.ts` **only if** the writer dispatch is an explicit per-kind switch (see header note) — else no edit
- Modify `tests/tools/textures/buildTextures.test.ts` (the drift test now covers `night`; add a writer-dispatch assertion if a switch branch was added)

**Interfaces — Consumes:** plan A's `isLinearTextureKind` (night → `false`), `bodyTextureFilename`, the `(body, kind)` fetch/build iteration + drift tests. **Produces:** the `(earth, 'night')` source rows.

- **`rawDataRegistry` row:** add `'textures.earthNight'` (`source: 'gitignored'`, `upstream` = the verified NASA Black Marble URL, `fetcher: 'tools/fetch/fetchTextures.ts'`, `readme: 'textures.readme'`), modeled on `textures.nasaBmng` (`rawDataRegistry.ts:582-592`). **Verify the exact URL + native dimensions before writing the row** — Task 4 confirms it live. The `.sha256` sidecar + README are already covered by the committed globs (no `.gitignore` edit).
- **`TEXTURE_SOURCES.earth`:** add `night: { native: 'textures.earthNight' }` (`textureSources.ts:68`). **No `dev` variant** (full-pull-only, like plan A's `material`) — so `--dev` fetch/build skip night; the Task 4 visual check needs the full night source. The `satisfies` check + plan A's drift tests now enforce the fetch/build cover it.
- **`BODY_TEXTURE_REGISTRY.earth`:** add `night: 'large'` to `kinds` (`bodyTextureRegistry.ts:56`) — the **8K ceiling** (spec §9.1). This one edit auto-mints the slot + `ASSET_WIRING` proximity row + fetcher URL via `ALL_BODY_TEXTURE_KEYS` (`bodyTextureKeys.ts:22-29`) — no wiring edit, no dispatch edit (commit routes every Earth kind to `earthRenderer.setMap(kind, …)`, `bodyTextureSlotRegistry.ts:86-91`).
- **Filename (no code edit):** `bodyTextureFilename('earth','night','large')` is `'earth-night-8192.jpg'` — night is non-linear (JPG) and non-surface (segmented). Plan A's `bodyTextureFilename` already produces this via `isLinearTextureKind`; this task only adds the assertion.
- **Build writer dispatch:** confirm `night` routes to `writeBodyTier` (sRGB/JPG). If plan A's loop dispatches by `isLinearTextureKind(kind)`, no edit. If it is an explicit per-kind switch, add the `night → writeBodyTier` branch (see header note).

**Steps (TDD):**

- [ ] Extend `bodyTextureFilename.test.ts`: `a non-surface sRGB kind stays JPG` → `bodyTextureFilename('earth','night','large') === 'earth-night-8192.jpg'` (fails if `night` were treated as linear → PNG → runtime 404). Keep the surface/ring/material cases green.
- [ ] In `buildTextures.test.ts`: assert `textureBuildEntries` now contains `{ bodyId: 'earth', kind: 'night' }` (the plan-A drift test's set derives from `TEXTURE_SOURCES`; this pins that the new source row is picked up by the already-rewired iteration — the required one-line assertion, NOT a re-fix). If a writer-dispatch switch branch was added, assert `night` selects the sRGB (`writeBodyTier`) path — e.g. via the same predicate the filename uses (`!isLinearTextureKind('night')`).
- [ ] Add the registry/source/kinds rows + the README provenance stub (URL, byte layout / dimensions, fetch-date placeholder filled in Task 4).
- [ ] `npm test -- bodyTextureFilename buildTextures fetchTextures textureSources` green; `npx tsc --noEmit` + `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [ ] Commit (stage each path explicitly).

---

## Task 3: Bind + sample the night map; compose `nightLights` in the surface fragment

**Files:**

- Modify `src/services/gpu/renderers/bodies/earthRenderer.ts`
- Modify `src/services/gpu/shaders/bodies/earth/fragment.wesl`
- Modify `src/@types/rendering/EarthRenderer.d.ts`

**Interfaces — Consumes:** `nightLights` (Task 1), plan A's PBR fragment (`n`, `l = u.sunDirLocal`, the composed `colour` from `pbrDirect` + `AMBIENT`), plan A's binding-3 material + `EarthSurfaceUniforms` draw path. **Produces:** the `night` case on `EarthRenderer.setMap` + a fragment `@binding(4)` night texture. **No** uniform / packer / `EarthSurfaceUniforms` change.

- **`earthRenderer` bindings:** add a fragment **binding 4** night texture (`sampleType: 'float'`) to the bind-group layout (plan A's `earthRenderer.ts` layout, entries block ~`196-215`) and `buildBindGroup` (~`219-229`). Reuse the existing `earthSampler` (binding 1) — the night map wants the same `repeat`/`clamp-to-edge` addressing + trilinear mips as `surface`. Create a **1×1 black `rgba8unorm-srgb` placeholder** night texture at construction (`[0,0,0,255]`) so the fragment always samples a real texture and contributes **no** city lights until the map lands (correct: an unfetched night map = dark side lit only by `AMBIENT`). Mirror the surface/material placeholder pattern (`earthRenderer.ts:169-189`).
- **`setMap('night', …)` case:** create a fresh `rgba8unorm-srgb` texture sized to the bitmap (SAME format as `surface` — night is sRGB colour, NOT linear), upload with `flipY: true`, `generateMipChain`, rebuild the bind group. Reuse the surface upload shape (plan A's `setMap` `surface` branch). Keep `clouds`/`normal` inert. Update the `EarthRenderer.d.ts` `setMap` doc (`EarthRenderer.d.ts:31-41`) to record `night` as implemented (sRGB emissive city lights) alongside `surface`/`material`.
- **Fragment (`earth/fragment.wesl`) — composition (spec §6; contract, not a body):**
  - declare `@group(0) @binding(4) var nightTexture: texture_2d<f32>;` and `import package::lib::nightLights::nightLights;`
  - after plan A's day-term line (`let colour = direct * u.sunIrradiance + AMBIENT * albedo;`):
    - `let nightColour = textureSample(nightTexture, earthSampler, in.uv).rgb;` (sRGB texture → linear on read)
    - `let NoL = max(dot(n, l), 0.0);` (the Lambert/Sun term `dayFactor` tracks)
    - `let emissive = nightLights(nightColour, NoL, 0.0);` — **`cloudAlpha = 0.0`** is the plan-D seam (spec §7.3); leave a single-quote comment marking it.
    - `return vec4<f32>(colour + emissive, 1.0);`
  - Night is emissive (added), so it is NOT multiplied by any lit/`AMBIENT` term. `VSOut` (`earth/io.wesl:27-35`) is unchanged — the fragment reuses the existing `uv` + `normalLocal`.

**Steps:**

- [ ] Wire the renderer (binding 4, black placeholder, `night` `setMap` case), the fragment (bind + sample night, compose `nightLights` with `cloudAlpha = 0.0`), and the `EarthRenderer.d.ts` doc.
- [ ] `npx tsc --noEmit` clean; `npm run build` clean (the WESL links — watch the iOS-strict traps: valid struct/binding layout, no `texture_1d`; use `createShaderModuleWithDevLog` output if it fails).
- [ ] **Visual check (black placeholder, before Task 4 data):** ask the user to confirm on the already-running dev server (do not start/kill it) that Earth still renders exactly as after plan A — day PBR + ocean glint intact, dark side unchanged, **no** city lights yet (night map is the all-black placeholder), no crash.
- [ ] Commit (stage each path explicitly).

---

## Task 4: Fetch + build the Black Marble night map, then verify city lights

**Files:** none (data + verification). Produces `data/raw/textures/<black-marble>` (gitignored) and `public/data/images/textures/earth-night-{…,8192}.jpg` (gitignored build artefacts).

- [ ] **Announce the download** (announce-big-downloads): tell the user the NASA Black Marble source is ~10–20 MB, state the exact URL + size confirmed against `textures.earthNight`, and **get explicit go-ahead before fetching**. Do not fetch otherwise. Fill the verified URL + native dimensions back into the `textures.earthNight` registry row and the `data/raw/textures/README.md` provenance (fetch date, dimensions, licence/credit) if they differed from the Task 2 stub.
- [ ] On go-ahead, fetch the night map (`npm run fetch-textures -- --confirm`, or a targeted single-source fetch) — it lands via `downloadGetOnly` into `data/raw/textures/` and upserts its `textures.sha256` line.
- [ ] Build the night tiers: `npm run build-textures` emits `earth-night-8192.jpg` (+ smaller tiers) into `public/data/images/textures/` via the sRGB `writeBodyTier` path. Confirm the files exist and are JPG.
- [ ] **Visual check (the acceptance win):** ask the user to fly to Earth's **night side** on the running dev server and confirm **city lights** glowing on the dark hemisphere, **fading smoothly through the terminator** into the day side, with no hard seam and no lights bleeding onto the sunlit face. Confirm the map loaded (network tab shows `earth-night-8192.jpg`, not a 404 to the placeholder).
- [ ] No commit (all artefacts gitignored). Note for the merge: R2 sync of the new `earth-night-*.jpg` is a post-merge deploy step (spec §9.3 — the textures dir glob sweeps it automatically), not part of this PR.

---

## Task 5: entanglement-radar review pass

**Files:** none (review).

- [ ] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay attention to: `isLinearTextureKind` remaining the single home for the sRGB-vs-linear axis (night correctly NOT in it — no parallel "is night sRGB" predicate); the night blend living only in `nightLights.wesl` (the terminator-fade shape not re-derived in the fragment); the `cloudAlpha` seam being a clean parameter (no half-bound cloud texture, no dead uniform field); and no accidental `EarthSurfaceUniforms` resize. Name any knot precisely and fix or file it before the final review.
- [ ] Address findings (or record why deferred); keep the suite green.

---

## Task 6: Final review + verification

**Files:** none.

- [ ] Run `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [ ] Request code review (`superpowers:requesting-code-review`) covering the night `setMap`/binding path, the emissive `nightLights` composition, and the data-chain rows (registry/source/kinds/filename).
- [ ] Confirm the DoD before marking the plan done (`/feature-done`), which sweeps the backlog + relocates spec/plan on merge.

---

## Interfaces produced for later plans

Plan D is drafted against these exact shapes.

**`nightLights.wesl`** (`src/services/gpu/shaders/lib/nightLights.wesl`, `package::lib::nightLights::*`):

```wgsl
fn nightLights(nightColour: vec3<f32>, NoL: f32, cloudAlpha: f32) -> vec3<f32>;
```

Emissive city-lights RGB to ADD to the lit surface colour. `nightColour` = the Black Marble night sample (linear rgb from an sRGB texture); `NoL` = the clamped sun/surface Lambert term (the day factor's source); `cloudAlpha` = cloud coverage at the fragment's own uv. Returns `nightColour * (1 − dayFactor(NoL)) * (1 − cloudAlpha) * NIGHT_BRIGHTNESS`, where `dayFactor` is a `smoothstep` over `NoL` across the module consts `NIGHT_TERMINATOR_LO`/`NIGHT_TERMINATOR_HI`. **Plan D fills `cloudAlpha`**: it binds the cloud texture in the surface pipeline, samples cloud alpha at `in.uv`, and passes it here in place of the `0.0` plan B supplies (spec §7.3 — the surface↔cloud coupling). No signature change; plan D changes only the argument value.

**Night `(earth, 'night')` wiring** (the same `(body, kind)` pattern as plan A's `material`, but **sRGB not linear**):

- `BODY_TEXTURE_REGISTRY.earth.kinds.night = 'large'` (8K ceiling) → auto-mints slot + `ASSET_WIRING` proximity row + fetcher URL via `ALL_BODY_TEXTURE_KEYS`.
- `TEXTURE_SOURCES.earth.night = { native: 'textures.earthNight' }` (no `dev` variant — full-pull-only).
- On-disk name `earth-night-<px>.jpg` via `bodyTextureFilename` — night is **NOT** a linear kind, so it stays JPG + `rgba8unorm-srgb` + colour-managed decode (do NOT add `'night'` to `isLinearTextureKind`).
- Commit dispatch unchanged: `commitBodyTexture` routes `(earth, 'night')` → `earthRenderer.setMap('night', bitmap)` (`bodyTextureSlotRegistry.ts:86-91`).
- Renderer: fragment **binding 4** = night texture (`rgba8unorm-srgb`, sampled with the shared `earthSampler`); `setMap('night', …)` uploads sized-to-bitmap with a full mip chain, mirroring the `surface` case.

**`EarthSurfaceUniforms` / `packEarthSurfaceUniforms` — UNCHANGED by plan B.** The day/night factor derives from the existing sun term; `NIGHT_BRIGHTNESS` is a WESL module const, not a uniform field. B leaves the `_pad0` (f32 26) / `_pad1` (f32 27) slots plan A reserved untouched; per plan A's canonical pad ledger, plan D later claims `_pad0` as `cloudShellRadius` and `_pad1` stays free (plan C claims neither — its exaggeration is baked offline).
