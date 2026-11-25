# Terrain horizon shadows, PR B: the feature

> **Spec.** [`2026-11-25-terrain-horizon-shadows-design.md`](../specs/2026-11-25-terrain-horizon-shadows-design.md)
> §3–§8, §10, §11.
> **Base.** Main after PR A ([`…-prep.md`](completed/2026-11-25-terrain-horizon-shadows-prep.md)) merged
> as #1171. This plan is written against that tree: `TileRead`, `SurfaceTileResidency.isEmpty`, lane rows with
> `role`/`binding`/`reservedSlots?`, `SurfaceTileDrawArgs.atlasViews`, `resolveStandaloneRect` with
> `SurfaceCutTile.standalone`, and `composeSurfaceLight` all exist.
> **Branch.** a fresh `feat/terrain-horizon-shadows` from main once PR A is in.
> **Execution.** Subagent-driven, lean protocol ([`sdd-execution.md`](../conventions/sdd-execution.md)).
> Perf gate: **yes** (Task 9).

## Strategy

Horizon is the fourth tile product (`standalone`, binding 11) plus a whole-globe `'horizon'`
`TextureKind`. One offline tool bakes both from the height archives already on disk. One WGSL
module (`lib/horizonLookup.wesl`) reads both, so tiles and globe agree at the hand-off.

