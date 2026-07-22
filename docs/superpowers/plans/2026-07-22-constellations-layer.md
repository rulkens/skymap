# Constellations — true-3D stick-figure overlay layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> to execute this plan — dispatch a fresh implementer subagent per task, each with the spec,
> the conventions docs, and this plan's task text in hand, then run the spec + quality reviews
> at the checkpoints. Do not batch tasks into one agent; the whole point is a clean context per
> task. Implementers never load project skills, so every convention an implementer must honour
> is restated in the task text or the Global Constraints below.

Spec: [`docs/superpowers/specs/2026-07-22-constellations-design.md`](../specs/2026-07-22-constellations-design.md).
Grill: [`docs/grill-sessions/constellations-2026-07-22.md`](../../grill-sessions/constellations-2026-07-22.md).

**Prep landed as earlier commits on this branch (one PR for prep + feature, user decision
2026-07-22 — do NOT re-do):**
- **Prep 1** — `stars-rs` `Population` now carries `ids: Vec<StarIds>` with
  `StarIds { gaia: Option<u64>, hip: Option<u32> }` parallel to `stars`, and famous-star
  subtraction keys on Gaia ∪ HIP with the crossmatch-gap fallback. This plan CONSUMES that joint.
- **Prep 2** — a shared WESL segment-quad expansion helper exists at
  `src/services/gpu/shaders/lib/segmentQuad.wesl`, exporting
  `expandSegmentQuad(cam: CameraUniforms, aWorld: vec3<f32>, bWorld: vec3<f32>, corner: vec2<f32>, halfWidthPx: f32) -> vec4<f32>`.
  (Re-verify the exact filename / exported fn name at execution time — if prep-2 shipped under a
  different name, use the shipped one.)

## Goal

Ship a new singleton overlay layer that draws the 88 IAU constellation figures as true-3D line
segments whose endpoints sit on the exact heliocentric positions the rendered stars use, plus one
Latin name label per figure. From Earth's vantage the familiar figures appear; flying away, they
shear apart — making "a constellation is a coincidence of sightlines" visible by flight alone.

## Architecture

The endpoint positions are resolved **inside the `stars-rs` build** (against the same post-dedup,
post-distance-choice population the bin ships) and emitted as a small `public/data/constellations.json`
artifact — so lines land exactly on rendered stars by construction. The runtime side is pure growth
at existing seams: a `Source` row, a `settings.constellations` block, a `makeJsonFetcher` slot with an
`ASSET_WIRING` demand row, an instanced screen-space thick-quad renderer on the NEAR0 slab, a
`ContentLayer` pass with a `SCALE_FADE_BANDS` row, fade wiring, a `LabelProducer`, and a `StarsSection`
toggle + intensity slider. Every touchpoint mirrors filaments / flow / structures / famous-stars.

## Tech Stack

- **Build stage:** Rust (`tools/stars-rs/`), serde JSON emission, runs before `main.rs` drops the
  population after quantization.
- **Runtime:** TypeScript + Vite + React (UI shell), raw WebGPU + WESL (renderer), RTK slices +
  sagas (state), the AssetSlot loading machinery, the LabelProducer/labelDirector subsystem.
- **Deploy:** `tools/deploy/syncR2.ts` ALLOW filter; `constellations.json` ships via R2 like the
  other `public/data/` build outputs.

## Global Constraints

Carry these into every dispatch — implementers do not load project skills.

- **TS shapes:** `export type X = { … }` — `type` aliases, never `interface`. One type per file in
  `src/@types/` (deep relative imports, no barrels; filename = type name). One function per file in
  `src/utils/` (filename = fn name). Tests mirror the `src/` tree under `tests/`.
- **RTK:** reducer args named `settings` / `action`, never `s` / `a`. `while (true)` in sagas is the
  house convention.
- **Vectors:** `Vec3` alias, never a raw `[number, number, number]` tuple, for any 3-vector field.
- **Components:** container/presentational split, one component per file, `function Name() {}` +
  `export default Name`, CSS modules with `composes` (never `:global`). Load the `create-component`
  conventions before touching any `src/components/**` file.
- **WESL:** literal `package::…` import paths; NO backticks inside WESL comments (single quotes only —
  backticks are a parse error); slow down and verify shaders visually. Store any 1D LUT as N×1
  `texture_2d`, never `texture_1d` (iOS WebKit rejects 1D sampling and silently drops the whole frame).
- **Comments:** didactic, multi-paragraph module headers matching neighbouring files — explain _why_
  and _what the alternative was_. Timeless + terse; no history notes.
- **Prose (user-facing copy, labels, tooltips):** no em dashes, no "isn't just X" / capstone-sentence
  LLM tells.
- **Tests:** per [`testing.md`](../conventions/testing.md) — test only what can break on a real bug no
  compiler check catches. NO registry/constant restatements, NO runtime type tests, NO mirror tests,
  NO source-text greps. Several tasks below are pure wiring and get **NO test** — that is called out
  per task; do not invent low-value tests to fill them.
- **File moves/renames:** any TS file move/rename goes through `npm run refactor -- move <from> <to>`
  (dry-run first), never `git mv` + hand-edited imports. (No moves are expected in this plan.)
- **Artifact version bump requires regen:** the `constellations.json` artifact carries `version: 1`.
  Any change to the emitted shape bumps the version AND requires `npm run build-stars-rs` to
  regenerate the artifact; the runtime fetcher rejects a version/shape mismatch with a console
  warning naming that command.
- **Commits:** stage specific paths (never `git add -A`/`.`); commit with the user's git identity
  (Co-Authored-By trailer only, never `--author`). Do NOT commit unless the executing lead is told to.

---

