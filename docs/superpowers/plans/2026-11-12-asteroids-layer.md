# Asteroids Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `asteroids` Layer that draws every numbered minor planet (~900k, MPCORB) as an
apparent-magnitude point, positioned by two-body Kepler on the GPU, with pick, search, card, follow and
the selected orbit ring.

**Architecture:** A build-time bake (`tools/asteroids/`) writes a quantized columnar `.astb` plus a names
file. The Layer decodes it into an equatorial Kepler basis on the GPU. A compute pass writes heliocentric
positions only when sim time changes, and a dot pass reads them. The CPU mirrors the same solve in f64 for
follow, card and ring. Part A is a prep refactor that lands as its own PR first.

**Tech Stack:** TypeScript, WebGPU/WESL, Vite, RTK, Vitest; the existing Layer contract.

**Spec:** `docs/superpowers/specs/2026-11-12-asteroids-layer-design.md`

## Global Constraints

- The world frame is equatorial J2000, in Mpc. MPCORB angles are ecliptic J2000: rotate by
  ε = 23.4392911° at decode.
- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`. No barrels.
- Layer folder layout per `src/layers/README.md` (concern modules, ≤ 15 files per folder,
  `selection/` root files).
- The Layer is off at boot. Every class is on.
- The mesh-drawn numbers `[1, 4, 101955, 134340]` are never drawn, picked or searched.
- Display window 1900–2100 (TT), with a smoothstep fade over the last year at each edge.
- Comments: why, not what; module header ≤ 10 lines (`docs/superpowers/conventions/comments.md`).
- File moves go through `npm run move-files`, never `git mv`.
- Never `git stash`.

## Review Focus

1. **A deep link to a meshed number** (`#focus=asteroid-4`) is not claimed by the asteroid row, so it
   never selects a hidden dot. Test owned by Task 9.
2. **Sim time outside 1900–2100**: the Layer draws nothing and the card shows no stale "now" values.
   Tests owned by Tasks 5 and 8.
3. **A row with no H** (MPCORB blank) still draws at the fixed dim flux and its card says "H unknown",
   never NaN. Tests owned by Tasks 3 and 6.
4. **e near 1** (e.g. 0.99 comets-turned-asteroids such as (5335) Damocles e≈0.87, and synthetic 0.99)
   converges: the f32 solver residual stays under 2e-7. Test owned by Task 5.
5. **An invisible asteroid never takes a click**: the pick stamp culls exactly like the dots (class,
   hidden, flux floor). Test owned by Task 8.

---

## Part A — Prep: one trail packing helper (own PR, lands first)

### Task 1: `drawOrbitConics` + `orbitTrailView`; core and satellites switch to them

**Files:**
- Create: `src/@types/rendering/orbitTrailRenderer/OrbitTrail.d.ts`,
  `src/@types/rendering/orbitTrailRenderer/OrbitTrailView.d.ts`,
  `src/services/engine/frame/orbitTrailView.ts`, `src/services/engine/frame/drawOrbitConics.ts`
- Modify: `src/services/engine/frame/passes/orbitTrailsPass.ts:55-127`,
  `src/layers/satellites/orbits/passes/satelliteOrbitsPass.ts:24-85`
- Test: `tests/services/engine/frame/drawOrbitConics.test.ts`

**Interfaces — Produces:**

```ts
export type OrbitTrail = OrbitConic & { readonly color: Readonly<Vec3>; readonly fade: number };
export type OrbitTrailView = {
  readonly slabVp: Float64Array;          // view.slab.vp — NEVER view.vp (writeOrbitTrailRecord's invariant)
  readonly viewportPx: Readonly<Vec2>;
  readonly eyeMpc: Readonly<Vec3>;        // ctx.drawCamPos
  readonly pxPerRad: number;              // ctx.drawPxPerRad
  readonly occluders: /* return type of sceneOccluderSpheres */;
  readonly depth: /* return type of sampledDepthBinding */;
  readonly showImpostor: boolean;         // state.settings.debug.overlays['orbit-trail-impostor']
};
export function orbitTrailView(view: FrameView, ctx: ReadyFrameContext, state: PassState): OrbitTrailView;
export function drawOrbitConics(pass: GPURenderPassEncoder, renderer: OrbitTrailRenderer,
  trails: readonly OrbitTrail[], at: OrbitTrailView): void;
```

Use the exact parameter types the two passes already pass (read `OrbitTrailDrawArgs.d.ts`). The staging
`Float32Array` lives in a module-level variable inside `drawOrbitConics.ts`, grown on demand, as
`orbitTrailsPass.ts:28` does today. That is safe because the call ends with `renderer.draw`, which copies
it into the renderer's buffer. `drawOrbitConics` returns without calling `draw` when no trail survives.

