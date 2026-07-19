# Photoreal-planet atmospherics — feature PR — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Venus, Mars, Jupiter, Saturn, Uranus, and Neptune an atmosphere — a Bruneton/Hillaire **scattering shell** driven by an authored coefficient row each, and a view-dependent **limb-darkening** term (the dominant gas-giant visual) composed into the shared textured-body fragment. Zero new assets: every effect is either a shell integrated from a data row or a shading term over the surface texture each body already ships. The acceptance win is **six new atmospheres + gas-giant limb darkening**, with **Earth pixel-identical** and the airless bodies (Mercury, Moon, Galileans) unchanged by construction.

**Architecture:** This plan executes **after the prep PR** (`docs/superpowers/plans/2026-07-19-planet-atmospherics-prep-per-body-wiring.md`) has landed, and is written entirely against the **post-prep architecture** (spec §2): `createAtmosphereShellRenderer(device, targetFormat, depthFormat, paramsById)` holds one `AtmosphereBundle` per body id and bakes all bodies in one encoder; `src/services/engine/frame/atmosphereDrawList.ts` is the single per-frame derivation both the bake (`encodeAtmosphereSkyView`) and the draw (`atmosphereShellLayer`) iterate; `initGpu` passes the whole `ATMOSPHERE_PARAMS` table. **This feature adds no renderer code** — the six new rows flow through the already-per-body bundle machinery (spec §4). It touches only DATA (the two folded look fields + six shell rows + a new limb table), the shared textured-body **uniform/packer/fragment** (the limb term), the two consumer pack sites (exposure resolution + `params.sunIrradiance`), and backlog hygiene.

The gas-giant "cloud-tops-as-ground" treatment is pure data: a giant's `planetRadiusKm` is its drawn texture-sphere radius (derived from `SCENE_PLANETS`) and its `atmosphereTopKm` sits a few scale heights above, so the shell is a thin scattering rim with no shader branch distinguishing a giant from a terrestrial body (spec §4, §7).

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders, Vitest. No fetch/build/R2/texture-pipeline changes (spec §1.2).

**Spec:** `docs/superpowers/specs/2026-07-19-photoreal-planets-atmospherics-design.md` (this plan implements §3 data delta, §5.3 exposure branch, §6 limb darkening, §7 params rows, §8 settings, §10 testing, §11 visual pass, §12 backlog hygiene).

**Depends on:** the prep PR's shapes — `atmosphereDrawList(state, ctx): readonly AtmosphereDrawEntry[]` (entry = `{ body, params }`), the reshaped `atmosphereShellLayer` / `encodeAtmosphereSkyView` that iterate it, `createAtmosphereShellRenderer(…, paramsById)`, and the `AtmosphereShellRenderer.d.ts` per-bodyId signatures. **Read the current post-prep files before editing** — do not trust any line offsets below; where a citation shifts, read the current file.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **Zero new assets (spec §1.2):** no textures, no fetch/build/R2 edits, no new `BODY_TEXTURE_REGISTRY` rows. Every planet here already draws through the existing `texturedBodyRenderer`; this plan adds shading terms and shell coefficient rows only.
- **Earth stays pixel-identical (spec §2.3, §5.3):** the Earth atmosphere row's rendered output must not change. Its exposure keeps flowing from the live `settings.earth.atmosphereExposure` slider; `sunIrradiance` stays `1.0`. Folding the two look fields into the Earth row is a value-preserving move (`sunIrradiance: 1.0`, `exposure: 2.35` — the exact `ATMOSPHERE_SHELL_PARAMS` values).
- **Airless bodies unchanged by the data-gate (spec §6.2):** Mercury, the Moon, and the Galilean moons are absent from BOTH new tables, so both terms reduce to identity — `limbDarkening` returns `1.0` at `strength == 0`, and no `ATMOSPHERE_PARAMS` row means no shell. Same data-gate pattern `SCENE_RINGS` / `ATMOSPHERE_PARAMS` already use.
- **Coefficients are eye-tuned, NOT tested (spec §7, §10):** every scattering coefficient, scale height, Mie/ozone term, `groundAlbedo`, `sunIrradiance`, `exposure`, and limb `strength`/`exponent` is an eye-tuned starting point expected to move via HMR. **No numeric coefficient test** — a restatement fails on every legitimate tweak (`conventions/testing.md`). Only STRUCTURAL drift-catchers are tested (spec §10; Tasks 2 + 4).
- **`planetRadiusKm` derives from `SCENE_PLANETS` (spec §7):** each new row derives `planetRadiusKm` from that body's `SCENE_PLANETS` `radiusKm` via a small in-module lookup (the Earth-row precedent: it derives from `SCENE_EARTH.radiusKm`), so the scattering proxy is concentric with the drawn sphere by construction and cannot drift. **Do NOT test `planetRadiusKm === <scene radius>`** — a tautology restating the derivation (spec §10).
- **Uniform byte-layout parity is load-bearing (`conventions/testing.md` keep-rule; CLAUDE.md iOS trap):** the WGSL `TexturedBodyUniforms` struct and the TS `packTexturedBodyUniforms` must agree byte-for-byte — a mislaid uniform silently mis-renders, and on iOS WebKit drops the whole shared-encoder frame with no thrown error. The packer's float indices ARE worth asserting (Task 3).
- **Meticulous WESL (feedback_wgsl_meticulous, feedback_wesl_no_backticks):** `.wesl` edits are delicate. Single quotes in comments, never backticks. `import package::…` literal paths. The struct layout must match the TS packer exactly. WGSL is verified VISUALLY only (spec §10) — no WGSL unit test. Use `createShaderModuleWithDevLog` output if a shader fails to link; a bad textured-body pipeline silently blanks the canvas on iOS.
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name); deep relative imports, no barrels; didactic multi-paragraph module headers (explain *why* + the rejected alternative); `Vec3` alias never raw tuples; stage specific paths on commit (never `git add -A` / `.`); format only touched files. **No TS file moves are expected in this plan** — no `npm run move-files` needed.
- **Dev server:** left running for HMR; never start/kill it. Visual checks ask the user to look (Task 6).

