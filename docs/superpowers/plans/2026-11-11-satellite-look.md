# Satellite light and colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satellite dots respond to sunlight and Earth's shadow, carry a colour per group, scale with panel area, and flash with modelled panel glints, with group colours tunable in the DebugPanel.

**Architecture:** A group profile is assigned to each object once at catalog load. The GPU holds a small uniform table of profiles and each instance carries an index into it. Lighting runs per dot in the vertex stage, in world axes.

**Tech Stack:** TypeScript, React, Redux Toolkit, WebGPU, WESL.

**Spec:** `docs/superpowers/specs/2026-11-11-satellite-look-design.md`

## Global Constraints

- `satellites.satg` does not change. `SatelliteCatalog` gains no field.
- The Layer contract does not grow.
- `.wesl` edits follow the `wesl-shaders` skill. Never pass a struct read from a buffer by value into a new WGSL helper: pass scalars and vectors.
- One symbol per file in `@types/` and `utils/`. `type`, never `interface`.
- Commit messages carry no `Co-Authored-By` line.

## Review Focus

1. **A zero vector in the glint maths** (`v ∥ r`, or the Sun along the orbit normal): no glint and no NaN, because a NaN in an additive HDR target poisons the frame. WGSL has no test harness here, so Task 4's reviewer checks it by reading.
2. **Blank or placeholder names and designators** (`UNKNOWN`, empty COSPAR, `TBA`): assigned without throwing. Task 2 tests.
3. **Catalog release and reload:** profile codes clear and return with the catalog, so a stale array never meets a new sweep. Task 3 tests.
4. **A colour edit with the clock paused:** shows on the next frame. Task 5 tests the table write; the wake is a smoke item.
5. **An eclipsed selected satellite:** stays pickable and followable. `pick.wesl` takes no lighting input; smoke item.

---

### Task 1: Prep, one shared debug colour row

**Files:**
- Create: `src/components/DebugPanel/DebugColorRow.tsx`
- Modify: `src/layers/zoneOfAvoidance/shell/ui/ZoneOfAvoidanceTuningSection.tsx:38-68`, `src/layers/blackHoles/lensing/ui/BlackHoleLensingTuningSection.tsx:62-77`, `src/layers/probeSpheres/spheres/ui/ProbeSpheresTuningSectionContainer.tsx:78-91`

**Interfaces:**
- Produces: `DebugColorRow({ label, value, title, onChange }: { label: string; value: Vec3; title?: string; onChange: (color: Vec3) => void })`, value in linear RGB, picker in sRGB through `linearRgbToHex` / `hexToLinearRgb`.

No new test: this is an extraction with no new behaviour.

- [ ] Follow the `create-component` skill's rules, adapted to the flat `DebugPanel/` folder. Reuse `DebugSlider.module.css` classes as the current copies do. Keep `aria-label` set to the label.
- [ ] Replace all four copies. `grep -rn 'type="color"' src` must return only `DebugColorRow.tsx`.
- [ ] Run `npm run typecheck:fast`.
- [ ] Commit: `Debug panels share one colour row`.

### Task 2: Profile table and group assignment

**Files:**
- Create: `src/layers/satellites/points/@types/SatelliteProfile.d.ts`, `src/layers/satellites/points/@types/SatelliteProfileId.d.ts`, `src/layers/satellites/points/@types/SatelliteProfileInput.d.ts`, `src/layers/satellites/points/data/satelliteProfiles.ts`, `src/layers/satellites/points/data/satelliteProfileCapacity.ts`, `src/layers/satellites/points/subsystems/satelliteProfileCode.ts`, `src/layers/satellites/points/subsystems/satelliteProfileCodes.ts`
- Test: `tests/layers/satellites/points/subsystems/satelliteProfileCode.test.ts`

**Interfaces:**