- [x] Test `draws only the trails writeOrbitTrailRecord accepts`: one far sub-pixel trail and one
      on-screen trail, with a fake renderer that records `count`. Assert `count === 1`.
- [x] Test `does not call draw when every trail is culled`: the fake renderer's `draw` is never called.
- [x] Implement both functions. Rewrite `orbitTrailsPass.draw` to build its `OrbitTrail[]` from the body
      states (keeping the centre-anchoring arithmetic at `:86-94` and the `selectedOnly` skip) and call
      `drawOrbitConics`. Rewrite `satelliteOrbitsPass.draw` the same way.
- [x] `npm run typecheck:fast`; `npx vitest run tests/services/engine/frame tests/layers/satellites/orbits`.
- [x] Commit `Orbit trails: one packing helper for core and satellites`.

**Controller after Task 1:** create branch `asteroids-orbit-conics` at this commit, push, and open the
prep PR against `main`. Then report the flow with `prep: true`. The feature PR is stacked on it.

---

## Part B — The asteroids Layer

### Task 2: Raw data fetch and shared constants

**Files:**
- Create: `tools/fetch/fetchMpcorb.ts`, `src/data/asteroids/asteroidClasses.ts`,
  `src/@types/asteroids/AsteroidClass.d.ts`, `src/data/asteroids/asteroidCatalogPaths.ts`
- Modify: `tools/utils/io/rawDataRegistry.ts` (rows `mpcorb` and `mpcorb.readme`, beside `celestrak`
  at `:2176`), `package.json` (`fetch-mpcorb`)