**The spike is reference, never merged.** Branch `worktree-terrain-horizon-shadow-spike`,
`tools/spikes/horizonShadow/`. The bake may borrow, rewritten to repo conventions (one symbol per
`utils/` file, types in `@types/`):
- `horizonMarch.ts`: the multi-resolution march, curvature drop, early exit on the ceiling;
- `heightPyramid.ts`: reading height tiles across levels with ancestor fallback;
- `codec.ts`: the angle byte map (the values below are authoritative, not the spike's);
- `writeLayers.ts`, `quarterPosts.ts`: the 2×2 post packing and quarter decimation;
- `lib/horizonBake.wesl` (in-app spike, commit f31ab0ebf): the lookup's interpolation.
The spike's runtime march, its side storage buffer and its z4 global height lattice are rejected
(spec §2, §11) and must not reappear.

### Contract values (every task's requirements include these)

| Item | Value |
| ---- | ----- |
| Posts per tile | 33 × 33, height's 129-post lattice decimated by 4; post (0,0) = the tile's NW corner |
| Sectors | 16; sector k centred on azimuth k·22.5°, **clockwise from local north** |
| Angle byte map | byte 0–204 ↔ −3°…27° linearly (0.147°/step); byte 204–255 ↔ 27°…90° linearly |
| Post packing | a 2×2 RGBA8 block per post; texel `(k>>2)&1, k>>3` within the block; channel `k&3` (R,G,B,A) |
| Tile image | 66 × 66 lossless WebP, linear (no colour conversion) |
| Flat tile | max horizon over all posts and sectors < 1° → zero-byte file → zero-length entry → `'empty'` |
| Sentinel | atlas slot 0 reserved (`reservedSlots: 1`), filled with byte 0 (−3°) = fully lit, whole sky |
| Lane row | `slotSide` 66, `atlasSide` 32 × 66 = 2112, `format` `'rgba8unorm'`, `role` `'standalone'`, `binding` 11, `reservedSlots` 1 |
| Sun angular radius | `asin(SUN_RADIUS_M / sunDistanceM)` per frame; `SUN_RADIUS_M = 695_700_000` (IAU nominal) |
| Perf budget | ≈ 1 ms GPU added at the Jezero pose, 4.4° sun (spike: +0.85–1.0 ms) |

---

### Task 1: the angle map and post packing, shared by bake and shader

`review: yes` (TS↔WGSL contract)

**Files:**
- Create: `src/layers/body/surfaceTiles/horizon/data/horizonAngleMap.ts`,
  `src/layers/body/surfaceTiles/horizon/utils/horizonByteOfAngle.ts`,
  `src/layers/body/surfaceTiles/horizon/utils/horizonAngleOfByte.ts`,
  `src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf.ts`,
  `src/layers/body/surfaceTiles/horizon/@types/HorizonTexel.d.ts`,
  `src/services/gpu/shaders/lib/horizonAngleMap.wesl` (a `horizon/` concern module, not
  `format/`: `format/utils/` would pass `concernFolderShape`'s 15-file cap)
- Test: `tests/layers/body/surfaceTiles/horizon/utils/horizonAngleMap.test.ts`,
  `tests/services/gpu/shaders/horizonAngleMap.parity.test.ts` (pattern: `constants.parity.test.ts`)

**Interfaces (produces):**

```ts
export const HORIZON_ANGLE_MAP = { minDeg: -3, kneeDeg: 27, kneeByte: 204, maxDeg: 90 } as const;
export const HORIZON_POSTS_PER_TILE = 33;
export const HORIZON_SECTORS = 16;
export function horizonByteOfAngle(deg: number): number; // clamps to [0, 255], rounds to nearest
export function horizonAngleOfByte(byte: number): number; // degrees
export function horizonTexelOf(sector: number): { readonly dx: 0 | 1; readonly dy: 0 | 1; readonly channel: 0 | 1 | 2 | 3 };
```

```wgsl
// lib/horizonAngleMap.wesl: the same four constants, and
fn horizonAngleOfUnorm(v: f32) -> f32 // radians, from a texel channel read as unorm
```

- [x] Tests: `the byte map round-trips every byte within half a step`; `−3° → 0, 27° → 204, 90° → 255`;
      `angles below −3° clamp to 0`; `sector 13 lives in texel (1,1), channel G`.
- [x] Parity test: the WGSL constants equal `HORIZON_ANGLE_MAP` (parse the `.wesl` as the existing
      parity tests do).
- [x] Implement; tests pass. Commit.

---

### Task 2: the horizon march for one tile

`review: yes` (binary output a shader decodes)

**Files:**
- Create: `tools/textures/surfaceHorizon/bakeHorizonTile.ts`,
  `tools/textures/surfaceHorizon/@types/HeightPyramid.d.ts`,
  `tools/textures/surfaceHorizon/@types/HorizonTile.d.ts`,
  `tools/textures/surfaceHorizon/utils/` (one function per file, as the march needs: e.g.
  `marchHorizonSector.ts`, `curvatureDropM.ts`)
- Test: `tests/tools/textures/surfaceHorizon/bakeHorizonTile.test.ts`

**Interfaces (produces):**

```ts
/** Heights in metres above the datum, at any level, falling back to the deepest available
 *  ancestor; `subtreeMaxM` from the height header bounds the march's early exit. */
export type HeightPyramid = {
  readonly radiusM: number;
  readonly maxLevel: number;
  heightAt(z: number, lonRad: number, latRad: number): number;
  subtreeMaxM(z: number, x: number, y: number): number;
};
export type HorizonTile =
  | { readonly kind: 'flat' }
  | { readonly kind: 'image'; readonly rgba: Uint8Array }; // 66 × 66 × 4, packed per Task 1
export function bakeHorizonTile(pyramid: HeightPyramid, z: number, x: number, y: number): HorizonTile;
```

March rules (spec §4): per post and sector, step outward; each step reads the finest level that
still resolves it (step length ≥ that level's post spacing), so the far field reads coarser
ancestors; subtract curvature `d²/2R`; stop once `subtreeMaxM` of the z3 ancestor cannot rise
above the running maximum. Mars's missing z8–9 make the far field step from z10 to z7: deliberate.
As built (`marchCeilingM`): the ceiling is the max over the z3 ancestor **and its neighbours**
(every column of a polar row), since a march crosses z3 edges; the ancestor alone missed a ridge
just across one. Pole convention (`marchHorizonSector`, Task 6 copies it): the local frame comes
from the post's own λ, φ, east = (−sin λ, cos λ, 0), north = (−sin φ cos λ, −sin φ sin λ, cos φ),
no special case; at a pole it is the limit along meridian λ.

- [x] Test `a ridge on a sphere shades its anti-sun side at the analytic angle`: a synthetic
      `HeightPyramid` (a single north–south ridge of height H at distance D east of a post);
      assert the post's east sector decodes to `atan2(H − D²/2R, D)` within one byte and its west
      sector to the flat-sphere value.
- [x] Test `a flat sphere bakes as flat`: constant height → `{ kind: 'flat' }`.
- [x] Test `the march reads past the tile edge`: the ridge sits in the neighbouring tile; the
      post still sees it.
- [x] Implement; tests pass. Commit.

---

### Task 3: the bake tool, packing, manifest and globe images

**Files:**
- Create: `tools/textures/surfaceHorizon/bakeSurfaceHorizon.ts` (CLI),
  `tools/textures/surfaceHorizon/utils/readHeightPyramid.ts` (local height archives → `HeightPyramid`),
  `tools/textures/surfaceHorizon/utils/repackGlobeHorizon.ts`,
  `tools/textures/surfaceHorizon/README.md`
- Modify: `package.json` (`"bake-horizon": "tsx tools/textures/surfaceHorizon/bakeSurfaceHorizon.ts"`),
  `tools/textures/buildSurfaceTiles.ts` (only if `builtFrom.horizon` must be written there; prefer
  writing it from this tool through `mergeSurfaceTileManifest`),
  the manifest band type (`builtFrom` gains `horizon?`, `sourceId: 'derived:height'`)
- Test: `tests/tools/textures/surfaceHorizon/repackGlobeHorizon.test.ts`

**Interfaces (produces):**

```
npm run bake-horizon -- --body earth|moon|mars [--band <i>] [--workers N]
```

```ts
export function repackGlobeHorizon(
  tiles: (z: number, x: number, y: number) => HorizonTile | null,
  level: number,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array };
```

Rules:
- Input: `public/data/images/<body>-tiles/<prefix>/height/` archives through the existing archive
  index decode (`decodeSurfaceTileArchiveIndex`) and `sharp` for the WebP; heights decoded as the
  height bake encodes them (`heightTileFormat.ts`).
- `worker_threads`, one tile per task; skip tiles already written (resume).
- Output `horizon/<z>/<x>/<y>.webp` (66 × 66, lossless, `sharp` with no colour conversion) or a
  zero-byte file; then `packSurfaceTileLevels` packs them (zero-byte → zero-length entry, pinned in
  PR A).
- Globe images: for each tier the body's registry row lists (Task 7), repack from the coarse tiles:
  small z4, medium z5, large z6 (spec §7), flat tiles as byte 0; write with `bodyTextureFilename(body,
  'horizon', tier)`. **Note:** that name carries the tier's nominal px (2048/4096/8192) while the image
  is half that width (1024/2048/4096); say so in the README, don't rename the scheme.
- Test: `the globe repack places each tile's posts at their equirect position and writes flat
  tiles as byte 0` (a 2 × 1 tile fake at z1).
- [ ] Implement; test passes; run once on a small band (`--body mars --band <Jezero's index>`) and
      `npm run shot` the deep link from Task 9 against a dev server to see bytes land. Commit (code
      only; baked outputs are data, gitignored).

---

### Task 4: the horizon lane, atlas sentinel and placeholder

**Files:**
- Modify: `src/layers/body/surfaceTiles/format/data/surfaceTileProducts.ts:2` (`'horizon'`),
  `src/layers/body/surfaceTiles/format/utils/surfaceTilePath.ts:8` (`horizon: 'webp'`),
  `src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts` (the row, contract table),
  `src/layers/body/surfaceTiles/format/data/surfaceTileParams.ts` (`HORIZON_TILE_ATLAS_SIDE`),
  `src/layers/body/surfaceTiles/stream/load/` (a `fetchHorizonTile.ts` beside `fetchHeightTile.ts`,
  `createImageBitmap` with `colorSpaceConversion: 'none'`, `premultiplyAlpha: 'none'`),
  the stream's atlas creation (fill reserved slot 0 with byte 0),
  `src/layers/body/surfaceTiles/patch/passes/surfaceTilesPass.ts` (horizon's fallback in
  `atlasViews`: a 1 × 1 `rgba8unorm` byte-0 texture, created once)
- Test: `tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts`

Rules: upload through `copyExternalImageToTexture` only (RENDERER.md:69, never `getImageData`);
`'empty'` reads come from PR A's path untouched.

- [ ] Test `the horizon lane's slot 0 holds the lit sentinel and is never allocated`.
- [ ] Implement; targeted tests and typecheck pass. Commit.

---

### Task 5: `PatchInstance.horizonRect`

`review: yes` (WGSL layout)

**Files:**
- Modify: `src/services/gpu/shaders/bodies/surfaceTile/io.wesl` (`PatchInstance`, the field-order
  note, `VSOut`), `src/services/gpu/shaders/bodies/surfaceTile/vertex.wesl`,
  `src/layers/body/surfaceTiles/patch/render/surfaceTileLayout.ts:17` (`PATCH_INSTANCE_BYTES` 112),
  `src/layers/body/surfaceTiles/patch/render/surfaceTileRenderer.ts` (packing)
- Test: `tests/layers/body/surfaceTiles/patch/render/surfaceTileLayout.test.ts`

| Offset | Field | Type |
| ------ | ----- | ---- |
| 0–95 | unchanged | |
| 96–111 | `horizonRect` | `vec4<f32>`: atlas-UV origin.xy, scale.xy |

`standalone.horizon` maps: a rect → itself; `'empty'` or `null` → slot 0's rect (the sentinel).
The vertex stage forwards it as one more `@interpolate(flat)` varying at the next free location.

- [ ] Layout test: stride 112, `horizonRect` at 96, the existing per-field offsets unchanged.
- [ ] Implement; tests and typecheck pass; neutrality: a shot of `copernicus` with the horizon lane
      disengaged (no `builtFrom.horizon`) matches main. Commit.

---

### Task 6: `horizonLookup.wesl` on the tiles, with sky occlusion

`review: yes` (shaders)

**Files:**
- Create: `src/services/gpu/shaders/lib/horizonLookup.wesl`
- Modify: `src/services/gpu/shaders/bodies/surfaceTile/fragmentBare.wesl`,
  `src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl`,
  `src/services/gpu/shaders/bodies/surfaceTile/io.wesl` (`SurfaceTileUniforms`: `sunAngularRadiusRad`
  at offset 172, today's padding), the uniform writer in `surfaceTileRenderer.ts`,
  `src/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants.ts` (both variants list 11),
  `src/data/` (`SUN_RADIUS_M`, its own file)
- Test: `tests/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants.test.ts` (already
  fails on a binding a variant's shader lacks; extend only if it doesn't cover the new binding)

**Interfaces (produces):**

```wgsl
// Visible fraction of the sun's disc at this point, 0..1.
fn horizonSunVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>,
                        sunAzimuthRad: f32, sunElevationRad: f32, sunRadiusRad: f32) -> f32
// Sky-view factor on a horizontal surface: mean over sectors of cos²(max(h, 0)).
fn horizonSkyVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>) -> f32
// Sun azimuth (clockwise from north) and elevation in the local east/north/up frame of `up`.
fn localSunAngles(up: vec3<f32>, sunDirLocal: vec3<f32>) -> vec2<f32>
```

Rules:
- `textureLoad` only; bilinear over the four surrounding posts, **each post decoded to angles
  before interpolating** (the map has a knee); the two sectors around the azimuth interpolated.
- Post coordinate: `(rect.xy + uv * rect.zw) * textureDimensions(atlas) / 2`, clamped inside the
  slot it addresses (a sub-rect never leaves its ancestor's slot).
- `visibility = smoothstep(-r, r, elevation − horizon)` with `r` the sun radius.
- `up` is the datum normal (`in.normalLocal`), not the shaded normal. At the poles, where east is
  undefined, use the same convention as the bake (`marchHorizonSector`): name it in both places.
- Into `composeSurfaceLight(direct, ambient, horizonSunVisibility(..) , horizonSkyVisibility(..))`;
  Earth's cloud shadow still dims `direct` first; night lights untouched.
- [ ] Implement; typecheck and variant tests pass. Shots of `copernicus`, `valles`, `jezero` at the
      Task 9 poses: shadows fall away from the sun, no speckle at tile edges. Commit.

---

### Task 7: the whole-globe `'horizon'` kind

`review: yes` (shaders)

**Files:**
- Modify: `src/@types/data/TextureKind.d.ts:16`,
  `src/utils/bodyTextures/isLinearTextureKind.ts:26` (adds `'horizon'`; its header list too),
  `src/layers/body/textures/data/bodyTextureRegistry.ts` (Earth, Moon, Mars rows: `horizon: <max tier>`),
  `src/layers/body/earth/render/earthRenderer.ts:39-50` (binding 7, placeholder `[0, 0, 0, 0]`),
  `src/layers/body/spheres/render/texturedBodyRenderer.ts:38-41` (binding 5, `rgba8unorm`, placeholder
  `[0, 0, 0, 0]`), `src/services/gpu/shaders/bodies/earth/fragment.wesl`,
  `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl`, both bodies' uniform blocks
  (`sunAngularRadiusRad`) and their writers and layout tests
- Test: the existing earth/texturedBody uniform layout tests move with any new field.

Rules: the globe calls the same `horizonSunVisibility`/`horizonSkyVisibility` with
`rect = vec4(0, 0, 1, 1)` and the equirect uv of the hit point (the tiles' scheme: u from −180°,
v from the north pole). Byte-0 placeholder → an uncommitted map draws as today. `texturedBody`'s
ring visibility multiplies into the sun visibility. Bodies without a horizon tier (every other
`texturedBody`) bind the placeholder.

- [ ] Implement; typecheck and layout tests pass. Shot of `moon-orbit`: long crater shadows along
      the terminator; Saturn and a planet without a map unchanged against main. Commit.

---

### Task 8: bake, pack and ship (manual steps flagged)

**Files:** none in git beyond the manifest merges the tool writes under `public/data` (gitignored).

- [ ] Bake each body overnight on all cores: `npm run bake-horizon -- --body moon --workers <cores>`,
      then `mars`, then `earth` (≈14 CPU-hours in total; announce before starting).
- [ ] Check sizes against spec §8 (Earth ≈111, Moon ≈129, Mars ≈100 MB of packs; flat share ≈26 %
      on Earth, 0 % elsewhere). A total outside ±20 % stops the task: report, don't ship.
- [ ] Desktop offline inventory: confirm `tools/deploy/syncR2.ts:136-152` picks up the horizon
      archives and globe images with no edit (docs/DESKTOP.md).
- [ ] **Owner step:** `npm run sync-r2-secure`. The plan does not run it.

---

### Task 9: verification (perf gate and eye check)

**Files:** none (results in the PR description).

- [ ] `npm run perf -- --url http://localhost:<port>` at `mars-jezero-146km` with the Jezero time
      below, horizon present vs main: added GPU ≤ ≈1 ms. Over budget stops the PR.
- [ ] Shots (`npm run shot -- '<url>' --url …`) at the six poses, compared side by side with the
      spike's `.claude/desk/bake-spike/*-bakeC4.jpg` (spike worktree); the owner gives the verdict.

| Name | Hash |
| ---- | ---- |
| `moon-orbit` | `#t=2026-11-17T21:00:00Z&pose=b,moon,1671428.5746436643,-146231.05217461428,449568.6813430785,1724019.9627058222,-150048.47521049468,496213.4461940356,-0.0935358431622793,-0.9953265391079159,0.024002637175518145,0.2723434327631185,-0.04876744286548726,-0.9609634702459621,-0.9576429922861245,0.0833475678338578,-0.27563215026817584` |
| `copernicus` | `#t=2026-11-19T04:00:00Z&pose=b,moon,1608473.643784887,-587981.1945280053,290275.1317815381,93023.45730666348,-31727.957511191125,138347.29163551924,-0.34607449984574395,-0.9380424868369218,0.01757081231250831,0.7614252598549945,-0.29175795877019267,-0.5788858843926018,-0.5481459789246587,0.18695878257801585,-0.8152192339522382` |
| `everest` | `#t=2026-11-20T01:12:00Z&pose=b,earth,302026.5799220264,5622188.772926215,2992181.369269421,-15309.381167163592,7862.324646996292,40044.48657617742,0.8856358550179397,-0.25435431727453484,0.38852672184863707,0.30377092775425485,0.9501393880231002,-0.07041567139783671,0.35124401170406044,-0.18038576609836518,-0.9187429562348458` |
| `everest-top` | `#t=2026-11-20T01:24:00Z&pose=b,earth,302026.5799220264,5622188.772926215,2992181.369269421,12075.054325861242,50101.82467829737,32495.054420409902,0.4859427475041479,0.3901286628663609,-0.7820864866229472,-0.8512220637087917,0.4141850749145063,-0.322291361928009,-0.19819345196919586,-0.8223444230540938,-0.5333563587962216` |
| `valles` | `#t=2026-11-20T02:00:00Z&pose=b,mars,1395956.516613093,-2993638.410607194,-762584.0742257023,99562.13942499511,-337221.3870929228,172444.3494986403,-0.9062901565760717,-0.37105994018612454,-0.20236766758153216,0.3376465890647829,-0.347621925318936,-0.8747306888011156,-0.25423007883851473,0.8610885656113579,-0.4403334522690011` |
| `jezero` | `#t=2026-11-20T16:21:00Z&pose=b,mars,691403.5436897384,3139457.9759868933,1068139.0390700782,13398.757351951235,34480.79569896407,48551.77155165493,0.9746901454013925,-0.16237362891140072,-0.15366823058639975,0.042348923322054366,0.809025631138166,-0.5862457648929799,-0.21951238951566024,-0.5649002857103499,-0.795425658407805` |
| `grand-canyon` | author at a low sun with the app's share link; the spike has none |

- [ ] Everest (spec §11, left open): the owner decides from the `everest` pair whether it ships as is.

---

### Task 10: docs

**Files:** `docs/RENDERER.md` (the horizon lane, sentinel, `horizonLookup`, `composeSurfaceLight`),
`docs/DATA.md` (the horizon product, the bake order: height → horizon → pack, the re-bake rule:
a height re-bake re-bakes horizon over the area grown by the search radius), `docs/BACKLOG.md`
(remove nothing; the Moon polar double-shadow item stays).

- [ ] Write; `npm run format`. Commit.

---

## Review Focus

- **A flat tile under a hilly ancestor must read lit.** `resolveStandaloneRect` stops at `'empty'`
  (PR A); Task 5 maps it to the sentinel. A reviewer checks no path maps `'empty'` to the ancestor.
- **Post-to-texel order.** A wrong order gives plausible, wrong shadows. Task 1's `horizonTexelOf`
  test and parity test pin it; the shader must read through the same rule, not a re-derivation.
- **Azimuth convention.** Clockwise from north in bake and shader; a mirrored convention puts
  shadows on the sunward side. Task 6's shots at low sun show it.
- **Poles.** The local east/north frame degenerates at ±90°; bake and shader must share one
  convention (Task 6 rule).
- **Hand-off.** Globe and tiles must read the same values where the cut starts (Task 7 + Task 6
  share `horizonLookup`); the `moon-orbit` → `copernicus` zoom shows any pop.

## Definition of Done

- **Deliverables:** `'horizon'` product row and lane row; `horizonAngleMap` (TS + WGSL);
  `bakeSurfaceHorizon.ts` + `npm run bake-horizon`; `PatchInstance.horizonRect` (112-byte stride);
  `lib/horizonLookup.wesl`; `'horizon'` `TextureKind` with Earth, Moon, Mars rows; baked archives
  and globe images for all three bodies.
- **Observable:** at the six poses, shadows fall away from the sun; Copernicus's floor partly in
  its rim's shadow at the 6° sun pose; long terminator shadows on the Moon from orbit; Earth's shadowed
  valleys keep their (scaled) ambient; night lights unchanged; perf ≤ ≈1 ms added at Jezero.
- **Deferred:** sky-view LUT tint (backlog), mesh-body shadows, shadows in the air, the Moon polar
  double shadows (judged, not fixed), the Everest question beyond the owner's verdict, Jezero's wider
  HiRISE window (backlog).