```ts
type SatelliteProfile = {
  readonly id: SatelliteProfileId;
  readonly label: string;
  readonly color: Vec3; // linear RGB
  readonly areaM2: number;
  readonly glintGain: number; // 0 = no panels to flash
};
type SatelliteProfileInput = {
  readonly name: string;
  readonly cosparId: string;
  readonly classCode: number;
  readonly meanMotion: number; // rev/day
  readonly eccentricity: number;
};
SATELLITE_PROFILE_CAPACITY = 16;
satelliteProfileCode(input: SatelliteProfileInput): number; // index into SATELLITE_PROFILES
satelliteProfileCodes(catalog: SatelliteCatalog): Uint8Array;
```

`SATELLITE_PROFILES`, in this order (index is the code):

| id | label | color | areaM2 | glintGain |
| --- | --- | --- | --- | --- |
| `starlink-v1` | Starlink V1 | 0.55, 0.72, 1.0 | 22.68 | 1 |
| `starlink-v2-mini` | Starlink V2 Mini | 0.42, 0.62, 1.0 | 104.96 | 1 |
| `oneweb` | OneWeb | 0.3, 0.9, 0.75 | 3.88 | 1 |
| `kuiper` | Kuiper | 1.0, 0.62, 0.22 | 3.88 | 1 |
| `qianfan` | Qianfan | 0.95, 0.4, 0.55 | 3.88 | 1 |
| `guowang` | Guowang | 0.95, 0.3, 0.25 | 3.88 | 1 |
| `leo` | Low orbit | 0.75, 0.8, 0.85 | 3.88 | 1 |
| `meo` | Medium orbit | 0.5, 0.9, 0.4 | 10.82 | 1 |
| `geo` | Geostationary | 1.0, 0.82, 0.35 | 71 | 1 |
| `heo` | High elliptical | 0.75, 0.5, 1.0 | 3.88 | 1 |
| `debris` | Debris | 0.6, 0.38, 0.3 | 1 | 0 |
| `other` | Unidentified | 0.5, 0.5, 0.5 | 1 | 0 |

The table's comments cite each area's basis, one short line per source: 22.68 from arXiv 2305.11123; 104.96 from arXiv 2306.06657; 71 derived from ESA's Eurostar 3000 L array (8 × 3.915 × 2.28 m); 10.82 from GSC Galileo metadata; 3.88 is SARAL's array used as our default, and for OneWeb, Kuiper, Qianfan and Guowang no public figure exists; 1 is our choice.

Rules, first match wins: class is `debris` (`SATELLITE_CLASSES`) or the name has a `DEB` token → `debris`. Class is `other` or the name has an `R/B` token → `other`. Name starts with `STARLINK` → `starlink-v1` when the designator's year and launch number are before 2023-026, else `starlink-v2-mini` (including an unparseable designator). `ONEWEB`, `KUIPER`, `QIANFAN`, or `HULIANWANG`/`GUOWANG` → that row. Then, from `a = cbrt(398600.4418 / n²)` with `n` in rad/s, apogee `a(1+e) − 6378` and perigee `a(1−e) − 6378` in km: `geo` if |rev/day − 1.0027| < 0.05 and e < 0.05; `leo` if apogee < 2000; `meo` if perigee > 2000, apogee < 35000 and e < 0.3; otherwise `heo`.

- [ ] Write these tests, each asserting the row's `id` through `SATELLITE_PROFILES[code]`:
  - `debris class wins over a constellation name` (`STARLINK-1234`, class debris → `debris`)
  - `a DEB token in an active object is debris` (`STARLINK-1234 DEB`, class active → `debris`)
  - `a rocket body is other, whatever its class` (`SL-4 R/B`, class active → `other`)
  - `an unnamed object with no designator is other` (`UNKNOWN`, `''`, class other → `other`)
  - `the V2 Mini boundary is launch 2023-026` (`2023-025A` → `starlink-v1`; `2023-026A` → `starlink-v2-mini`; `2019-074A` → `starlink-v1`)
  - `a Starlink with a blank designator is V2 Mini`
  - `Hulianwang and Guowang names share a row` (`HULIANWANG DIGUI-01`, `GUOWANG-01` → `guowang`)
  - `regimes classify real orbits` (15.5 rev/day, e 0.001 → `leo`; 2.005, 0.01 → `meo`; 1.0027, 0.0002 → `geo`; 2.0, 0.74 → `heo`), all with the name `TBA`, class active
  - `profile ids are unique and fit the GPU table` (structural)