- Create (data): `data/raw/mpcorb/README.md` (MPC's format doc and terms, copied verbatim with source URL)

**Interfaces — Produces:**

```ts
export const ASTEROID_CLASSES = ['nearEarth', 'mainBelt', 'hilda', 'jupiterTrojan', 'distant'] as const;
export type AsteroidClass = (typeof ASTEROID_CLASSES)[number];   // class code = index in the tuple
export const ASTEROID_CATALOG_PATHS = { catalog: 'asteroids/asteroids.astb', names: 'asteroids/asteroid-names.bin' } as const;
```

- [x] `fetchMpcorb` downloads `MPCORB.DAT.gz` through the raw-data registry, following
      `tools/fetch/fetchCelestrak.ts`. No test: plumbing.
- [x] (Not re-run: the controller had already fetched the file to the registry path.) Run `npm run fetch-mpcorb` once (94 MB gz, 321 MB unpacked; the owner has been told) through the
      registry path. Keep the `.gz` and read it with a gunzip stream: no unpacked copy on disk.
- [x] `data/raw/mpcorb/README.md` carries the format doc's column table, the packed-number rules, the
      orbit-type values and the header's terms, each with its source URL.
- [x] Commit `Asteroids: fetch MPCORB and the shared class list`.

### Task 3: The bake — MPCORB → `.astb` + names (review: yes)

**Files:**
- Create: `tools/asteroids/parseMpcorbLine.ts`, `tools/asteroids/decodePackedNumber.ts`,
  `tools/asteroids/decodePackedEpoch.ts`, `tools/asteroids/asteroidClassFromOrbitType.ts`,
  `tools/asteroids/propagateToEpoch.ts`, `tools/asteroids/buildAsteroids.ts`,
  `tools/utils/io/writeAsteroidCatalog.ts`, `tools/@types/asteroids/MpcorbRow.d.ts`,
  `src/data/asteroids/asteroidFormat.ts`
- Modify: `package.json` (`build-asteroids`), `tools/deploy/r2/dataFamilies.ts` (a row like
  stellar-streams at `:74`), `docs/DATA.md` (format table row `ASTB`, the refresh order)
- Test: `tests/tools/asteroids/*.test.ts` (mirror the tools tree)

**Format (pinned, little-endian), `src/data/asteroids/asteroidFormat.ts` holds the constants:**

| offset | type | field |
|---|---|---|
| 0 | u8×4 | magic `ASTB` |
| 4 | u16 | version = 1 |
| 6 | u16 | column count = 9 |
| 8 | u32 | row count N |
| 12 | u32 | firstNumber = 1 |
| 16 | f64 | epoch JD (TT) |
| 24 | {u16 id, u16 pad, u32 offset}×9 | column directory; each column 4-byte aligned |

| column id | name | type | encoding |
|---|---|---|---|
| 0 | a | f32 | AU |
| 1 | e | u24 | round(e·2²⁴); the build throws on e ≥ 1 |
| 2–5 | i, Ω, ω, M₀ | u24 | round(turns·2²⁴) mod 2²⁴, ecliptic J2000 |
| 6 | H | u16 | round((H+5)·100); 0xFFFF = none |
| 7 | G | u8 | round((G+0.5)·100); MPC blank → 0.15 |
| 8 | flags | u8 | bits 0–2 class code, bit 3 NEO (MPC bit 11), bit 4 PHA (MPC bit 15), bit 5 ABSENT; bits 6–7 zero |

**MPCORB facts** (format doc https://minorplanetcenter.net/iau/info/MPOrbitFormat.html, checked
2026-11-12; 1-based columns): packed designation 1–7, H 9–13, G 15–19, packed epoch 21–25, M 27–35,
peri 38–46, node 49–57, incl 60–68, e 71–79, n 81–91, a 93–103, flags (4 hex) 162–165, readable
designation 167–194. Every line is 202 characters. Skip the header through the first line that starts
with `-----` (line 43). The numbered section comes first and ends at the first blank line. Numbered rows
have a 5-character packed number in columns 1–5: below 100000 plain digits; 100000–619999 a letter
(A–Z = 10–35, a–z = 36–61) plus 4 digits; ≥ 620000 `~` plus 4 base-62 digits (0–9, A–Z, a–z) holding
number − 620000. On 2026-11-11 the file held 895,909 numbered rows for numbers 1…895,910, every sampled
row at epoch `K2669` (JD 2461200.5).

**Gaps.** The number sequence has holes (one today). The bake writes an ABSENT placeholder row for each
missing number (zeros, H = 0xFFFF, flags bit 5), so row k is always number k + 1. It logs the gaps and
throws if there are more than 100, since that means the parse is wrong.

Names file: u32 count, then `u32 numbers[count]` (sorted ascending), `u32 offsets[count+1]`, and a UTF-8
blob. Only named rows go in, meaning the readable designation is `(n) Name` and not `(n) 2026 DM18`.

**Class mapping** from the orbit type, the low 6 bits of the flags column (mask 0x3F): 1 Atira, 2 Aten,
3 Apollo, 4 Amor → `nearEarth`; 8 Hilda → `hilda`; 9 Jupiter Trojan → `jupiterTrojan`; 10 Distant object →
`distant`; everything else (0, 5 q < 1.665 AU, 6 Hungaria, 7 and undefined values) → `mainBelt`. No
element-space fallback: the field is always present.

Rows at another epoch are propagated to the dominant epoch by advancing M by n·Δt (two-body; n from a
with k = 0.01720209895 rad/day).

**Terms.** MPCORB's header (lines 10–16) allows inclusion "as long as this header is included (it is
acceptable if it is contained in a file separate from the actual data)", with attribution to the MPC
and how to get updated copies. So the bake also writes `public/data/asteroids/mpcorb-header.txt`: the
43 header lines verbatim, plus a line saying the elements are derived and quantized, plus the update URL
https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT. Add it to the same `DATA_FAMILIES` row.

- [x] Test `decodePackedNumber reads plain, letter and tilde forms` with `00001`→1, `A0000`→100000,
      `~0000`→620000, and one more tilde value checked against the MPC doc.
- [x] Test `decodePackedEpoch reads K2555` and one other packed date (values from the doc).
- [x] Test `parseMpcorbLine reads Ceres` on the real first data line of the fetched file (pasted as a
      fixture): number 1, a within 1e-7 of the line, H, G, class `mainBelt`.
- [x] Test `asteroidClassFromOrbitType maps each documented type`.
- [x] Test `writer round-trips one row within one quantization step`: write, read back with a
      tiny reader in the test, assert |Δangle| ≤ 0.5 step and that a is bit-exact as f32.
- [x] Test `a gap in numbering writes an ABSENT row and keeps row k = number k + 1`, and `throws on e >= 1`.
- [x] Test `blank H writes 0xFFFF`.
- [x] `npm run build-asteroids` writes `public/data/asteroids/*` through the manifest like other
      families. Record row count, raw and brotli sizes in the commit message.
- [x] Commit `Asteroids: bake MPCORB into ASTB and a names file`.

### Task 4: Decode into the GPU basis (review: yes)

**Files:**
- Create: `src/layers/asteroids/catalog/load/parseAsteroidCatalog.ts`,
  `src/layers/asteroids/catalog/@types/AsteroidCatalog.d.ts`,
  `src/layers/asteroids/catalog/data/meshAsteroidNumbers.ts`
- Test: `tests/layers/asteroids/catalog/parseAsteroidCatalog.test.ts`