---

## Task 1: Fold `sunIrradiance` + `exposure` into `AtmosphereParams`; delete `ATMOSPHERE_SHELL_PARAMS`; retarget the settings seed + the exposure resolution

**Files:**

- Modify `src/@types/scene/AtmosphereParams.d.ts` (two new fields)
- Modify `src/data/bodies/atmosphereParams.ts` (add the two fields to the Earth row; absorb the deleted table's physics-vs-look docblock)
- Delete `src/data/bodies/atmosphereShellParams.ts`
- Modify `src/state/settings/initialState.ts` (seed from `ATMOSPHERE_PARAMS.earth.exposure`)
- Modify `src/@types/settings/EngineSettingsState.d.ts` (docstring reference)
- Modify `tests/state/settings/makeSettingsFixture.ts` (drop the `ATMOSPHERE_SHELL_PARAMS` import)
- Modify `src/services/engine/frame/passes/atmosphereShellLayer.ts` (post-prep: `params.sunIrradiance` + the exposure branch)
- Possibly modify `src/services/engine/frame/encodeAtmosphereSkyView.ts` — only if the post-prep bake site also reads `ATMOSPHERE_SHELL_PARAMS`; grep first (the sky-view bake packs `SkyViewParams`, not `AtmosphereUniforms`, so it likely does not).

**Interfaces — `AtmosphereParams` grows two fields (append after `groundAlbedo`):**

```ts
// @types/scene/AtmosphereParams.d.ts — two look dials folded in from the deleted table
readonly sunIrradiance: number; // solar radiance into the in-scatter integral (carried per the uniform contract; fragment-unused today — 1.0 is neutral)
readonly exposure: number;      // per-body HDR in-scatter look dial, before the shared tone-map
```

The Earth row gains `sunIrradiance: 1.0, exposure: 2.35` — the exact deleted values, so Earth is unchanged. The physics-vs-look rationale currently in `atmosphereShellParams.ts`'s docblock (the `sunIrradiance` fragment-unused caveat + the `exposure` look-dial-not-physics note + the eye-tuning intent) **moves into `atmosphereParams.ts`'s header**, kept verbatim in substance (spec §3.1). Keep the documented caveat: `sunIrradiance` is packed per the uniform contract but fragment-unused today; `1.0` is neutral; do NOT invent a fragment routing.

**Exposure resolution at the pack site (spec §5.3), post-prep `atmosphereShellLayer` draw loop:**

```ts
// per atmosphereDrawList entry { body, params } — replaces the ATMOSPHERE_SHELL_PARAMS reads
const exposure = entry.body.id === 'earth' ? state.settings.earth.atmosphereExposure : entry.params.exposure;
packAtmosphereUniforms(mvp, sun, camLocal, bottomRadius, entry.params.sunIrradiance, exposure);
```

This is the one Earth-keyed branch — an **essential** asymmetry (Earth alone has a live slider; the approved decision is no per-body sliders), one line at the one pack site, not a shading-model fork (spec §5.3). `packAtmosphereUniforms` already takes `sunIrradiance` + `exposure` args (`utils/gpu/packAtmosphereUniforms.ts:61-68`) — no packer change.

**Steps:**

- [ ] Grep every importer of `ATMOSPHERE_SHELL_PARAMS` / `atmosphereShellParams` and confirm the full edit set (today: `initialState.ts`, `EngineSettingsState.d.ts` docstring, `atmosphereShellLayer.ts`, `tests/state/settings/makeSettingsFixture.ts`, the self file; re-grep against post-prep state).
- [ ] Add the two fields to `AtmosphereParams`; add `sunIrradiance: 1.0, exposure: 2.35` to the Earth row; move the physics-vs-look + eye-tuning docblock from `atmosphereShellParams.ts` into `atmosphereParams.ts`'s header.
- [ ] Delete `src/data/bodies/atmosphereShellParams.ts`.
- [ ] `initialState.ts`: replace the `ATMOSPHERE_SHELL_PARAMS` import + `atmosphereExposure: ATMOSPHERE_SHELL_PARAMS.exposure` with `ATMOSPHERE_PARAMS.earth.exposure` (import `ATMOSPHERE_PARAMS`); update the adjacent seed comment's "from the atmosphere shell" phrasing to cite the Earth row.
- [ ] `EngineSettingsState.d.ts`: update the `earth.atmosphereExposure` docstring's `ATMOSPHERE_SHELL_PARAMS.exposure` reference to `ATMOSPHERE_PARAMS.earth.exposure`.
- [ ] `makeSettingsFixture.ts`: repoint its seed to `ATMOSPHERE_PARAMS.earth.exposure` (or the shared `buildInitialSettings` value it derives from) so no dangling `ATMOSPHERE_SHELL_PARAMS` import remains.
- [ ] `atmosphereShellLayer.ts`: drop the `ATMOSPHERE_SHELL_PARAMS` import; source `sunIrradiance` from `entry.params.sunIrradiance`; add the Earth-keyed `exposure` branch above. Update the draw's exposure comment (it currently cites `ATMOSPHERE_SHELL_PARAMS.exposure` as the seed — cite the Earth row, and note the per-body `params.exposure` path for the other bodies).
- [ ] `npm run typecheck` clean (both tsconfigs); `npm test -- settings makeSettingsFixture atmosphereShellLayer` green (the existing settings-seed + layer tests still pass with the retargeted source).
- [ ] Commit (stage each path).

---

## Task 2: Six new `ATMOSPHERE_PARAMS` rows + `planetRadiusKm`-from-`SCENE_PLANETS` lookup + structural drift-catchers

**Files:**

- Modify `src/data/bodies/atmosphereParams.ts` (import `SCENE_PLANETS`; add an in-module radius lookup; add six rows)
- Create `tests/data/bodies/atmosphereParams.test.ts`

**Interfaces — six rows exactly per spec §7's table.** `planetRadiusKm` derives from `SCENE_PLANETS` `radiusKm` via a small in-module lookup (mirrors the Earth row's `SCENE_EARTH.radiusKm` derivation), ozone zeroed for all six (`ozoneAbsorption: [0,0,0]`, `ozoneCenterKm: 0`, `ozoneWidthKm: 0`), `groundAlbedo` = each body's `SCENE_PLANETS` `albedo` triple (its authored plausible mean surface colour). Coefficients per spec §7:

| Body | atmosphereTopKm (relative) | rayleighScaleHeightKm | rayleighScatter (1/km) | mieScatter / mieAbsorption / mieScaleHeightKm / miePhaseG | sunIrradiance | exposure |
|---|---|---|---|---|---|---|
| venus   | radius + 100 | 15.9 | `[12e-3, 10e-3, 7e-3]`  | `25e-3 / 2e-3 / 5 / 0.7`  | 1.0 | 3.0 |
| mars    | radius + 60  | 11.1 | `[8e-3, 5e-3, 3e-3]`    | `10e-3 / 4e-3 / 8 / 0.6`  | 1.0 | 1.5 |
| jupiter | radius + 150 | 27   | `[4e-3, 4e-3, 5e-3]`    | `3e-3 / 1e-3 / 12 / 0.6`  | 1.0 | 1.3 |
| saturn  | radius + 300 | 59.5 | `[4e-3, 4e-3, 4e-3]`    | `3e-3 / 1e-3 / 25 / 0.6`  | 1.0 | 1.3 |
| uranus  | radius + 150 | 27.7 | `[4e-3, 10e-3, 20e-3]`  | `2e-3 / 1e-3 / 12 / 0.6`  | 1.0 | 1.8 |
| neptune | radius + 120 | 20   | `[4e-3, 9e-3, 22e-3]`   | `2e-3 / 1e-3 / 10 / 0.6`  | 1.0 | 1.8 |

`groundAlbedo` per body (from `SCENE_PLANETS`): venus `[0.85,0.80,0.60]`, mars `[0.60,0.32,0.23]`, jupiter `[0.80,0.65,0.45]`, saturn `[0.80,0.70,0.50]`, uranus `[0.60,0.80,0.82]`, neptune `[0.30,0.42,0.75]`. Sourcing them from the `SCENE_PLANETS` lookup (not re-typed literals) keeps them a single source; the §7 table lists them only to sanity-check.

Add short per-row `//` notes capturing the physical motivation (spec §7 bullets): Venus Mie-dominated CO₂/H₂SO₄ haze; Mars dust-driven butterscotch encoded as red-heavy Rayleigh + dusty Mie (no separate dust channel); Jupiter/Saturn cloud-tops-as-ground thin rim (limb darkening is their dominant visual, §6); Uranus/Neptune methane-blue Rayleigh.

**Structural drift-catchers (spec §10) — the ONLY tests; not numeric restatements:**

```ts
// tests/data/bodies/atmosphereParams.test.ts
test('every row keeps the atmosphere top above the ground', () => {
  // author fat-fingering a top below the surface would float the limb inside the
  // ground — the compiler cannot catch it.
  for (const [id, p] of Object.entries(ATMOSPHERE_PARAMS)) {
    expect(p.atmosphereTopKm).toBeGreaterThan(p.planetRadiusKm); // per id
  }
});

test('every key resolves to a real seeded body', () => {
  // a typo'd id would silently never render (no row, no error). Seeded ids =
  // SCENE_PLANETS ids + SCENE_EARTH.id.
  const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
  for (const id of Object.keys(ATMOSPHERE_PARAMS)) expect(seeded.has(id)).toBe(true);
});
```

- Do **NOT** assert `planetRadiusKm === SCENE_PLANETS[id].radiusKm` (guaranteed by construction — a tautology, spec §10). Do **NOT** assert any coefficient value.

**Steps:**