- [ ] Run them and see them fail, then implement, then see them pass: `npx vitest run tests/layers/satellites/points/subsystems/satelliteProfileCode.test.ts`.
- [ ] Commit: `Satellites get a look profile per constellation or orbit`.

### Task 3: Profile table and index on the GPU

`review: yes`

**Files:**
- Create: `src/layers/satellites/points/render/packSatelliteProfiles.ts`, test `tests/layers/satellites/points/render/packSatelliteProfiles.test.ts`
- Modify: `src/layers/satellites/points/render/satellitePointRenderer.ts`, `src/layers/satellites/points/@types/SatellitePointRenderer.d.ts`, `src/layers/satellites/sweep/subsystems/createSatellitePropagator.ts` and its `@types/SatellitePropagator`, `src/layers/satellites/frame.ts:37`, `src/services/gpu/shaders/satellites/points/{io,vertex,fragment}.wesl`, `tests/services/gpu/shaders/satellitePoints.parity.test.ts`, `tests/layers/satellites/sweep/subsystems/createSatellitePropagator.test.ts`

**Interfaces:**
- Consumes: `SATELLITE_PROFILES`, `SATELLITE_PROFILE_CAPACITY`, `satelliteProfileCodes`.
- Produces: `propagator.profileCodes(): Uint8Array | null`; `renderer.upload(sweep, classCode, profileCode)`; `renderer.writeProfiles(table: Float32Array)`; `packSatelliteProfiles(colors: Readonly<Record<SatelliteProfileId, Vec3>>): Float32Array`; `SATELLITE_PROFILE_BYTES = 32`.

Instance, stride 36:

| location | offset | field | format |
| --- | --- | --- | --- |
| 0 | 0 | posKm | float32x3 |
| 1 | 12 | velKmS | float32x3 |
| 2 | 24 | catalogIndex | uint32 |
| 3 | 28 | classCode | uint32 |
| 4 | 32 | profileCode | uint32 |

Profile table, `@group(0) @binding(3) var<uniform> profiles: array<SatelliteProfile, 16>`, vertex visibility, 512 bytes:

| offset in row | field | type |
| --- | --- | --- |
| 0 | color | vec3<f32> |
| 12 | areaM2 | f32 |
| 16 | glintGain | f32 |

Row stride 32. Unused rows are zero.

`VSOut.opacity: f32` becomes `radiance: vec3<f32>` (flat), the vertex stage's colour already multiplied by opacity. The fragment returns `in.radiance * glow * clear`. `SatelliteUniforms.color` stays until Task 4, unread by the shaders. `SATELLITE_POINT_STYLE.color` keeps serving the ring until Task 5.

The renderer owns one profile buffer, created and seeded at construction from the table defaults, shared by the draw and pick bindings. The propagator derives codes in `start` right after parsing and clears them in `stop`, on the same lines as `catalog`.

- [ ] Add tests: `packSatelliteProfiles writes each row at its stride` with hand-written values for row 1's colour at floats 8–10, area at float 11 and gain at float 12; `profile codes clear with the catalog` in the propagator test (null before start and after stop).
- [ ] Extend the parity test: location 4 in the instance, and `SatelliteProfile` fields against the table above, with the array length equal to `SATELLITE_PROFILE_CAPACITY`.
- [ ] Implement. The planner passes `propagator.profileCodes()!` beside `catalog.classCode`.
- [ ] Run `npm run typecheck:fast` and `npx vitest run tests/layers/satellites tests/services/gpu/shaders/satellitePoints.parity.test.ts`.
- [ ] Commit: `Satellite dots draw in their group's colour`.

### Task 4: Sunlight, shadow, panel area and glints

`review: yes`