**Interfaces — Produces:**

```ts
export type AsteroidCatalog = {
  readonly epochJd: number; readonly count: number;      // number of row k = k + 1
  readonly a: Float32Array; readonly e: Float32Array;    // decoded f32: exactly what the GPU gets
  readonly i: Float32Array; readonly node: Float32Array; readonly peri: Float32Array; readonly m0: Float32Array; // rad, ecliptic
  readonly elementsA: Float32Array;  // 4 per row: A = a·P̂ (equatorial, AU), e
  readonly elementsB: Float32Array;  // 4 per row: B = a·√(1−e²)·Q̂ (equatorial, AU), n (rad/day)
  readonly extra: Uint32Array;       // 2 per row: bitcast f32 M₀, packed = Hcenti:16 | G:8 | flags:8
  readonly hCenti: Uint16Array; readonly g: Uint8Array; readonly flags: Uint8Array;
};
export const MESH_ASTEROID_NUMBERS: readonly number[] = [1, 4, 101955, 134340]; // drawn as bodies
export const ASTEROID_ABSENT_FLAG = 1 << 5; // written by the bake for a missing number
export const ASTEROID_HIDDEN_FLAG = 1 << 7; // set at decode on MESH_ASTEROID_NUMBERS rows and on ABSENT rows
export function parseAsteroidCatalog(buffer: ArrayBuffer): AsteroidCatalog;
```

The decode throws on a wrong magic or version, with the message pattern the other parsers use.

- [x] Test `decoded basis gives keplerianPositionMpc's position at the epoch` for one synthetic row
      (build it in-test with the Task 3 writer): A·(cos E − e) + B·sin E vs
      `src/utils/orbit/keplerianPositionMpc.ts` in the same frame, within 1e-6 AU.
- [x] Test `hides the four mesh numbers and ABSENT rows, and no other row`.
- [x] Test `rejects a wrong magic`.
- [x] Commit `Asteroids: decode ASTB into the equatorial Kepler basis`.

### Task 5: Kepler solve on GPU and CPU, and the time window (review: yes)

**Files:**
- Create: `src/services/gpu/shaders/lib/kepler.wesl`, `src/utils/orbit/solveKeplerFixed.ts`,
  `src/layers/asteroids/kepler/utils/asteroidHelioAu.ts`,
  `src/layers/asteroids/kepler/utils/asteroidWindowFade.ts`,
  `src/layers/asteroids/kepler/data/asteroidWindow.ts`
- Test: `tests/utils/orbit/solveKeplerFixed.test.ts`, `tests/layers/asteroids/kepler/*.test.ts`

**Interfaces — Produces:**

```ts
// The one algorithm, on both sides: reduce M to [−π, π]; E₀ = M + 0.85·e·sign(M); 5 Halley steps,
// each |ΔE| clamped to ≤ 1. `round` lets the test emulate f32 (pass Math.fround).
export function solveKeplerFixed(meanAnomalyRad: number, e: number, round?: (x: number) => number): number;
// f64 heliocentric equatorial position in AU of row k at simJd (TT), same inputs as the GPU.
export function asteroidHelioAu(catalog: AsteroidCatalog, k: number, simJd: number): Vec3;
export const ASTEROID_WINDOW = { startJd: /* 1900-01-01 TT */, endJd: /* 2100-01-01 TT */, fadeDays: 365.25 } as const;
export function asteroidWindowFade(simJd: number): number; // 0 outside, smoothstep over fadeDays inside each edge
```

`kepler.wesl` exports `fn solveKeplerFixed(m: f32, e: f32) -> f32`, the same steps as the TS function
(read the `wesl-shaders` skill first).

- [x] Test `f32 emulation converges on a grid`: e ∈ {0, 0.1, …, 0.9, 0.95, 0.99} × 721 values of M. With
      `Math.fround`, assert |E − e·sin E − M| < 2e-7.
- [x] Test `f64 agrees with eccentricAnomalyFromMean` to 1e-12 on the same grid (`src/utils/orbit/eccentricAnomalyFromMean.ts`).
- [x] Test `asteroidHelioAu matches the decoded basis at the epoch` (simJd = epochJd).
- [x] Test `window fade is 0 before 1900, 1 in 2000, 0 after 2100, and monotone over the last year`.
- [x] Commit `Asteroids: one fixed-step Kepler solver for GPU and CPU`.

### Task 6: Apparent magnitude (review: yes)

**Files:**
- Create: `src/utils/photometry/asteroidApparentMagnitude.ts`,
  `src/services/gpu/shaders/asteroids/lib/apparentMagnitude.wesl`,
  `src/layers/asteroids/points/data/asteroidPhotometry.ts`,
  `src/layers/asteroids/points/utils/asteroidExposureRamp.ts`