## Task 1: Vendor d3-celestial line data + registry + provenance + gitignore

**Files:**
- `data/raw/constellations/constellations.lines.json` (create — the vendored dataset, ~100 KB)
- `data/raw/constellations/README.md` (create — provenance)
- `tools/utils/io/rawDataRegistry.ts` (modify — add keys)
- `.gitignore` (modify — one `!` line for the committed `.json`)

**What to vendor:** d3-celestial's `data/constellations.lines.json` (BSD-3-licensed; GeoJSON
`FeatureCollection` of `MultiLineString` figures with `[ra, dec]` polyline vertices). Download it
from the d3-celestial GitHub repo (`ofrohn/d3-celestial`, path `data/constellations.lines.json`).
It is ~100 KB — no announce-gate needed. Record the exact commit hash you pulled from in the README.

**Registry keys** (dotted-lowercase `<catalog>.<artifact>`, per the CLAUDE.md 5-step checklist):
- `constellations.lines` → `data/raw/constellations/constellations.lines.json`,
  `source: 'committed'`, `kind: 'file'`, one-line `description`, `upstream` URL, `readme:
  'constellations.readme'`.
- `constellations.readme` → `data/raw/constellations/README.md`, `source: 'committed'`.

- [ ] Download `constellations.lines.json` into `data/raw/constellations/`.
- [ ] Add both keys to `RAW_DATA` in `tools/utils/io/rawDataRegistry.ts` (see the `cf4.table2` /
      `cf4.readme` pair at `rawDataRegistry.ts:239-249` for the exact row shape). `RawDataKey` gains
      the two keys automatically.
- [ ] Write `data/raw/constellations/README.md`: upstream URL, the d3-celestial commit hash, BSD-3
      license note (with the copyright line), the GeoJSON column/shape description, and the fetch
      date. The `!/data/raw/**/README.md` glob already tracks it — plain `git add`, no `-f`.