**Files:**
- Create: `src/services/gpu/shaders/satellites/points/illumination.wesl`
- Modify: `src/services/gpu/shaders/satellites/points/{io,project,vertex}.wesl`, `src/layers/satellites/points/render/satellitePointRenderer.ts`, `src/layers/satellites/points/@types/SatellitePointFrame.d.ts`, `src/layers/satellites/points/passes/satellitesPass.ts`

**Interfaces:**
- `SatelliteUniforms.color` is renamed `sunDir` at the same offset 144; bytes stay 176. `SATELLITE_UNIFORM_OFFSETS.color` becomes `sunDir`. `SatellitePointFrame` gains `sunDir: Vec3`, world-space unit vector from Earth to the Sun, computed in the pass from `RENDER_ORIGIN_MPC` minus `earth.positionMpc` in f64.
- `Projected` gains `earthRelKm: vec3<f32>` (`rot * tKm`, not `relKm − earthKm`, which would lose precision) and `orbitNormal: vec3<f32>` (`rot * cross(tKm, sat.velKmS)`, unnormalised).

WGSL, all parameters scalars or vectors, constants in the file:

```wgsl
// 1 in full sun, 0 in umbra. Cylinder along -sunDir, radius EARTH_RADIUS_KM, widened by
// SUN_HALF_ANGLE_TAN (0.00466) times the distance behind Earth, smoothstepped across it.
fn earthShadowLit(earthRelKm: vec3<f32>, sunDir: vec3<f32>) -> f32
// Lambert sphere: ((PI - a) cos a + sin a) / PI, a = acos(clamp(cosPhase, -1, 1)).
fn lambertPhase(cosPhase: f32) -> f32
// 0 for a zero orbit normal or a Sun along it. n = normalize(sunDir - dot(sunDir, h) h), h the
// unit orbit normal; returns pow(max(dot(n, halfway), 0), GLINT_LOBE_EXP).
fn panelGlint(orbitNormal: vec3<f32>, sunDir: vec3<f32>, viewDir: vec3<f32>) -> f32
```

The vertex stage, with `viewDir = normalize(-relKm)` guarded against a zero `relKm`, `cosPhase = dot(sunDir, viewDir)`, and `lit = earthShadowLit(...)`:

```
weight   = pow(area / AREA_REF_M2, AREA_EXP) * pow(RANGE_REF_KM / rangeKm, RANGE_EXP)
diffuse  = color * weight * pow(lambertPhase(cosPhase), PHASE_EXP) * max(lit, ECLIPSED_RESIDUAL)
glint    = GLINT_WHITE * glintGain * pow(area / AREA_REF_M2, AREA_EXP) * panelGlint(...) * lit * GLINT_PEAK
radiance = (diffuse + glint) * u.opacity * classOpacity
size     = u.sizePx * (1 + min(panelGlint(...) * glintGain * lit, 1) * (GLINT_SIZE_MAX - 1))
```

Starting constants, to be tuned by eye in the final step: `AREA_REF_M2 22.68`, `AREA_EXP 0.35`, `RANGE_REF_KM 20000`, `RANGE_EXP 0.4`, `PHASE_EXP 0.5`, `ECLIPSED_RESIDUAL 0.04`, `GLINT_LOBE_EXP 3000` (roughly a 2° half-width), `GLINT_PEAK 12`, `GLINT_SIZE_MAX 3`, `GLINT_WHITE vec3(1.0, 0.97, 0.9)`. Clamp `pow(RANGE_REF_KM / rangeKm, RANGE_EXP)` to at most 2.

No new unit test: the maths has no test harness here and the parity test already pins the layout. Verification is the eye check below.

- [ ] Implement. `pick.wesl` keeps its fixed footprint and reads no lighting.
- [ ] Run `npm run typecheck:fast` and the parity test.
- [ ] Shoot `focus=body-earth&t=2026-11-01T22:00:00Z&layers=satellites` and look for colours and an unlit night-side wedge.
- [ ] Commit: `Satellites catch sunlight, fall into Earth's shadow and flash from their panels`.

### Task 5: Colour tuning

`review: yes`