- Test: `tests/utils/photometry/asteroidApparentMagnitude.test.ts`,
  `tests/layers/asteroids/points/asteroidExposureRamp.test.ts`

**Interfaces — Produces:**

```ts
// V = H + 5·log10(r·Δ) − 2.5·log10((1−G)Φ₁ + G·Φ₂); Φᵢ = exp(−Aᵢ·tan(α/2)^Bᵢ), A = [3.33, 1.87], B = [0.63, 1.22];
// tan(α/2) = √((1−cosα)/(1+cosα)), cosα = dot(sun→ast, cam→ast) / (r·Δ).
export function asteroidApparentMagnitude(h: number, g: number, rAu: number, deltaAu: number, cosPhase: number): number;
export const ASTEROID_PHOTOMETRY = {
  noHMagnitude: /* fixed V for rows with no H; state it */, minFlux: /* discard floor, after the lift */,
  rampNearAu: 1.5, rampFarAu: /* eye-tuned */, rampFarLift: /* eye-tuned */,
} as const;
// Display lift by camera distance from the Sun (owner ruling: the stars' approach, cf. starExposureRamp):
// exactly 1 at d ≤ rampNearAu; geometric (log lift vs log d) up to rampFarLift at rampFarAu; flat beyond.
export function asteroidExposureRamp(camSunDistAu: number): number;
```

The exposure the shader gets is `asteroidExposureRamp(d) × settings.asteroids.brightness` (Task 7), on top
of `STAR_FLUX_EXPOSURE`. Tune the far anchors in Task 8 with shots: from 10 AU above the ecliptic, the belt,
the Hildas' triangle and the Trojan clouds must read clearly, without the belt saturating into a sheet.

The WGSL mirror computes flux as `pow(10, −0.4·V)` and feeds `starPeakIntensity` and `STAR_FLUX_EXPOSURE`
from `shaders/lib/starPhotometry.wesl:120-166`, the stars' convention (theirs:
`10^(−0.4·absMag)·D_REF²/d²`, D_REF = 10 pc, which is the same number).

- [x] Test `matches Horizons V`: three numbered asteroids (e.g. 3 Juno, 433 Eros, 624 Hektor) at
      2026-01-01T00:00 TT. Take r, Δ, α and V from JPL Horizons (curl the API; record the query in the
      test header) and assert |V − Horizons V| < 0.05 using Horizons' own H and G.
- [x] Test `opposition gives the brightest V and no NaN at cosα = 1`.
- [x] Test `exposure ramp is exactly 1 inside the near anchor, monotone, and flat past the far anchor`.
- [x] Commit `Asteroids: apparent magnitude on CPU and GPU`.

### Task 7: The Layer skeleton — state, visibility, settings, loading (review: yes)

**Files:**
- Create: `src/layers/asteroids/{layer,create,destroy,frame,visibility}.ts`,
  `src/layers/asteroids/@types/{AsteroidsRuntime,AsteroidsSettings,AsteroidsAssetKey}.d.ts`,
  `src/layers/asteroids/state/{slices.ts, asteroids/{slice,initialState,selectors}.ts}`,
  `src/layers/asteroids/catalog/load/{asteroidsSlot,asteroidsAssetRows,asteroidNamesSlot}.ts`,
  `src/layers/asteroids/controls/ui/{AsteroidsSection,AsteroidsSectionContainer}.tsx`,
  `src/layers/asteroids/controls/data/asteroidClassLabels.ts`,
  `src/layers/asteroids/points/data/asteroidFades.ts`
- Modify: `src/compositions/app.ts` (import, `layers` row, the `typeof` tuple: `:25,:39,:62` pattern),
  `src/compositions/appSettingsSlices.ts`, `src/compositions/appVisibility.ts`,
  `tests/state/settings/makeSettingsFixture.ts:76,131`, `tests/support/layerPickCodes.ts` (if picks are
  allocated by entry)

**Contracts:**

```ts
export type AsteroidsSettings = {
  readonly enabled: boolean;
  readonly classes: Readonly<Record<AsteroidClass, boolean>>;
  readonly brightness: number;   // the Layer's own flux multiplier (owner ruling), independent of the stars'
};
// initialState: enabled false, every class true, brightness 1.
export const asteroidsVisibility = [{
  key: 'asteroids', items: ASTEROID_CLASSES, selects: ['asteroid'],
  bands: { solarSystem: { out: [/* fullWithin */, /* goneBeyond */], from: 'sun' } },
}] as const satisfies readonly VisibilityEntry[];
```