- [ ] Write `tests/data/bodies/atmosphereParams.test.ts` with the two structural tests above (both iterate the whole table, so they cover the Earth row + all six new rows and won't break when a legitimate row is added later).
- [ ] Add the `SCENE_PLANETS` import + an in-module `radiusKmById` lookup helper; add the six rows sourcing `planetRadiusKm` + `groundAlbedo` from `SCENE_PLANETS`, with the §7 coefficients + per-row physical-motivation notes.
- [ ] `npm test -- atmosphereParams` green; `npm run typecheck` clean.
- [ ] Commit (stage each path).

---

## Task 3: `limbDarkening.wesl` lib + `TexturedBodyUniforms` reshape (96 → 112 B) + packer args + packer test

**Files:**

- Create `src/services/gpu/shaders/lib/limbDarkening.wesl`
- Modify `src/services/gpu/shaders/lib/sphere.wesl` (`TexturedBodyUniforms`: `_pad0`→`limbStrength`, `_pad1`→`limbExponent`, + `camPosLocal` vec3 tail; byte table)
- Modify `src/utils/gpu/packTexturedBodyUniforms.ts` (three new args; `TEXTURED_BODY_UNIFORM_FLOATS` 24 → 28)
- Create `tests/utils/gpu/packTexturedBodyUniforms.test.ts` (no test exists today)
- Modify `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (`UNIFORM_BUFFER_SIZE` 96 → 112; header note)

**Interfaces — the Minnaert-relative-to-Lambert lib (spec §6.1):**

```
// lib/limbDarkening.wesl — Minnaert relative to the Lambert term the caller already applies.
//   I/F = mu0^k * mu^(k-1) = mu0 * (mu0 * mu)^(k-1), so the composable factor is (mu0 * mu)^(k-1).
// 'strength' == 0 returns 1.0 exactly (the identity the absent-row data-gate relies on);
// 'exponent' is the Minnaert k ('k == 1' is also the identity). Single quotes in comments; no backticks.
fn limbDarkening(mu0: f32, mu: f32, strength: f32, exponent: f32) -> f32 {
  let darken = pow(max(mu0 * mu, 0.0), exponent - 1.0);
  return mix(1.0, darken, strength);
}
```

**`TexturedBodyUniforms` — 96 → 112 bytes / 24 → 28 f32 (spec §6.3):**

| f32 idx | bytes | field | notes |
|---|---|---|---|
| 0..15 | 0..63 | `mvp: mat4x4<f32>` | column-major (unchanged) |
| 16..18 | 64..75 | `sunDirLocal: vec3<f32>` | unchanged |
| 19 | 76..79 | `_pad` | the vec3's trailing pad (unchanged) |
| 20 | 80..83 | `ringInnerRatio: f32` | unchanged |
| 21 | 84..87 | `ringOuterRatio: f32` | unchanged |
| 22 | 88..91 | `limbStrength: f32` | **was `_pad0`** |
| 23 | 92..95 | `limbExponent: f32` | **was `_pad1`** |
| 24..26 | 96..107 | `camPosLocal: vec3<f32>` | **NEW 16-byte tail; 96 is a vec3 boundary** |
| 27 | 108..111 | `_pad0: f32` | zeroed; rounds the struct to 112 / 16-byte |

Struct (fields in order): `mvp, sunDirLocal, _pad, ringInnerRatio, ringOuterRatio, limbStrength, limbExponent, camPosLocal, _pad0`. Update the struct's didactic byte-layout table + the "the two existing trailing pad floats become fields" rationale (the same pad-slot-becomes-real-field trick the other siblings document).

**`packTexturedBodyUniforms` gains three args (spec §6.3):**

```ts
export const TEXTURED_BODY_UNIFORM_FLOATS = 28; // was 24
export function packTexturedBodyUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  ringInnerRatio: number,
  ringOuterRatio: number,
  limbStrength: number,   // out[22]
  limbExponent: number,   // out[23]
  camPosLocal: Readonly<Vec3>, // out[24..26]
): Float32Array;
```

Writes: `out[22] = limbStrength`, `out[23] = limbExponent`, `out[24..26] = camPosLocal`; `out[27]` stays 0. Keeps reusing `packLitBodyUniforms` for the 80-byte prefix + the existing ring ratios at `out[20..21]`. Update the docblock byte-layout table + the FLOATS-count comment.

**Packer test (`conventions/testing.md` keep-rule — WGSL/TS byte-layout parity):**

```ts
// tests/utils/gpu/packTexturedBodyUniforms.test.ts — the float indices ARE the contract; layout
// drift silently mis-renders and on iOS drops the whole frame (CLAUDE.md trap). Hand-set inputs,
// assert each index — NOT a mirror of the packer's own expression.
test('packs the lit prefix, ring ratios, limb fields, and camPosLocal at the fixed indices', () => {
  // mvp = 0..15, sunDirLocal, ring ratios, limbStrength, limbExponent, camPosLocal chosen distinct
  expect(out).toHaveLength(TEXTURED_BODY_UNIFORM_FLOATS); // 28
  // out[0..15] === mvp; out[16..18] === sunDirLocal; out[19] === 0 (lit pad)
  // out[20] === ringInnerRatio; out[21] === ringOuterRatio
  expect(out[22]).toBe(limbStrength);
  expect(out[23]).toBe(limbExponent);
  expect([out[24], out[25], out[26]]).toEqual([camPosLocal[0], camPosLocal[1], camPosLocal[2]]);
  expect(out[27]).toBe(0);
});
```

**Steps:**

- [ ] Create `lib/limbDarkening.wesl` with the didactic header + the function above (single-quote comments, no backticks).
- [ ] Reshape `TexturedBodyUniforms` in `lib/sphere.wesl` (rename the two pads to real fields, add the `camPosLocal` vec3 tail + `_pad0`), and rewrite its byte-layout table to the 112-byte layout above.
- [ ] Extend `packTexturedBodyUniforms` (three new args, `out[22]`/`out[23]`/`out[24..26]`, FLOATS → 28); update its docblock byte table.
- [ ] Write `tests/utils/gpu/packTexturedBodyUniforms.test.ts` with the parity assertions above.
- [ ] Bump `UNIFORM_BUFFER_SIZE` 96 → 112 in `texturedBodyRenderer.ts` and update its "96 bytes (24 f32)" header comment to 112 / 28 (the derive-from-packer-count knot stays a restated literal — untriggered, per spec §6.3).
- [ ] `npm test -- packTexturedBodyUniforms` green; `npm run typecheck` clean; `npm run build` clean (the `?static` WESL imports link — watch iOS-strict traps: valid struct layout, no `texture_1d`).
- [ ] Commit (stage each path). No visual check yet — the fragment does not consume the new fields until Task 4, and the layer still packs `0`/`0`/`[0,0,0]` for them until then (identity), so Task 3 is behavior-neutral on its own.

---

## Task 4: `LIMB_DARKENING_PARAMS` table + fragment composition + `texturedBodiesLayer` wiring

**Files:**

- Create `src/data/bodies/limbDarkeningParams.ts`
- Create `tests/data/bodies/limbDarkeningParams.test.ts`
- Modify `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl` (import + compose the limb term)
- Modify `src/services/engine/frame/passes/texturedBodiesLayer.ts` (`limbParams` lookup + `camPosLocal` derivation + three new packer args)
- Modify `tests/services/engine/frame/passes/texturedBodiesLayer.test.ts` (length 24 → 28; limb fields + camPosLocal)

**Interfaces — the data table (spec §6.3):**

```ts
// src/data/bodies/limbDarkeningParams.ts — a body absent from the table renders exactly as today
// (strength 0 => identity), the same data-gate SCENE_RINGS / ATMOSPHERE_PARAMS use.
export const LIMB_DARKENING_PARAMS: Readonly<Record<string, { strength: number; exponent: number }>> = {
  venus:   { strength: 0.25, exponent: 1.15 },
  jupiter: { strength: 0.6,  exponent: 1.3 },
  saturn:  { strength: 0.55, exponent: 1.3 },
  uranus:  { strength: 0.45, exponent: 1.25 },
  neptune: { strength: 0.45, exponent: 1.25 },
  // mars + airless bodies (mercury, moon, galileans) absent => strength 0 => identity
};
```

Values are eye-tunable starting points (spec §6.3) — no numeric test. `strength ∈ [0,1]` lerps identity→law; `exponent` is the Minnaert `k` (`1.0` = Lambert identity, `>1` flattens the disc centre + steepens the limb).

**Fragment composition (spec §6.2) — `texturedBody/fragment.wesl`, multiplicative on the lit colour after the ring-shadow attenuation:**

```
// single-quote comments. 'noL' is the same sun cosine the Lambert term uses; the view vector needs
// NO new varying — on the unit sphere the surface position IS the unit normal, so V = camPosLocal - n.
// 'limbStrength == 0' (every absent body) returns 1.0 — shader identity.
let noL = max(dot(n, u.sunDirLocal), 0.0);
let v = normalize(u.camPosLocal - n);
let noV = max(dot(n, v), 0.0);
let limb = limbDarkening(noL, noV, u.limbStrength, u.limbExponent);
let colour = albedo * shade * limb;
```

Import `package::lib::limbDarkening::limbDarkening`. `n` is the already-`normalize`d local normal the fragment computes; `shade` is the existing `litShade(...)` result. Compose `limb` onto the existing `let colour = albedo * shade;` line.

**`texturedBodiesLayer` wiring (spec §6.3):** add a `limbParams(body)` lookup helper (sibling of the existing `ringRatios`) returning the `LIMB_DARKENING_PARAMS` row or `{ strength: 0, exponent: 1 }` when absent. In the draw loop derive each body's `camPosLocal` via the existing `camPosLocal` util (`utils/camera/camPosLocal.ts`) with the **same** inputs its `composeBodyMvp` call already consumes — `view.camPos`, `body.positionMpc`, the body's SURFACE radius `body.radiusKm * SCALE_UNITS.KM_TO_MPC` (the fragment's unit sphere, NOT an atmosphere-top scale), `body.orientation`. Pass `{ strength, exponent }` + `camPosLocal` into `packTexturedBodyUniforms`'s three new args.

```ts
// texturedBodiesLayer draw loop — the added derivations
const { strength, exponent } = limbParams(body);
const cam = camPosLocal(view.camPos, body.positionMpc, body.radiusKm * SCALE_UNITS.KM_TO_MPC, body.orientation);
const uniforms = packTexturedBodyUniforms(mvp, sun, inner, outer, strength, exponent, cam);
```

**Key-resolution drift-catcher (spec §10) — the ONLY test for the table:**

```ts
// tests/data/bodies/limbDarkeningParams.test.ts
test('every key resolves to a real seeded body', () => {
  const seeded = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((b) => b.id)]);
  for (const id of Object.keys(LIMB_DARKENING_PARAMS)) expect(seeded.has(id)).toBe(true);
});
```

No `strength`/`exponent` value test.

**Layer-test updates:** the existing `texturedBodiesLayer.test.ts` asserts `toHaveLength(24)` and reads floats 16..21. Update the expected length to `28`; keep the f64-seam, sun-at-16..18, and ring-ratios-at-20..21 assertions. Add: a body **with** a `LIMB_DARKENING_PARAMS` row packs its `strength`/`exponent` at floats 22/23 and a body **without** packs `0`/`1`; and `camPosLocal` at floats 24..26 matches an independently-computed `camPosLocal(view.camPos, body.positionMpc, body.radiusKm * KM_TO_MPC, body.orientation)` (recomputed in the test, NOT through the layer, so a drift in the derivation lands here — the same posture as the existing sun-at-16..18 assertion). Use a body in the fixture that has a limb row (e.g. `jupiter`) and one that does not (e.g. `mars`).

**Steps:**

- [ ] Create `limbDarkeningParams.ts` (didactic header: data-gate, eye-tuned, absent = identity) + `tests/data/bodies/limbDarkeningParams.test.ts` (key-resolution test).
- [ ] Compose the limb term into `texturedBody/fragment.wesl` (import + `noL`/`noV`/`limb` + fold into `colour`); update the fragment header to note the view vector comes from `u.camPosLocal` on the unit sphere and the `limbStrength == 0` identity.
- [ ] Add `limbParams` + the `camPosLocal` derivation to `texturedBodiesLayer.ts`; pass the three new args; update the layer header's ring-ratios paragraph to also mention the limb datum + the surface-radius `camPosLocal`.
- [ ] Update `texturedBodiesLayer.test.ts`: length 24 → 28, the limb-field + `camPosLocal` assertions above.
- [ ] `npm test -- texturedBodiesLayer limbDarkeningParams` green; `npm run typecheck` clean; `npm run build` clean (WESL links; iOS-strict — a bad textured-body pipeline silently blanks the canvas; use `createShaderModuleWithDevLog` output if it fails).
- [ ] Commit (stage each path). The per-body visual pass happens in Task 6 (HMR).

---

## Task 5: Backlog hygiene (same change)

**Files:**

- Modify `docs/backlog/2026-07-19-photoreal-earth-followups.md` (remove follow-ups #1 and #4)
- Modify `docs/BACKLOG.md` (Rendering section: update the photoreal-Earth-follow-ups parenthetical; add a terse Titan index line)
- Create `docs/backlog/2026-07-19-titan-atmosphere.md`

**Details (spec §12):**

- **Remove follow-up #1** ("Shared per-frame atmosphere-pose derivation") — picked up by the prep PR's `atmosphereDrawList` (spec §5).
- **Remove follow-up #4** ("Venus/Titan atmosphere = more than a params row") — picked up by the prep PR's per-body wiring (spec §2). Follow the file's own numbering style: it uses `## N. Title` headings; **leave the remaining items (#2, #3, #5, #6) with their existing numbers** (holes are fine — do not renumber; the numbers are referenced by the entanglement-radar tag suffixes like `E7-A`).
- **`docs/BACKLOG.md`** Rendering index line: the parenthetical currently reads "(atmosphere-pose derivation, equirect-uv mirror, setMap kind table, multi-atmosphere shape, shared proxy-sphere idiom, multiple-scattering clouds)" — **drop "atmosphere-pose derivation" and "multi-atmosphere shape"** so it lists only the still-deferred items (equirect-uv mirror, setMap kind table, shared proxy-sphere idiom, multiple-scattering clouds).
- **Create `docs/backlog/2026-07-19-titan-atmosphere.md`** (spec §12) recording BOTH paths for Titan (seeded in `SCENE_PLANETS` today, untextured — a flat-lit albedo sphere): the **minimal** path (one `ATMOSPHERE_PARAMS` row — thick, orange, methane-haze, Mie-dominated — over today's flat sphere, which the generalized wiring renders with zero further code) and the **full** Venus treatment (a cloud-as-surface texture through the fetch/build pipeline + a `LIMB_DARKENING_PARAMS` row, which needs the textured-body path this feature excludes). The split keeps the "just add a row" shortcut honest about what each level needs.
- **`docs/BACKLOG.md`** add one terse Rendering index line (index terse — detail in the md, per feedback_backlog_index_terse), e.g.: `- [ ] **Titan atmosphere** \`needs-design\` — minimal params-row-over-flat-sphere vs full Venus-style cloud-as-surface + limb treatment (needs a texture through the fetch/build pipeline). → [details](backlog/2026-07-19-titan-atmosphere.md)`.

**Steps:**

- [ ] Remove #1 and #4 from the follow-ups file (keep the other headings' numbers).
- [ ] Update the `BACKLOG.md` Rendering parenthetical; add the Titan index line.
- [ ] Create the Titan detail file (minimal vs full paths).
- [ ] Commit (stage each path).

---

## Task 6: entanglement-radar review + full verification + per-body visual pass

> **Execution order:** **Task 7 (`twilightSoftness`) executes BEFORE this task.** Task 6
> stays the final verification / visual-pass task — the twilight knob must be in the tree
> before this pass so the Earth night-limb check below has something to verify. (Task 7 is
> numbered after Task 6 only because it was added on 2026-07-19, mid-execution.)

**Files:** none (review + verification + visual).

- [ ] Run the `entanglement-radar` skill over the whole feature-branch diff (house convention). Pay attention to:
  - the **one Earth-keyed exposure branch** (spec §5.3) being an ESSENTIAL asymmetry (Earth has a slider, the rest do not), one line at one pack site — not a shading-model fork, not a co-keyed mirror table;
  - the fold of `sunIrradiance`/`exposure` into `ATMOSPHERE_PARAMS` collapsing the former co-keyed-mirror risk (spec §3.1) — one row per body, one home;
  - the limb term data-gated by `LIMB_DARKENING_PARAMS` absence (identity at `strength 0`) — the same gate `SCENE_RINGS` / `ATMOSPHERE_PARAMS` use, no per-body shader branch;
  - `planetRadiusKm` + `groundAlbedo` sourced from `SCENE_PLANETS` (single source), not re-typed literals;
  - the `camPosLocal` derivation reusing the existing util with the surface radius (the fragment's unit sphere), matching the layer's `composeBodyMvp` inputs — not a second bespoke computation.
  - Name any knot precisely; fix or file it before completion.
- [ ] `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [ ] **Per-body visual pass (spec §11)** — ask the user to look on the running dev server (never start/kill it). HMR-driven tuning is expected: adjusting coefficients in `atmosphereParams.ts` / `limbDarkeningParams.ts` live is the intended loop. Confirm:
  - **Venus** — thick warm/whitish-yellow limb band; mild disc limb-darkening; surface is the existing cloud-as-surface map (no cloud shell).
  - **Mars** — thin reddish/butterscotch limb; NO disc darkening.
  - **Jupiter** — pronounced limb darkening across the banded disc (the dominant effect); a faint thin scattering rim.
  - **Saturn** — pronounced limb darkening; faint pale-gold rim; **rings unaffected**.
  - **Uranus / Neptune** — limb darkening + a cyan-blue methane limb.
  - **Airless control** — Mercury, Moon, Galileans show NO limb band and NO disc darkening (both tables absent → identity).
  - **Moon-in-front occlusion** still correct (the depth test, unchanged).
  - **Earth pixel-identical** — limb, sunset arc, over-disc haze read exactly as before the six rows (spec §2.3 / §5.3). (The night-limb twilight ring below is the one deliberate Earth change, from Task 7.)
  - **Earth night-side limb shows a soft twilight ring fading to true black** — no hard edge, no constant grazing glow in deep shadow (Task 7 / spec §7.1). Tune `twilightSoftness` on the Earth row via HMR if the band reads too wide or too narrow.
  - **iOS spot-check** — the extra shells + the reshaped `TexturedBodyUniforms` present correctly on iOS WebKit (the risk is the multiplied bundle count + the new uniform tail; a bad struct silently blanks the canvas).
- [ ] Tune coefficients with the user via HMR as needed (no commit needed for a pure look tweak unless a value changes on disk — those coefficient edits DO get committed as the final tuned values).
- [ ] Confirm the DoD before marking the plan done (`/feature-done`, which sweeps the backlog + relocates spec/plan on merge — run BEFORE merge per feedback_feature_done_before_merge).

---

## Task 7: `twilightSoftness` — per-body night-limb twilight knob

> **Execution order:** **Task 7 EXECUTES BEFORE Task 6.** Task 6 stays the final
> verification / visual-pass task; this knob must be in the tree before that pass so the
> Earth night-limb check (Task 6) has something to verify. It is numbered 7 only because it
> was added on **2026-07-19, mid-execution** (user-approved scope addition), after Tasks 1–6
> were written. It lands AFTER Task 2, so every row (earth + the six new rows) gets a value
> in one edit.

A per-body `twilightSoftness` field on `AtmosphereParams` (unit: a width in mu = cos-zenith
space; `0` disables) that fades the single-scatter sun source across the terminator. It fixes
an existing unphysical clamp: today a march sample in deep planet shadow still receives the
transmittance LUT's horizon-grazing edge (deep-red, small, nonzero), so the night limb never
goes properly black and the terminator falloff is uncontrollable (spec §7.1).

**Files:**

- Modify `src/@types/scene/AtmosphereParams.d.ts` (one new field on the row)
- Modify `src/data/bodies/atmosphereParams.ts` (a `twilightSoftness` value on all seven rows)
- Modify `src/utils/gpu/packScatteringParams.ts` (`out[18]` = the field; header slot-table comment)
- Modify `src/services/gpu/shaders/atmosphere/scattering.wesl` (`_pad0` → `twilightSoftness` in `ScatteringParams` + its byte-layout comment)
- Modify `src/services/gpu/shaders/atmosphere/skyViewLut.wesl` (the `muHorizon` / `sunVis` weighting in `raymarchInScatter`)
- Test: extend the existing packer parity test `tests/utils/gpu/packScatteringParams.test.ts` with a slot-18 assertion (no new test file — this is the test that already covers the packer's byte layout)

**Interfaces:**

Consumes the post-Task-1/Task-2 `AtmosphereParams` type + its seven rows (earth + the six new
rows from Task 2). Produces `twilightSoftness: number` on the type, slot 18 in the packer
(replacing `_pad0`), and the two WESL edits (the struct field rename + the `raymarchInScatter`
weighting).

**The type field (append to the row):**

```ts
// @types/scene/AtmosphereParams.d.ts
readonly twilightSoftness: number; // night-limb twilight width in mu (cos-zenith) space; 0 = hard shadow (no fade)
```

**The packer line + slot-table row (`packScatteringParams.ts`):**

```ts
out[18] = params.twilightSoftness; // was the zeroed _pad0
// its header slot-table comment gains the row:  f32 18 twilightSoftness, 19 _pad1
```

**The `scattering.wesl` struct field:** `_pad0: f32,` → `twilightSoftness: f32,` in
`struct ScatteringParams`, and its byte-layout comment's `offset 72..75 : _pad0` row becomes
`twilightSoftness`.

**The `skyViewLut.wesl` weighting** (single quotes in comments; never backticks — house rule),
replacing the current `let s = ...` line in `raymarchInScatter`:

```
// twilightSoftness: fade the single-scatter sun source across the terminator so deep
// planet shadow goes black instead of clamping to the transmittance LUT's grazing edge.
// 'muHorizon' is the sun-zenith cosine at which the sun grazes this sample's local
// horizon. Multi-scatter is left unfactored (isotropic ambient floor; its own LUT
// already decays with sun depression).
let muHorizon = -sqrt(max(0.0, r * r - bottom * bottom)) / r;
let sunVis = smoothstep(muHorizon - params.twilightSoftness, muHorizon, sunCosZenith);
let s = sunVis * sunTransmittance * scatterPhased + psiMultiScatter * scatterTotal;
```

(`bottom = params.planetRadiusKm` and `r = length(pos)` are already in scope.)

**The seven row values** (HMR-tunable starting points; eye-tuned, **no numeric test** — the
same convention the other coefficients follow, spec §7 / §10): earth `0.05`, venus `0.05`,
mars `0.07`, jupiter `0.03`, saturn `0.03`, uranus `0.03`, neptune `0.03`.

**Resolved decisions (spec §7.1):**

- **Single-scatter only** — only the phase-weighted single-scatter source is factored by
  `sunVis`; the multi-scatter term stays as-is (factoring it too would double-darken the
  night limb; that is the deferred refinement if the night side reads too bright).
- **Startup LUTs untouched** — only the per-frame sky-view bake reads the knob, so HMR tuning
  is instant (no transmittance / multi-scatter rebake).
- **Replaces `_pad0`** — no struct or byte growth (80 B / 20 f32 unchanged); slot 19 `_pad1`
  remains.
- **Lands AFTER Task 2** — the six rows must already exist so every row (earth + six) gets a
  `twilightSoftness` value in one edit, no orphaned row.

**Steps (TDD):**

- [ ] Extend `tests/utils/gpu/packScatteringParams.test.ts`: add `twilightSoftness` to the `PARAMS` fixture (a distinct dyadic sentinel, e.g. `19 / 16`) and change the slot-18 assertion from `expect(rec[18]).toBe(0)` to `expect(rec[18]).toBe(PARAMS.twilightSoftness)` (slot 19 stays `0`). Red — the packer still writes `0` at slot 18.
- [ ] Add `twilightSoftness` to `AtmosphereParams`; set the seven row values in `atmosphereParams.ts`; write `out[18] = params.twilightSoftness` in `packScatteringParams.ts` and update its slot-table comment (`18 twilightSoftness, 19 _pad1`). Green.
- [ ] Rename `_pad0` → `twilightSoftness` in `scattering.wesl`'s `ScatteringParams` struct + its byte-layout comment; add the `muHorizon` / `sunVis` weighting to `raymarchInScatter` in `skyViewLut.wesl` (single quotes, no backticks).
- [ ] `npx tsc --noEmit` clean; focused `npm test -- packScatteringParams` green; `npm run build` clean (WESL relink — iOS-strict: valid struct layout; `smoothstep` / `sqrt` are core WGSL, no `texture_1d` risk here).
- [ ] Commit (stage each path) with a `feat(atmosphere): per-body twilightSoftness night-limb knob` message.

The per-body visual pass (including the Earth night-limb twilight-ring check) happens in
Task 6, which runs after this task.

---

## Interfaces produced by this plan

- **`AtmosphereParams`** (`@types/scene/AtmosphereParams.d.ts`) grows `sunIrradiance` + `exposure`; `ATMOSPHERE_SHELL_PARAMS` is deleted (Earth row absorbs its `1.0` / `2.35`).
- **`ATMOSPHERE_PARAMS`** (`data/bodies/atmosphereParams.ts`) grows six rows (venus, mars, jupiter, saturn, uranus, neptune); `planetRadiusKm` + `groundAlbedo` derived from `SCENE_PLANETS`.
- **`AtmosphereParams.twilightSoftness`** (Task 7, added 2026-07-19 mid-execution) — night-limb twilight-fade width in mu space; packed into `ScatteringParams` slot 18 (replaces `_pad0`, no struct growth), consumed by `raymarchInScatter` in `skyViewLut.wesl` as a `smoothstep` sun-visibility factor on the single-scatter source.
- **`LIMB_DARKENING_PARAMS`** (`data/bodies/limbDarkeningParams.ts`) — NEW `Record<string, { strength; exponent }>`; five rows (venus, jupiter, saturn, uranus, neptune).
- **`lib/limbDarkening.wesl`** — NEW `limbDarkening(mu0, mu, strength, exponent) -> f32` (Minnaert relative to Lambert).
- **`TexturedBodyUniforms`** (`lib/sphere.wesl`) — 96 → 112 bytes / 24 → 28 f32: `_pad0`→`limbStrength` [22], `_pad1`→`limbExponent` [23], + `camPosLocal` [24..26] + `_pad0` [27]. `packTexturedBodyUniforms` gains `limbStrength`, `limbExponent`, `camPosLocal` args; `TEXTURED_BODY_UNIFORM_FLOATS = 28`; `texturedBodyRenderer` `UNIFORM_BUFFER_SIZE = 112`.
- **Exposure resolution** (`atmosphereShellLayer` draw): `entry.body.id === 'earth' ? settings.earth.atmosphereExposure : entry.params.exposure`; `sunIrradiance` from `entry.params.sunIrradiance`.