**Files:**
- Create: `src/layers/satellites/@types/SatelliteColors.d.ts`, `src/layers/satellites/state/satelliteColors/{initialState,slice,selectors}.ts`, `src/layers/satellites/controls/ui/SatelliteColorsSection.tsx`, `src/layers/satellites/controls/ui/SatelliteColorsSectionContainer.tsx`, `src/layers/satellites/controls/utils/formatSatelliteColorDefaults.ts`
- Test: `tests/layers/satellites/frame.test.ts`, `tests/layers/satellites/controls/utils/formatSatelliteColorDefaults.test.ts`
- Modify: `src/layers/satellites/state/slices.ts`, `src/layers/satellites/layer.ts`, `src/layers/satellites/frame.ts`, `src/layers/satellites/orbits/passes/satelliteOrbitsPass.ts:68`, `src/layers/satellites/points/data/satellitePointStyle.ts`

**Interfaces:**

```ts
type SatelliteColors = Readonly<Record<SatelliteProfileId, Vec3>>;
// slice: name 'settings/satelliteColors', reducerPath 'satelliteColors'
setSatelliteColor({ id, color }: { id: SatelliteProfileId; color: Vec3 });
resetSatelliteColors();
formatSatelliteColorDefaults(colors: SatelliteColors, defaults: SatelliteColors): string;
```

Follow `src/layers/blackHoles/state/lensingTuning/` for the slice and `BlackHoleLensingTuningSectionContainer.tsx` for the container. The section is a `DebugSection` titled `Satellite colours` with one `DebugColorRow` per profile, then a `Reset colours` button and a `CopyButton` labelled `Copy changed colours`. Register it with `{ slot: 'debug', content: SatelliteColorsSectionContainer }`.

The planner compares `state.settings.satelliteColors` by reference, after its early returns and before the upload, and calls `renderer.writeProfiles(packSatelliteProfiles(colors))` when it changed. The ring takes `state.settings.satelliteColors[SATELLITE_PROFILES[codes[k]!]!.id]`. `SATELLITE_POINT_STYLE.color` is deleted.

- [ ] Add tests:
  - `the profile table is written once per colour object` in `frame.test.ts`: with a fake runtime, two `plan` calls with the same `satelliteColors` reference write once, and a new reference writes again.
  - `formatSatelliteColorDefaults emits only changed rows` and `its output is a valid object-literal fragment`, with hand-written expected strings. Do not use the function to build the expectation.
- [ ] Run them and see them fail, then implement, then see them pass.
- [ ] Run `npm run typecheck:fast`.
- [ ] Commit: `Debug panel tunes satellite colours per group`.

### Task 6: Card note and docs

**Files:** `src/layers/satellites/focus/ui/SatelliteDetailCard/SatelliteDetailCard.tsx`, `docs/RENDERER.md:38`

No new test: copy and docs.

- [ ] Add one line to the card: `Brightness and flashes are modelled from sunlight and typical panel size.`
- [ ] Update the RENDERER.md Earth satellites bullet: profile table at binding 3, per-instance code, lighting in `illumination.wesl`, and that glints use a modelled attitude.
- [ ] Commit: `Satellite card says its brightness is modelled`.

## Definition of Done

**Deliverables:** `SATELLITE_PROFILES`, `illumination.wesl`, `settings.satelliteColors`, `DebugColorRow`, and the `Satellite colours` DebugPanel section.

**Smoke, on this worktree's server** (`layers=satellites` turns the Layer on; the local catalog's window requires a `t` near 2026-11-01):

- [ ] `focus=body-earth&t=2026-11-01T22:00:00Z&layers=satellites`: dots differ in colour by group.
- [ ] Night-side pose with the same `t`: a dark wedge through the shell behind Earth.
- [ ] Sunward pose with the clock running: occasional brief flashes.
- [ ] Debug panel: a colour edit with the clock paused shows on the next frame; Reset restores it; the selected ring follows it.
- [ ] A selected eclipsed satellite stays pickable and followable.

**Out of scope:** 3D models, velocity streaks, fleet-wide rings, debris flicker, tuning anything but colour, any catalog format change.