Copy satellites' patterns: visibility at `src/layers/satellites/visibility.ts`, settings slice at
`src/layers/satellites/state/satellites/`, asset row at `satellitesAssetRows.ts`
(`demand: { shown: 'asteroids', near: { band: 'solarSystem', edge: 'out', lead, release }, alsoWhen: ['searching'] }`,
priority = next free rung after 85, with a comment naming the rung below). The names slot is a second
asset row that demands only `alsoWhen: ['searching']`. Bands: fully in within 200 AU of the Sun, gone
beyond 2,000 AU (`SCALE_UNITS`). The Settings section follows `SatellitesSection.tsx`: the master toggle
plus five class toggles, labels from `asteroidClassLabels`, and a brightness slider. Copy the stars'
brightness slider control (find it in `src/layers/starCatalog/controls/ui/`) for the range, the
log/linear scale and the component. Load the `create-component` skill and read
`docs/superpowers/conventions/ui-ux.md` before writing it. The slot decodes off the main thread
(`DecompressionStream` if the CDN serves raw brotli, else a module worker; read how `satellitesSlot`
fetches).

- [x] Test `settings start off with every class on and brightness 1` (initialState).
- [x] Test `the asset row demands only while shown and inside the band, or while searching` against
      the demand evaluator, the way satellites' asset tests do (`tests/layers/satellites/catalog/`).
- [x] Run the app (`/dev`): toggling Asteroids in Settings loads the file once (Network tab), and
      toggling off releases it past the evict radius. Note it in the commit; no test (UI wiring).
- [x] Commit `Asteroids: Layer skeleton, settings and demand-gated loading`.

### Task 8: GPU — Kepler compute, dots, pick stamp (review: yes)

**Files:**
- Create: `src/services/gpu/shaders/asteroids/kepler/compute.wesl`,
  `src/services/gpu/shaders/asteroids/points/{io,vertex,fragment,pick}.wesl`,
  `src/layers/asteroids/kepler/computes/asteroidKeplerCompute.ts`,
  `src/layers/asteroids/kepler/subsystems/createAsteroidKeplerBuffers.ts`,
  `src/layers/asteroids/points/render/asteroidPointRenderer.ts`,
  `src/layers/asteroids/points/@types/AsteroidPointRenderer.d.ts`,
  `src/layers/asteroids/points/passes/asteroidsPass.ts`,
  `src/layers/asteroids/points/data/{asteroidPointStyle,asteroidClassColors}.ts`,
  `src/layers/asteroids/points/subsystems/packAsteroidUniforms.ts`
- Modify: `src/data/rendering/frameSections.ts` (plan line after `satellites` at `:23`; the compute line
  among the PRELUDE computes; `'asteroids'` beside `'satellites'` in POST_FOREGROUND at `:282`),
  `tools/site/matteHiddenPasses.ts:35`, `src/layers/asteroids/layer.ts` (`computes`, `passes`, `planners`)

**GPU buffers** (storage, read-only in the vertex stage; created when the slot lands, destroyed on
release):

| binding | buffer | per row |
|---|---|---|
| elementsA | `array<vec4f>` | A.xyz, e |
| elementsB | `array<vec4f>` | B.xyz, n |
| extra | `array<vec2u>` | bitcast M₀, packed (Hcenti:16, G:8, flags:8) |
| helio | `array<vec4f>` (compute writes) | xyz AU, r |

**Compute uniforms (16 B):** `dtWholeDays: f32 @0` (an integer value), `dtFracDays: f32 @4`,
`count: u32 @8`, pad @12. `dt = simJd − epochJd`, split on the CPU in f64. The compute encodes on every
frame the Layer draws, with no memo of the last time (spec §4.3). Its cost is measured in Verify.

**Point uniforms (208 B), `AsteroidUniforms` in `points/io.wesl`:**

| field | type | offset |
|---|---|---|
| viewProj (camera-relative) | mat4x4f | 0 |
| sunFromCamAu | vec3f | 64 |
| exposure (= asteroidExposureRamp × brightness) | f32 | 76 |
| viewportPx | vec2f | 80 |
| pxPerRad | f32 | 88 |
| classMask | u32 | 92 |
| classColor | array<vec4f, 5> | 96 |
| selectedRow | u32 (0xFFFFFFFF = none) | 176 |
| windowFade | f32 | 180 |
| pickBase | u32 | 184 |
| sizePx | f32 | 188 |
| selectedCamRelAu | vec3f | 192 |
| _pad | f32 | 204 |