- [ ] Add a `.gitignore` `!` line re-including the committed `.json`. The `/data/**` block
      (`.gitignore:95-100`) re-includes only READMEs / `.sha256` / fonts / seeds, so the vendored
      `.json` needs its own negation. Add it in that block with a comment explaining the exception
      (a non-standard committed raw file the common globs don't cover):
      `!/data/raw/constellations/constellations.lines.json`.
- [ ] Confirm `git status` shows the `.json` + README tracked (not ignored) and `git check-ignore`
      reports the `.json` is NOT ignored.

**No test** — vendoring + registry rows are static data with no behavior a test could exercise that
the build stage (Task 2+) doesn't already exercise against the real file.

---

## Task 2: Rust — parse vendored JSON, overrides seed, and the vertex resolver

**Files:**
- `tools/stars-rs/src/constellations.rs` (create — parse + resolve)
- `data/seeds/constellation_overrides.seed.json` (create — committed, MAY START EMPTY, e.g. `[]` or
  `{"overrides": []}`)
- `tools/stars-rs/src/main.rs` or `lib.rs` (modify — `mod constellations;` declaration only; the
  call site is Task 4)
- `tools/stars-rs/tests/` or an inline `#[cfg(test)]` module in `constellations.rs` (tests)

**Interfaces (Consumes):**
- The vendored `data/raw/constellations/constellations.lines.json` via `rawDataPath('constellations.lines')`
  (Rust build reads it; use the same path source the other stars-rs raw reads use).
- `Population { stars: Vec<Star>, ids: Vec<StarIds>, … }` (prep 1) — the id-carrying population,
  post-dedup, post distance-choice. `StarIds { gaia: Option<u64>, hip: Option<u32> }`.
- The famous-star seed (`data/seeds/famous_stars.seed.json`) with the structured `hip` field (prep 1)
  and each entry's authoritative `ra` / `dec` / `distancePc`.

**Interfaces (Produces):** a resolver returning, per polyline vertex, a resolved 3D position (pc) +
apparent magnitude, or a hard error. Suggested Rust contract (adapt names to the crate's style):

```rust
pub struct ConstellationLine { pub name: String, pub vertices: Vec<[f64; 2]> } // [ra_deg, dec_deg]

pub struct ResolvedVertex { pub pos_pc: [f32; 3], pub app_mag: f32 }

pub enum ResolveError {
    /// No famous seed, no population star within tolerance, no override — actionable.
    Unresolvable { constellation: String, vertex_index: usize, ra_deg: f64, dec_deg: f64,
                   nearest_miss_arcmin: f64 },
}

pub fn resolve_vertex(
    ra_deg: f64, dec_deg: f64,
    famous: &FamousSeed,     // authoritative positions, matched first
    pop: &Population,         // id-carrying, nearest-bright within tolerance + app-mag window
    overrides: &Overrides,    // explicit HIP id or position per problem vertex
    tol_arcmin: f64,          // starting ~5.0
) -> Result<ResolvedVertex, ResolveError>;
```

**Resolution order (spec §Build pipeline step 2 — the four steps, IN ORDER):**
1. **Famous seed first** (angular tolerance): famous positions are authoritative — that is where the
   labelled body renders, whether or not the star was subtracted from the bin. Endpoint pos comes
   from the seed's own `ra`/`dec`/`distancePc`; app_mag from the seed.
2. **Else nearest bright star in the id-carrying population** within `tol_arcmin` AND an
   apparent-magnitude sanity window (reject a faint near-coincidence over the intended bright star).
3. **Else `constellation_overrides.seed.json`** — explicit HIP id (resolved through the population's
   ids) or an explicit position per problem vertex.
4. **Else HARD build failure** printing constellation, vertex index, ra/dec, and nearest-miss
   distance in arcmin, so the override file can be extended.

- [ ] Parse `constellations.lines.json` (GeoJSON `MultiLineString`) into `Vec<ConstellationLine>`.
      Note d3-celestial ra may be in `-180..180`; normalize to a consistent convention before
      angular comparison. Cite the vendored file's actual shape — read it, don't assume.
- [ ] Load `constellation_overrides.seed.json` (may be empty) via `data/seeds/*.json`
      (already git-tracked; `serde` parse into `Overrides`).
- [ ] Implement `resolve_vertex` with the four-step order above.
- [ ] Test `orion resolves its bright endpoints to the expected stars` — feed a small fixture with
      Orion's belt/shoulder vertices and assert each resolves to the expected famous/HIP star
      (Betelgeuse, Rigel, Saiph…) by id or by position within a few arcmin.
- [ ] Test `famous-subtracted endpoint resolves from the seed position` — a vertex over a star that
      prep-1 subtracted from the bin (e.g. a Big Dipper star) resolves to the FAMOUS SEED position,
      not a population star.
- [ ] Test `off-star vertex trips the override path` — a vertex with no famous/population match
      within tolerance resolves via a seeded override (assert it uses the override's position/id).
- [ ] Test `unresolvable vertex is a hard error naming the nearest miss` — a vertex with no match and
      no override returns `ResolveError::Unresolvable` carrying the constellation, vertex index, and
      a plausible `nearest_miss_arcmin`.
- [ ] `cargo test` in `tools/stars-rs/` → the four tests pass.

---

## Task 3: Rust — label anchor (median distance) + artifact assembly + serialize

**Files:**
- `tools/stars-rs/src/constellations.rs` (modify — anchor + assembly + serde types)
- tests inline (`#[cfg(test)]`)

**Interfaces (Produces):** the serialized artifact matching the runtime contract EXACTLY (serde
`rename` to the camelCase JSON keys). Pin these serde structs:

```rust
#[derive(serde::Serialize)]
pub struct ConstellationsArtifact { pub version: u32, pub constellations: Vec<Constellation> }

#[derive(serde::Serialize)]
pub struct Constellation {
    pub name: String,
    #[serde(rename = "labelAnchorPc")] pub label_anchor_pc: [f32; 3],
    pub segments: Vec<Segment>,
}

#[derive(serde::Serialize)]
pub struct Segment {
    #[serde(rename = "aPc")]     pub a_pc: [f32; 3],
    #[serde(rename = "aAppMag")] pub a_app_mag: f32,
    #[serde(rename = "bPc")]     pub b_pc: [f32; 3],
    #[serde(rename = "bAppMag")] pub b_app_mag: f32,
}
```

`version` is `1`. Each polyline of N vertices becomes N-1 `Segment`s between consecutive
`ResolvedVertex`es.

**Label anchor (spec §Build pipeline step 3):** per constellation, the mean SKY DIRECTION of its
vertices, placed at the **MEDIAN** vertex distance (median so one distant supergiant doesn't drag the
label off the figure). Compute the mean unit direction (average the normalized position vectors,
renormalize), then scale by the median of the vertices' distances.

- [ ] Implement `constellation_label_anchor(vertices: &[ResolvedVertex]) -> [f32; 3]` (mean unit
      direction × median distance).
- [ ] Implement `build_artifact(lines, famous, pop, overrides) -> Result<ConstellationsArtifact, ResolveError>`
      assembling every figure's segments + anchor, propagating the hard error from Task 2.
- [ ] Test `median anchor resists one distant outlier` — a figure whose vertices are all ~100 pc
      except one at ~1000 pc; assert the anchor's radial distance is ~the median (~100 pc), NOT the
      mean, and its direction is inside the figure's angular span. Use hand-computed expected values,
      not the function's own formula (no mirror test).
- [ ] `cargo test` → the median test passes.

---

## Task 4: Rust — wire the resolver into `main.rs` and emit `constellations.json`

**Files:** `tools/stars-rs/src/main.rs` (modify)

**The ordering constraint (load-bearing):** the resolver needs `pop.stars` + `pop.ids`, and `main.rs`
**drops `pop` at `main.rs:131`** (`drop(pop)`) right after `quantize_population`. The constellation
resolve MUST run BETWEEN `build_population` (`main.rs:108`) and that `drop(pop)`. The artifact is
written to `args.out_dir` (which is `public/data`, per the `stars-*.bin` write loop at
`main.rs:156-178`).

- [ ] After `build_population` (`main.rs:108`) and before `drop(pop)` (`main.rs:131`): read the
      vendored lines + overrides + famous seed, call `build_artifact`, and on `Ok` write
      `args.out_dir.join("constellations.json")` (serde_json to string, then `std::fs::write`). On
      `Err(ResolveError::Unresolvable { … })`, `panic!` / `process::exit` with the actionable message
      (constellation, vertex, nearest miss) — the spec mandates a hard build failure, never a
      silently dropped line.
- [ ] Print a one-line summary to stderr matching the existing build-log style (`main.rs:110-122`):
      figure count, segment count, and any override hits.
- [ ] `cargo build` + a local `npm run build-stars-rs` (or the crate's run) against real raw data →
      `public/data/constellations.json` is emitted and parses; spot-check Orion's segment count.

**No new unit test here** — the emission path is exercised by the Task 2/3 tests plus the real-data
build spot-check; a test asserting "main writes a file" would be a wiring restatement.

---

## Task 5: Runtime — `Source.Constellations` + registry row + entry type

**Files:**
- `src/data/source.ts` (modify — append the enum value)
- `src/@types/data/constellations/ConstellationsSourceEntry.d.ts` (create — the entry type)
- `src/data/sources/constellations.ts` (create — the registry row)
- `src/data/sources.ts` (modify — import + stitch the row into `SOURCE_REGISTRY`)

**Interfaces (Produces):**
- `Source.Constellations` — append at the next free integer AFTER `GaiaStars: 24` (i.e. `25`).
  Append-only; add the docstring block in the `Source` const explaining it is a registry-key-only,
  not-persisted, not-pickable overlay code (mirror the `Flow: 17` / `MilkyWay: 16` docstrings at
  `source.ts:97-108`).
- `ConstellationsSourceEntry` — model on `FilamentSourceEntry`
  (`src/@types/data/filament/FilamentSourceEntry.d.ts`): `SourceEntryBase & { readonly type:
  'constellations'; readonly code: number; readonly visible: boolean; readonly intensity: number }`.
  Default `visible: true` (Q7), `intensity: 1.0`.

- [ ] Append `Constellations: 25` to the `Source` const with its docstring.
- [ ] Create `ConstellationsSourceEntry` (`@types`, one type per file).
- [ ] Create `src/data/sources/constellations.ts` — the `CONSTELLATIONS_ENTRY` `as const satisfies
      ConstellationsSourceEntry` (model on `filaments.ts`), `visible: true`, `intensity: 1.0`.
- [ ] Add `'constellations'` to the `SourceEntry`/`SourceType` discriminated union wherever
      `'filament'` is a member (find it via the `SourceEntry` type — the registry `type` field union);
      stitch `CONSTELLATIONS_ENTRY` into `SOURCE_REGISTRY` in `sources.ts` alongside the others.
- [ ] `npm run typecheck` clean (the registry + entry types line up).

**No test** — an entry-list or enum-value restatement is exactly the registry restatement
testing.md forbids. Structural invariants (`code` uniqueness, non-empty label) are already covered by
the existing `sources` structural test if one exists; do not add a constellations-specific literal
assertion.

---

## Task 6: Runtime — settings block, reducers, selectors

**Files:**
- `src/state/settings/initialState.ts` (modify — seed the block from the registry)
- `src/state/settings/settingsSlice.ts` (modify — two reducers)
- `src/state/settings/selectors.ts` (modify — two selectors)
- the settings-state type (wherever `filaments: { enabled; intensity }` is typed) (modify)

**Interfaces (Produces):**
- `settings.constellations = { enabled: boolean; intensity: number }`, seeded from
  `SOURCE_REGISTRY[Source.Constellations].visible` / `.intensity` — mirror the `filaments` seed at
  `initialState.ts:132-135` so the registry stays the single source of truth for the default.
- `setConstellationsEnabled(settings, action: PayloadAction<boolean>)` and
  `setConstellationIntensity(settings, action: PayloadAction<number>)` — twins of
  `setFilamentsEnabled` / `setFilamentIntensity` (`settingsSlice.ts:139-145`). Reducer args named
  `settings` / `action`.
- `selectConstellationsEnabled(state): boolean` and `selectConstellationIntensity(state): number` —
  twins of the filament selectors (`selectors.ts:129-135`).

- [ ] Add the `constellations` field to the settings-state type + `initialState` seed.
- [ ] Add the two reducers to `settingsSlice.ts` (with the `// ── constellations ──` banner comment
      matching neighbours).
- [ ] Add the two selectors to `selectors.ts`.
- [ ] `npm run typecheck` clean.

**No test** — trivial setters + primitive-read selectors; a test would restate the reducer body
(a mirror) or the default constant.

---

## Task 7: Runtime — artifact type + fetcher (shape/version check)

**Files:**
- `src/@types/loading/ConstellationsArtifact.d.ts` (create — the runtime type)
- `src/services/loading/fetchers/constellationsFetcher.ts` (create — `makeJsonFetcher` + parse/validate)
- `tests/services/loading/fetchers/constellationsFetcher.test.ts` (create)

**Interfaces (Produces):** the runtime type mirroring the Rust artifact EXACTLY (one exported type,
nested inline object shapes — this satisfies one-type-per-file):

```ts
export type ConstellationsArtifact = {
  version: 1;
  constellations: Array<{
    name: string;
    labelAnchorPc: Vec3;
    segments: Array<{ aPc: Vec3; aAppMag: number; bPc: Vec3; bAppMag: number }>;
  }>;
};
```

Use the `Vec3` alias for every 3-vector. The fetcher composes `makeJsonFetcher`
(`src/services/loading/fetchers/jsonFetcher.ts:34-44`) with a `parseConstellations(raw: string):
ConstellationsArtifact` that validates `version === 1` and the top-level shape, throwing a `Error`
whose message names the regenerate command `npm run build-stars-rs` on mismatch. Model the
validate-and-throw on `parseStructureMeta` (`structureCatalogFetcher.ts:45-51`), which is public and
unit-tested without the network.

- [ ] Create the `ConstellationsArtifact` type.
- [ ] Create the fetcher: URL via `dataUrl('constellations.json')`, `makeJsonFetcher(urlFor,
      parseConstellations)`; export `parseConstellations` for the test.
- [ ] Test `parseConstellations accepts a valid v1 artifact` — a minimal two-figure fixture parses
      to the expected object.
- [ ] Test `parseConstellations rejects a wrong version` — `{ version: 2, … }` throws, and the
      message mentions `npm run build-stars-rs`.
- [ ] Test `parseConstellations rejects a malformed shape` — a non-array `constellations` (or missing
      `segments`) throws.
- [ ] `npm test -- constellationsFetcher` → all three pass.

---

## Task 8: Runtime — AssetSlot + ASSET_WIRING demand row

**Files:**
- `src/services/loading/slots/constellationsSlot.ts` (create)
- `src/services/engine/wiring/assetWiring.ts` (modify — add the row)
- the loading req type if the slot needs one (create — likely `void`/empty req like structures)

**Interfaces (Produces):**
- `createConstellationsSlot: SlotFactory<ConstellationsArtifact, ConstellationsReq>` — model on
  `structureCatalogSlot.ts:29-43`: no `commit` (CPU-resident data consumed by the renderer/label
  producer), a `subscribe` that only `console.warn`s on `kind === 'error'` (graceful degradation:
  failed fetch ⇒ empty layer). Empty request like structures (`req: () => ({})`).
- ASSET_WIRING row: `{ key: 'constellations', factory: (deps) => createConstellationsSlot(deps.state,
  deps.cb), req: () => …, demand: (ctx) => ctx.settings.constellations.enabled }` — model on the
  `flow` row (`assetWiring.ts:270-275`, demand = the layer's master gate).

- [ ] Create the slot (mirror `structureCatalogSlot`), warning-only subscriber.
- [ ] Add the `ASSET_WIRING` row with `demand: (ctx) => ctx.settings.constellations.enabled`.
- [ ] Wire the slot's ready value to the renderer + label producer at the seam the structures slot
      uses (`wireStructureProjection`'s analog) — the ready artifact must reach both the GPU upload
      (Task 10) and `produceConstellationLabels` (Task 12). Follow whichever subscription mechanism
      the sibling singleton layer (filaments/flow) uses to hand its ready asset to its renderer.
- [ ] `npm run typecheck` clean.

**No test** — slot construction + a demand predicate are wiring; the fetcher's behavior (Task 7) and
the layer's behavior (Task 11) carry the real coverage.

---

## Task 9: Runtime — WESL shaders (`shaders/constellations/*.wesl`)

**Files:**
- `src/services/gpu/shaders/constellations/vertex.wesl` (create)
- `src/services/gpu/shaders/constellations/fragment.wesl` (create)
- `src/services/gpu/shaders/constellations/io.wesl` (create — shared structs + bindings vocabulary)

**Interfaces (Consumes):**
- `package::lib::segmentQuad::expandSegmentQuad` (prep 2) — for the perpendicular thickness expansion.
- `package::lib::camera::CameraUniforms` + `worldToClip` — the shared camera prefix
  (`writeCameraPrefix`, see `src/services/gpu/lib/cameraUniforms.ts:64-85`).
- The apparent-mag → glow-size constants in `src/services/gpu/shaders/lib/starPhotometry.wesl:36-58`
  (`STAR_SIZE_REF_PX`, `STAR_GLOW_MIN_PX`, `STAR_GLOW_MAX_PX`) — the basis for the endpoint gap.

**Per-instance vertex layout (one instance per segment). Pin this stride byte-for-byte:**

| offset | field    | type         | meaning                                  |
|-------:|----------|--------------|------------------------------------------|
|      0 | `aPc`    | `vec3<f32>`  | endpoint A, heliocentric equatorial pc   |
|     12 | `aAppMag`| `f32`        | endpoint A apparent mag → inward gap      |
|     16 | `bPc`    | `vec3<f32>`  | endpoint B, pc                            |
|     28 | `bAppMag`| `f32`        | endpoint B apparent mag → inward gap      |

Stride = **32 bytes**, 8 floats. Plus the unit-quad `corner: vec2<f32>` per-vertex attribute
(4 corners / 2 triangles), exactly as `markerLines`/`filaments` do.

**Blend / tone:** additive; single dim steel-blue tone; ~1.5–2 px half-width; an `intensity` uniform
scales the alpha (Q5). No per-constellation hue.

**The endpoint gap (Q4 — screen-space pixel gap that tracks the star's glow):** each end is pulled
inward along the screen-space segment tangent by a pixel margin derived from that endpoint's
`appMag` (brighter ⇒ larger gap, so the line clears the visible glow). Compose it WITH
`expandSegmentQuad` rather than forking a third full copy of the expansion: use `expandSegmentQuad`
for the thickness/base clip position, and add a tangent-inward offset (project both endpoints, take
the NDC tangent, convert `gapPx → NDC`, scale by the chosen endpoint's `w`). The tangent recompute
is a few lines, not a second expansion.
> **If the gap cannot compose cleanly on `expandSegmentQuad`'s output** (e.g. it forces re-deriving
> the endpoint choice the helper hides internally), STOP and surface it to the executing lead with
> the simplest alternative before forking a third expansion copy — do not silently re-copy the
> whole helper. (Pause-before-implementing.)

- [ ] Create `io.wesl` with the instance struct + `Uniforms` (CameraUniforms prefix + `intensity`
      + viewport, whatever `expandSegmentQuad` needs) + the bindings, mirroring
      `markerLines/io.wesl`.
- [ ] Create `vertex.wesl` importing `expandSegmentQuad`, applying the per-endpoint gap.
- [ ] Create `fragment.wesl` — steel-blue additive output scaled by `intensity` and the per-instance
      alpha. Single quotes only in comments.
- [ ] `npm run build` links (no WESL linker error; imports resolve).

**No unit test** — WESL is verified by the visual pass (Task 15). The instance-stride byte layout is
enforced by the TS↔WESL parity discipline in the renderer (Task 10), where a stride test IS
load-bearing (uniform/vertex byte-layout parity — see testing.md keep-rules) if the renderer packs a
uniform struct; add that parity assertion in Task 10 only if a packed uniform exists.

---

## Task 10: Runtime — `constellationRenderer` + initGpu construction

**Files:**
- `src/services/gpu/renderers/constellations/constellationRenderer.ts` (create)
- `src/services/engine/phases/initGpu.ts` (modify — construct + store the handle)
- the EngineState GPU-handle type (modify — add `constellationRenderer` field)
- `tests/…` only if a packed uniform layout exists (see below)

**Interfaces (Produces):** `createConstellationRenderer(device, format, fadeBgl) → { upload(artifact),
draw(pass, vp, viewportPx, halfWidthPx, intensity, opacity), hasData() }` — model on
`createFilamentRenderer` (constructed at `initGpu.ts:344-345`, stored on `state.gpu.filamentRenderer`).
Uploaded ONCE from the ready artifact (no per-frame CPU rebuild): each segment becomes one instance
of the 32-byte layout from Task 9.

**Precision (NEAR0 seam):** the renderer is a dumb f32 pipeline; the PASS (Task 11) hands it a
pre-rebased vp via `narrowMat4(rebaseViewProj(view.slab.vp, camPos))` exactly as `starPointsLayer`
does (`starPointsLayer.ts:188,263`; primitives `rebaseViewProj` at
`src/utils/camera/rebaseViewProj.ts:69-77`, `narrowMat4`, `writeCameraPrefix` at
`cameraUniforms.ts:64-85`). Keep the shared-vp invariant: compute the rebased vp ONCE per frame,
hand the same matrix to the single draw.

- [ ] Create the renderer (mirror `filamentRenderer`): pipeline, bind-group-per-pipeline (WebGPU
      `'auto'` layouts do not cross pipelines — build the bind group against this pipeline's layout),
      instance buffer from the artifact segments, `writeCameraPrefix` into the uniform.
- [ ] Construct it in `initGpu.ts` beside `filamentRenderer`; add the `constellationRenderer` field
      to the GPU-handle type (nullable, like `filamentRenderer`).
- [ ] Wire the slot's ready artifact (Task 8) to `renderer.upload(artifact)`.
- [ ] IF the renderer packs a uniform struct whose byte offsets mirror a WESL struct: add a
      **uniform byte-layout parity test** (this is a testing.md keep-rule — WGSL/TS parity catches
      drift invisible until iOS drops the frame). Otherwise no test.
- [ ] `npm run typecheck` + `npm run build` clean.

---

## Task 11: Runtime — `constellationsLayer` pass + fade band + draw-order registration

**Files:**
- `src/services/engine/frame/passes/constellationsLayer.ts` (create)
- `src/services/engine/frame/passes/index.ts` (modify — register in `CONTENT_LAYERS`, add the re-export)
- `src/services/engine/presentation/scaleFadeBands.ts` (modify — add the `constellations` row)

**Interfaces (Produces):** a `ContentLayer` (model on `filamentsLayer.ts`) with:
- `slab: NEAR0` (parsecs are NEAR0's native unit; COSMO's near plane would clip parsec anchors —
  same rationale as `starCatalogLayer.ts:35-57`), `target: 'hdr'`, `blend: 'additive'`.
- `enabled(state, ctx)`: `state.settings.constellations.enabled` OR the fade tail
  `state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs) > 0` — the house
  **opacity-0 ⇒ no render** rule (mirror `filamentsLayer.ts:69-78`). The renderer-null check lives in
  `draw` (mirror `filamentsLayer.ts:80-86`).
- `draw`: compute the rebased NEAR0 vp once (Task 10 seam), pull the distance fade via
  `fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc)` where `camDistMpc = hypot(drawCamPos)`
  (mirror `produceStructureLabels.ts:76-77`), multiply into the drawn opacity alongside
  `resolveLayerOpacity(...)` (mirror `filamentsLayer.ts:97-107`), pass `intensity` from
  `state.settings.constellations.intensity`.

**Fade band** — add one row to `SCALE_FADE_BANDS` keyed on the CAMERA distance from the heliocentric
render origin (Mpc), same quantity as `surveyDeepZoom` / `starBackdrop`. Full presence through the
solar neighborhood, GONE before figures go subpixel (spec §Runtime → Pass). Edges are an eye-tuning
STARTING POINT tuned visually in Task 15; the row's docblock must name the keying quantity (per that
file's "one table, mixed keying quantities" convention, `scaleFadeBands.ts:24-32`). Row shape:
`{ fullAt, goneAt }` (a recede band — full at the small-distance edge).

- [ ] Add the `constellations` `SCALE_FADE_BANDS` row with a keying-quantity docblock and eye-tuning
      note.
- [ ] Create `constellationsLayer.ts` (mirror `filamentsLayer`, NEAR0 slab, the two-condition
      `enabled` gate, the fade-band × layer-opacity multiply in `draw`).
- [ ] Register `constellationsLayer` in `CONTENT_LAYERS` (`passes/index.ts:235`) and add the
      re-export (`passes/index.ts:338` pattern). Place it in draw order near the other additive
      overlays (after filaments / with the star layers — pick per the NEAR0 slab grouping; additive
      blend makes per-fragment color order-independent, so this is an encoder-record choice, not a
      correctness one — document that in the layer header like `filamentsLayer.ts:31-40`).
- [ ] `npm run typecheck` + `npm run build` clean.

**No test** — the `enabled` gate + fade multiply are wiring mirrored from `filamentsLayer`; the fade
BAND math is `fadeBand` (already tested) over a data row (a constant restatement to test).

---

## Task 12: Runtime — `produceConstellationLabels` LabelProducer + registration

**Files:**
- `src/services/engine/presentation/produceConstellationLabels.ts` (create)
- `src/services/engine/engine.ts` (modify — register the producer, `engine.ts:528-539`)
- a constellation label-style constant (create — dimmer/smaller annotation-tier style)
- `tests/services/engine/presentation/produceConstellationLabels.test.ts` (create)

**Interfaces (Produces):** a `LabelProducer` (`src/@types/engine/subsystems/LabelProducer.d.ts`)
`{ id: 'constellationLabels', produceLabels(state, ctx): LabelProducerOutput }` — model on
`produceStructureLabels.ts`. For each figure in the ready artifact:
- Anchor at the artifact's `labelAnchorPc` (converted to the pass's world units as the other NEAR0
  consumers do), Latin `name` text, `font: 'cormorant'` (structure-label face) but dimmer/smaller
  (annotation tier — a dedicated style constant, model on `STRUCTURE_MARKER_STYLES`).
- `fadeAlpha` = the layer's distance fade (`fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc)`) ×
  the layer's fade opacity (`fades.opacityOf({ kind: 'constellations' }, now)`) — so labels ride the
  layer's fade, per Q7. Tag each with a `prominencePx` sort key so the director's shared declutter
  de-collides them across all producers (no producer-local declutter — see
  `produceStructureLabels.ts:40-47`).
- No abbreviations in v1.

- [ ] Create the annotation-tier label style constant (dimmer/smaller than structure labels).
- [ ] Create `produceConstellationLabels.ts` reading the ready artifact from wherever Task 8 lands it
      on `state` (mirror how `produceStructureLabels` reads `state.data.structures`).
- [ ] Register it in `engine.ts` beside `structureLabels` (`engine.ts:532-535`), documenting the
      merged-order note (`engine.ts:520-527`).
- [ ] Test `produces one label per constellation at its anchor` — a two-constellation fixture yields
      two labels at the expected `labelAnchorPc`s with the Latin names.
- [ ] Test `label fadeAlpha multiplies the layer fade` — with a stubbed fade opacity of e.g. 0.5 and
      a full distance band, assert `fadeAlpha === 0.5 ×` the distance factor (hand-computed, not the
      producer's own expression).
- [ ] `npm test -- produceConstellationLabels` → both pass.

---

## Task 13: Runtime — fade wiring (FadeId kind, VisibilityLayerKey, bridge, FADE_LAYERS, FADE_ROW)

**Files:**
- `src/@types/animation/FadeId.d.ts` (modify — add the kind)
- `src/@types/animation/VisibilityLayerKey.d.ts` (modify — add the key)
- `src/services/engine/presentation/fadeIdToVisibilityKey.ts` (modify — add the case)
- `src/services/engine/wiring/fadeLayers.ts` (modify — add the FADE_LAYERS row)
- `src/store/effects/watchFadesSaga.ts` (modify — two FADE_ROW entries)

**Interfaces (Produces):**
- `FadeId` gains `| { readonly kind: 'constellations' }` (no discriminator — a singleton, like
  `filament` at `FadeId.d.ts:71`). Add the kind's docblock entry.
- `VisibilityLayerKey` gains `| 'constellations'` (`VisibilityLayerKey.d.ts` union).
- `fadeIdToVisibilityKey`: `case 'constellations': return 'constellations';` — the `never`-guard
  `default` (`fadeIdToVisibilityKey.ts:107-110`) will fail the build until this is added, so this is
  compiler-forced.
- `FADE_LAYERS` row: singleton demand-loaded layer, `guard = slot ready` — model on the `filaments`
  row (`fadeLayers.ts:187-200`): `expand: () => [undefined]`, `handle: () => ({ kind:
  'constellations' })`, `seed: () => 0`, `intent: (s) => s.constellations.enabled`, `guard: (state)
  => state.gpu.constellationRenderer?.hasData() ?? false` (the demand-loaded gate: suppress the fade
  until the artifact is uploaded, so an enable racing the download doesn't burn the fade window).
- `FADE_ROW` (`watchFadesSaga.ts:55-66`): `[setConstellationsEnabled.type]: 'constellations'`. The
  intensity setter drives no fade layer — do NOT add `setConstellationIntensity` to FADE_ROW (it is
  a brightness scale, not a visibility gate; the filament intensity setter is likewise absent).

- [ ] Add the `FadeId` kind + docblock.
- [ ] Add the `VisibilityLayerKey` union member.
- [ ] Add the `fadeIdToVisibilityKey` case (build fails without it — confirms exhaustiveness).
- [ ] Add the `FADE_LAYERS` row with the `hasData()` guard.
- [ ] Add the single `FADE_ROW` entry for `setConstellationsEnabled` (import the action).
- [ ] `npm run typecheck` + `npm run build` clean (the exhaustiveness guards pass).

**No test** — every change here is a registry/union addition whose correctness is compiler-checked
(the `never` guards). A runtime assertion of the mapping would restate the switch (a mirror).

> **Note (spec ambiguity resolved):** the spec §Runtime → Fades says "FADE_ROW entries for both
> setters", but only the ENABLE setter drives a visibility fade; the intensity setter is a
> brightness scale with no fade layer (matching the filament precedent, where
> `setFilamentIntensity` is absent from FADE_ROW). Wire the enable setter only. If the executing
> lead wants the intensity setter in FADE_ROW, it is a one-line add — but it would fade the layer on
> every brightness tick, which is wrong.

---

## Task 14: Runtime — `StarsSection` toggle row + intensity slider + container wiring

**Files:**
- `src/components/SettingsPanel/StarsSection.tsx` (modify — add the row + slider)
- `src/components/containers/StarsSectionContainer.tsx` (modify — select + dispatch)
- `src/components/SettingsPanel/StarsSection.module.css` only if a new class is needed (reuse existing)

**Load the `create-component` conventions before editing these files.** (Container/presentational
split, one component per file, CSS-module `composes`.)

**Interfaces (Consumes):** `selectConstellationsEnabled` / `selectConstellationIntensity` (Task 6),
`setConstellationsEnabled` / `setConstellationIntensity` (Task 6).

- [ ] Add a "Constellations" toggle row in `StarsSection`, modelled on the famous-stars singleton
      row (`StarsSection.tsx:169-180`) — a checkbox bound to `constellationsEnabled` →
      `onToggleConstellations`. Place it with the star/famous controls.
- [ ] Add a "Constellation intensity" slider in the Advanced block, modelled on the Advanced slider
      pattern (`StarsSection.tsx:244-261`) — bound to `constellationIntensity` →
      `onConstellationIntensityChange`. Pick a sensible range (e.g. 0–2, 1.0 identity).
- [ ] Wire both through `StarsSectionContainer` (add the two selectors + two `useCallback`
      dispatchers with `[dispatch]` deps, and the two new props), mirroring
      `onToggleFamousStars` (`StarsSectionContainer.tsx:153-156`).
- [ ] Label copy has no em dashes / LLM tells.
- [ ] `npm run typecheck` clean; the dev server renders the new controls.

**No test** — a toggle/slider row is presentational wiring; the spec explicitly scopes TS tests to
the fetcher (Task 7) and the label producer (Task 12). Do not add a component-render restatement.

---

## Task 15: Deploy — `syncR2` ALLOW filter

**Files:** `tools/deploy/syncR2.ts` (modify — add `constellations.json` to `ALLOW`)

`constellations.json` is a `public/data/` build output (like `structures_meta.json`), so it belongs
in the `ALLOW` filter (`syncR2.ts:118-173`), NOT `EXTRA_FILES`.

- [ ] Add `name === 'constellations.json'` to the `ALLOW` predicate with a one-line comment (a
      gitignored build artefact emitted by `stars-rs`, fetched by the runtime, tier-agnostic like
      `structures_meta.json`).
- [ ] `npm run typecheck` clean.

**No new test** — the match is an exact-string `name === 'constellations.json'` (a constant
restatement to assert). The existing `tests/tools/deploy/syncR2.test.ts` covers the filter's
regex-pattern branches; an exact-match add earns no test.

---

## Task 16: Quality gate — entanglement-radar review over the full diff

**Files:** none (review task).

Run the `entanglement-radar` skill over the complete feature diff (all of Tasks 1–15). This is the
house convention (bake the review into the plan). Specifically check:
- The new `FadeId` kind / `VisibilityLayerKey` / `Source` code did not fork a 2-way predicate into a
  3-way branch that should be table dispatch.
- The endpoint-gap composition (Task 9) did not become a third copy of the segment expansion.
- The fetcher shape-check is the single home for the artifact's version contract (no second
  validator).
- No settings field is written by one path and read-for-truth by another.

- [ ] Run `entanglement-radar`; record findings.
- [ ] Land any surfaced un-braiding as follow-up edits (delegated) or, if out of scope, capture as a
      backlog item. Do not rubber-stamp.

---

## Task 17: Quality gate — visual verification (dev server)

**Files:** none (user visual pass).

The dev server runs in this worktree (Vite auto-increments past 5173 — use the port from THIS
server's `Local:` line; likely `http://localhost:5174`). Ask the user to look; describe what they
should see:
- From the Earth vantage, the familiar figures (Orion, Ursa Major, Cassiopeia…) appear correctly
  formed.
- Flying away from Earth, the figures SHEAR apart (endpoints at true distances) — the core effect.
- A screen-space GAP at each star endpoint that tracks the star's glow near and far.
- Latin name labels appear at figure anchors, decluttered against famous/structure/MW labels.
- The layer fades out before figures go subpixel on deep zoom; the toggle + intensity slider work.

- [ ] User confirms the visual pass (figures, shear, gaps, label declutter, fade). Tune the
      `SCALE_FADE_BANDS.constellations` edges, the steel-blue tone, half-width, and gap curve
      visually over HMR; capture the settled values.

---

## Task 18: Quality gate — typecheck + full test suite

**Files:** none (verification).

- [ ] `npm run typecheck` (both src + tools tsconfigs) clean.
- [ ] `npm test` (full vitest run) green — the suite is 600+ files and must stay green.
- [ ] `cargo test` in `tools/stars-rs/` green.
- [ ] `npm run build` (tsc --noEmit + vite build) succeeds; WESL links.

---

## Task 19: Quality gate — `/feature-done` audit BEFORE merge

**Files:** the plan + spec (relocation).

- [ ] Run the `/feature-done` audit: it gates on the Definition-of-Done (tests, typecheck, TODO scan,
      modified-file inventory), then relocates THIS plan to `plans/completed/` and the spec to
      `specs/completed/`. The audit rides the feature PR (before merge — post-merge sequencing is an
      error).
- [ ] Sweep `docs/BACKLOG.md` for the two deferred items the spec added (celestial-sphere morph
      toggle Q9; constellation interactivity Q8) — confirm they are captured as backlog items linked
      to this feature (add them if the spec-writing did not).

---

## Rollout (post-merge, from the MAIN worktree)

Per the spec §Rollout, prep 1 + 2 commits precede the feature commits on this branch; the single
PR (prep + Tasks 1–19) squash-merges after `/feature-done`. THEN, from the **main** worktree (worktrees have their own
`data/` — regen from main before sync; see project memory `project_worktree_data_isolation`):

1. `npm run build-stars-rs` — regenerates `public/data/constellations.json` (and the star bins)
   with the resolver stage.
2. `npm run sync-r2-secure` — ships `constellations.json` to R2 (the ALLOW filter now includes it)
   and purges the CDN edge. Use the `-secure` wrapper (Keychain-loaded token) so the purge runs.

Without the post-merge build + sync, the layer renders empty in production (the artifact isn't on R2
yet) even though the code is live.