Pin these offsets with an `ASTEROID_UNIFORM_OFFSETS` table in the renderer, the way
`satellitePointRenderer.ts:40-55` does. The vertex stage culls a row when its class bit is off in
`classMask`, when its hidden flag is set, or when its flux is under `ASTEROID_PHOTOMETRY.minFlux`. For
`selectedRow` it uses `selectedCamRelAu` instead of `helio + sunFromCamAu`. The pick stamp culls with the
same function the vertex stage uses (one WGSL fn, both entry points). The pick stamp writes
`packSelection(pickCode, row)` + `PICK_SENTINEL_OFFSET` into r32uint, wider than the dot
(`asteroidPointStyle.pickRadiusPx`). The pass gate is the class fade times `asteroidWindowFade`, and it
draws nothing until buffers exist.

- [x] Test `uniform offsets match the WGSL struct` (parse `points/io.wesl` the way existing offset parity
      tests do; grep `UNIFORM_OFFSETS` in `tests/` for the pattern).
- [x] Test `the pick stamp and the dot share one cull`: the pick entry point calls the same WGSL cull fn as
      the vertex entry (a source-level check on the linked shader, the way other WGSL parity tests do).
- [x] Test `the pass is disabled outside the window` (windowFade 0).
- [x] Shot check (`npm run shot`) of the belt from above at
      `#focus=sun&t=2026-11-12T00:00:00.000Z` with the Layer on. Look at it before committing.
- [x] Commit `Asteroids: Kepler compute, dots and pick stamp`.

### Task 9: Selection, follow, search, cards, exhibits (review: yes)

**Files:**
- Create: `src/layers/asteroids/selection/{kinds.ts,asteroidsSelectionRow.ts}`,
  `src/layers/asteroids/selection/@types/{AsteroidRef,AsteroidSelectionRow,AsteroidInfo}.d.ts`,
  `src/layers/asteroids/selection/present/asteroidTransientId.ts`,
  `src/layers/asteroids/focus/present/{asteroidFocusPrefix,encodeAsteroidFocusId,asteroidsSearch}.ts`,
  `src/layers/asteroids/focus/ui/{AsteroidDetailCard,CompactAsteroidCard}/*.tsx|.module.css`,
  `src/layers/asteroids/focus/data/asteroidClassEyebrows.ts`
- Modify: `src/layers/asteroids/layer.ts` (`selection`, `search`, `ui` detailCard row `type: 'asteroid'`),
  `src/layers/body/exhibits/solarSystem/solarSystem.ts:31`,
  `src/layers/missions/exhibits/voyagerMissions/voyagerMissions.ts:42`,
  `src/compositions/exhibits/zoneOfAvoidance/zoneOfAvoidance.constants.ts:22` (`'asteroid'` next to
  `'satellite'` in `picking.off`)

**Contracts:**

```ts
export type AsteroidRef = { readonly type: 'asteroid'; readonly number: number };
export const ASTEROID_FOCUS_PREFIX = 'asteroid-';   // `asteroid-433` is Eros
// asteroidTransientId(number) → `transient:asteroid-${number}`
```

Mirror `src/layers/satellites/selection/satellitesSelectionRow.ts`: `resolvePick` (row → number = row + 1),
`encodePick`, `extractRow` (the world position = Sun's snapshot position + `asteroidHelioAu`·AU in
Mpc, f64, with `driver.placedEachFrame` and `followsSimClock`), and `focusId.{claims,decode,encode}`.
`claims` accepts `asteroid-<digits>` only, and never a number in `MESH_ASTEROID_NUMBERS` (spec §4.6:
not claimed, no redirect). Search yields the named rows only, from the names slot, each
entry labelled `(433) Eros`, mirroring `satellitesSearch.ts`. The detail card shows number and name,
class, a, e, i (deg), period (years), H (or "H unknown"), distance from the Sun and from Earth now, V now,
and the data epoch. Outside the window it shows the elements but no "now" values. The compact card shows
name or number, class and V.

- [ ] Test `pick round-trips row 432 to Eros's ref and back`.
- [ ] Test `focus id asteroid-433 decodes to number 433; asteroid-4 is not claimed`.
- [ ] Test `claims rejects asteroid-x and asteroid-` (no catch-all).
- [ ] Test `extractRow places the asteroid where asteroidHelioAu says, in world Mpc`.
- [ ] Test `search yields named rows only and skips the meshed numbers`.
- [ ] Test `card shows H unknown for a row with no H, and no now values outside the window`.
- [ ] Commit `Asteroids: pick, follow, search and cards`.

### Task 10: The selected orbit ring

**Files:**
- Create: `src/layers/asteroids/orbits/passes/asteroidOrbitsPass.ts`,
  `src/layers/asteroids/orbits/utils/asteroidOrbitTrail.ts`
- Modify: `src/layers/asteroids/layer.ts`, `src/layers/asteroids/create.ts` (`orbitRenderer:
  createOrbitTrailRenderer(...)`), `src/data/rendering/frameSections.ts` (`'asteroid-orbits'` beside
  `'satellite-orbits'`), `tools/site/matteHiddenPasses.ts`

**Interfaces:**

```ts
// The Kepler ellipse of row k at simJd: centred on sunMpc (f64), the lobe at the row's current mean anomaly.
export function asteroidOrbitTrail(catalog: AsteroidCatalog, k: number, simJd: number, sunMpc: Readonly<Vec3>,
  color: Readonly<Vec3>, fade: number): OrbitTrail;
```

The pass collects the selected and focused asteroid rows and calls
`drawOrbitConics(pass, runtime.orbitRenderer, trails, orbitTrailView(view, ctx, state))` (Task 1).
Fade = class fade × `asteroidWindowFade`.

- [ ] Test `the trail passes through the dot`: the conic point at its own mean anomaly equals
      `sunMpc + asteroidHelioAu·AU` within 1e-9 relative.
- [ ] Commit `Asteroids: the selected asteroid's orbit ring`.

### Task 11: Docs, website, attributions

**Files:**
- Modify: `docs/RENDERER.md` (the compute pass and `lib/kepler.wesl`), `ATTRIBUTIONS.md` (MPC, with the
  acknowledgement wording from `data/raw/mpcorb/README.md`; never run prettier on it),
  `packages/website/src/content/docs/start/scene.mdx:62` (split the row: "Numbered asteroids | about
  800,000 | Derived", and "Comets, planets of other stars | No"), `.../simplifications.mdx:215`
  (two-body orbits, no perturbations, 1900–2100), `packages/website/src/data/{docsSettings,dataSources,
  dataSourceNotes,dataFamilies,docsCommands}.ts` (the satellites rows at the lines in the spec's trace
  are the pattern), `src/layers/README.md` status list (only if it is touched anyway)

Copy rules: `docs/superpowers/conventions/ui-ux.md` and the `copy` skill's voice. No test.

- [ ] `npm run build -w packages/website` (or the site's check script) passes.
- [ ] Commit `Asteroids: docs, website facts and attribution`.

---

## Verify (controller)

- Perf gate, recorded in the ledger: `npm run perf -- --url http://localhost:<this wt's port>` with the
  Layer off before Part B and after (expect no change), and with the Layer on, flagging any slot over
  2 ms. To force it on, follow the satellites' perf note in the ledger.
- One whole-branch review (spec fidelity and slop). It names `wesl-shaders`, `create-component` and
  `ui-ux.md` for the touched files.
- Smoke checks for the owner (dash `check` items): the belt from above, the Trojans at L4/L5, a pick of an
  asteroid, the card, follow while time runs, the orbit ring, `#focus=asteroid-433` cold, `#focus=asteroid-4`
  (not an asteroid hit), a scrub to 1850 (gone), and all classes toggled.

## Definition of Done

**Deliverables:**
- Prep PR: `drawOrbitConics`, `orbitTrailView`, `OrbitTrail`, `OrbitTrailView`; both trail passes use them.
- `npm run fetch-mpcorb`, `npm run build-asteroids`, a `DATA_FAMILIES` row, `asteroids.astb` and
  `asteroid-names.bin` in `public/data/asteroids/`.
- `src/layers/asteroids/` composed in `app.ts`, off by default, with Settings section, detail and
  compact cards, search, selection kind `asteroid`.
- `lib/kepler.wesl` and `solveKeplerFixed` share one algorithm; `asteroidApparentMagnitude` matches
  Horizons.

**Observable behaviours (smoke):**
- With the Layer on, the main belt, the Kirkwood-thinned rings, the Hildas' triangle and the Trojan
  clouds show from above the ecliptic at the current date.
- From Earth's surface or near Earth the field is sparse and faint, with bright asteroids where a V ≈ 6–9
  object should be.
- A click picks an asteroid, its card opens, and focus follows it as time runs, with its ring through the dot.
- `#focus=asteroid-433` opened cold switches the Layer on and arrives at Eros; `#focus=asteroid-4`
  never selects a hidden dot.
- Each class toggle hides its class alone; 1850 shows nothing.

**Deferral boundary:** unnumbered objects, comets, perturbations, field labels, a scheduled refresh,
H-tiered loading, the README status-list fix (adjacent), and the R2 sync (the owner runs
`npm run sync-r2-secure`).
