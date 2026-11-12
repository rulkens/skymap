# Asteroids Layer

Status: design, 2026-11-12. Modelled on the satellites Layer
(`docs/superpowers/specs/completed/2026-10-28-earth-satellites-design.md`); worktree `asteroids-layer`.

## 1. Intent

Skymap shows Ceres, Vesta and Bennu as meshes, and nothing else between the planets. The website says so
plainly ("Asteroids, comets, planets of other stars: No"). The main belt, the Trojans at Jupiter's L4 and
L5, the Hildas' triangle and the near-Earth swarm are some of the most telling structures a student can see
in the Solar System, and all of them come from one public catalog.

A new `asteroids` Layer draws every numbered minor planet from the Minor Planet Center's MPCORB as a point,
placed by two-body Kepler at the simulated time and as bright as it would really look from the camera. A
user can find an asteroid in the palette, pick it, follow it, read its card and see its orbit.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every numbered minor planet (about 900k, MPC numbers 1…N) drawn as an additive point, positioned by
  two-body Kepler from its osculating elements at the simulated time.
- Brightness is the apparent magnitude from the camera: H-G phase law, distance to the Sun, distance to the
  camera, phase angle. A V = 6 asteroid and a V = 6 star look the same.
- Five classes that toggle independently in Settings, coloured by class: near-Earth, main belt, Hilda,
  Jupiter trojan, distant (trans-Neptunian and beyond).
- Pick, palette search by number and name, an InfoCard, camera follow, and the selected asteroid's orbit
  ring.
- Off at boot, like satellites (owner ruling). Nothing is downloaded until the Layer is on and the camera
  is within Solar System range.

**Non-goals**

- Unnumbered objects (about 600k more). The owner chose numbered only.
- Comets. Different elements (q, T instead of a, M), a different brightness law, tails. A later Layer.
- Perturbations. Two-body only; the website's simplifications page says so (§7).
- Labels on the field. Only the selected asteroid is named, on its card.
- Meshes for more asteroids. That is the shape-model backlog item.
- A daily refresh. Osculating elements stay good for display for years; the data is refreshed by hand.

**Anti-goals**

- 900k `bodies` rows. Asteroids are data, never scene bodies; the body tables and `deriveBodyStates` never
  see them (the same rule as satellites).
- A CPU sweep of 900k Kepler solves per frame, or a worker that propagates.
- Two copies of one asteroid: Ceres (1), Vesta (4), Bennu (101955) and Pluto (134340) already draw as bodies.
- A new trail renderer path. The ring goes through the shared `drawOrbitConics` helper (§6).

## 3. Shape

```
MPCORB.DAT.gz ──▶ npm run fetch-mpcorb ──▶ data/raw/mpcorb/ ──▶ npm run build-asteroids
   ──▶ public/data/asteroids/asteroids.<hash>.astb + asteroid-names.<hash>.bin ──▶ npm run sync-r2-secure

src/layers/asteroids/
  layer.ts create.ts destroy.ts frame.ts visibility.ts
  catalog/{load,subsystems,@types}/   asset rows (demand-gated), decode, catalog record access
  kepler/{computes,render,subsystems}/  the compute pass that writes heliocentric positions; its CPU mirror
  points/{passes,render,data,subsystems}/  the dot pass + pick stamp, photometry uniforms, class colours
  orbits/passes/                      the selected asteroid's ring, one call to drawOrbitConics
  selection/                          kinds.ts, asteroidsSelectionRow.ts (pick, focus id, deep link, follow)
  focus/{present,ui}/                 search, detail and compact cards
  controls/ui/                        the Settings section (master + five class toggles)
src/data/asteroids/                   class enum + R2 path, shared with tools/ (the satellites pattern)
src/services/gpu/shaders/asteroids/   kepler compute + points vertex/fragment/pick
src/services/gpu/shaders/lib/kepler.wesl   the GPU Kepler solver
tools/fetch/fetchMpcorb.ts, tools/asteroids/buildAsteroids.ts
```

## 4. How it works

### 4.1 Data

**Source.** MPCORB.DAT.gz from the MPC, the numbered rows only, read by the packed designation column.
One raw-data registry row plus the MPC format ReadMe beside the file (`tools/utils/io/rawDataRegistry.ts`,
per docs/DATA.md). The orbit-type field in MPCORB's flags column gives the class; the build derives the
class from a, e and q only where the field is blank. The mapping (my call, to be checked against the MPC
format doc): Atira, Aten, Apollo and Amor → near-Earth; Hilda → Hilda; Jupiter trojan → Jupiter trojan;
distant object → distant; everything else (Hungarias, Mars-crossers, the belt proper) → main belt.

**File** `asteroids.astb` (its own extension, like `.satg`), little-endian, columnar:

- Header: magic `ASTB`, u16 version, u32 count, u32 firstNumber (= 1), f64 epoch JD (TT, shared), column
  directory, each column 4-byte aligned. number = firstNumber + row, and no number column is stored. A
  missing number (the 2026-11-11 file has one hole in 1…895,910) gets an ABSENT placeholder row.
- MPC's terms (the MPCORB header) allow redistribution with the header shipped beside the data and the
  MPC credited, so the bake writes `mpcorb-header.txt` next to the file.
- Per row, 23 bytes:

| column | type | encoding | why |
|---|---|---|---|
| a | f32 | AU | n = k·a^-1.5 needs δa/a < 2.4e-8 for 1″ after 100 years: f32, and MPC's own precision |
| e | u24 | e·2²⁴ | step 6e-8; the build rejects e ≥ 1 |
| i, Ω, ω, M₀ | u24 × 4 | turns·2²⁴, ecliptic J2000 | step 0.077″; M₀'s error does not grow with time |
| H | u16 | (H+5)·100, 0xFFFF = none | keeps MPC's 0.01 mag |
| G | u8 | (G+0.5)·100 | most rows carry the default 0.15 |
| flags | u8 | class (3 bits), NEO, PHA | |

  About 20.6 MB raw, ~17 MB brotli. Quantization is the only real size lever, and the precision above is
  far below the two-body model's own error (arcminutes to degrees over decades).
- **Shared epoch.** The build propagates the few rows at other epochs to MPCORB's dominant epoch with the
  same two-body model the app runs, so nothing is lost against what the runtime would compute.
- **Names** go in `asteroid-names.bin` (sorted u32 numbers, u32 offsets, a UTF-8 blob; ~150 KB brotli),
  loaded on the first palette search, never with the main file.

Both files are a `DATA_FAMILIES` row (`tools/deploy/r2/dataFamilies.ts`), content-hashed through the
manifest like stellar streams. Refreshing: `npm run fetch-mpcorb && npm run build-asteroids`, then
`npm run sync-r2-secure`. MPC's terms are recorded in ATTRIBUTIONS.md before the first upload; if they bar
redistribution, the effort stops there (§8).

### 4.2 Loading

One asset row, demand-gated like satellites': it demands while the Layer is on, at least one class is on
and the camera is within a load radius of the Sun (outside the radius where the Layer fades in, so data is
resident before the first dot shows), and releases past a larger evict radius. The Layer is full within
60 AU of the Sun and gone by 200 AU (the distant class reaches ~50–100 AU; zoomed out further, the whole
catalog is a few pixels and would read as a blob), so the row loads at 300 AU and releases past 500 AU. It also demands while the
palette is open or an asteroid is selected, so a search or a deep link works from anywhere (the satellites
rule). Decode happens off the main thread (a worker or `DecompressionStream` + one pass; the builder's
call). The decoded catalog expands the angles into the equatorial basis the GPU uses (§4.3); the
ecliptic → equatorial rotation is ε = 23.4392911°, since the world frame is equatorial. The asset priority
rung is the next free one; the rungs are still hand-picked (an existing backlog item).

### 4.3 Position: one compute pass, one CPU mirror

**GPU buffer** per asteroid, 40 bytes: `A = a·P̂` (vec3f, equatorial), e, `B = a·√(1−e²)·Q̂` (vec3f),
n (rad/day), M₀, and one packed word `H·100 : 16 | G : 8 | flags : 8`. The position is
`A·(cos E − e) + B·sin E`. About 36 MB for 900k rows.

**Compute pass** (`computes?` in the Layer contract) solves every asteroid every frame the Layer draws,
runs §4.4's brightness and §4.5's cull once per row, and appends each kept dot (`vec4f(helio xyz in AU,
lifted flux)` plus a row/class tag) to a compacted list counted into indirect draw args. There is no "last time" memo: a cache carried between frames is the shape
of hidden state the owner has pushed back on. A memo is added only if `npm run perf` shows the dispatch
matters. The dot and pick draws are `drawIndirect` over that list; Kepler and photometry never run per vertex. The CPU hands time as `dtWholeDays` (an integer held exactly
in f32) plus `dtFracDays`, so `M = M₀ + n·whole + n·frac` keeps the f32 error near 1–2″ at the window edges.

**Kepler solve** (`shaders/lib/kepler.wesl`, new): reduce M to [−π, π], start from Danby's
E₀ = M + 0.85·e·sign(M), run 5 Halley iterations with each step clamped to |ΔE| ≤ 1. A test emulates the
solver in f32 (`Math.fround`) over every catalog row × a grid of M and asserts |E − e·sin E − M| < 2e-7.

**CPU mirror.** Follow, the card and the ring use the same algorithm in f64 on the same decoded f32
inputs. The world position is `sun + helio·AU_IN_MPC` in f64. The selected asteroid's dot is drawn at
that CPU position (a uniform the vertex shader swaps in for the selected number), so the dot sits exactly
on the camera target with no f32 jitter when zoomed in. Whether the mirror reuses
`src/utils/orbit/eccentricAnomalyFromMean.ts` or adds the Danby/Halley variant beside it is the builder's
call; the parity test above is the contract either way.

**Precision.** f64 lives only on the CPU: sim JD, camera and Sun positions, and `sunFromCam` in AU. The
vertex shader adds `helio + sunFromCamAu` for a camera-relative position, the stars' and satellites' rule.

**Time window.** The Layer fades out with a smoothstep over the last year at each edge of 1900–2100 (the
moon-correction window), so a scrub to 1500 shows no positions that are wrong by degrees.

### 4.4 Brightness

In the compute pass, with r and Δ in AU and the phase angle α from a dot product (no `acos`):

  V = H + 5·log10(r·Δ) − 2.5·log10((1−G)·Φ₁ + G·Φ₂),  Φᵢ = exp(−Aᵢ·tan(α/2)^Bᵢ), A = 3.33/1.87,
  B = 0.63/1.22, tan(α/2) = √((1−cos α)/(1+cos α)).

For the dot only, the phase dimming is capped at 3.25 mag (a phase-term floor of ~0.05): seen with the Sun
behind it (α ≳ 120°), the near side of the belt lost ~7 mag to the law and read as a hole in the ring; at
the cap it reads as the ring's dimmer arc. The card keeps the physical V.

The flux is `pow(10, −0.4·V)`, which is the stars' `fluxApp` convention (theirs is
`10^(−0.4·absMag)·D_REF²/d²` with D_REF = 10 pc, the same number). It feeds `starPeakIntensity` and
`STAR_FLUX_EXPOSURE` from `shaders/lib/starPhotometry.wesl`.

**Display lift** (owner ruling, the stars' approach). At true V, the belt seen from 5–10 AU is V ≈ 19–22,
about 1e-4 of the calibrated flux, so the structures this Layer exists for would not show. As with
`starExposureRamp`, a monitor can't dark-adapt, so the flux is multiplied by
`asteroidExposureRamp(zoom)`, where zoom is the camera's distance to its orbit target (`cam.distance`): how
far out the view frames, not where the eye sits. A first cut keyed the lift on the eye's distance from the
Sun, exactly 1 near Earth; zoomed onto the Sun or framing Earth that left the field at true V, invisible.
The lift is `K·zoom²` (a dot near what you frame sits ~zoom away, so its apparent brightness holds as you
zoom) with zoom clamped to [6, 12] AU and K = 6e3, so 2.2e5 to 8.6e5. The floor is the lift framing Earth
or the inner system, where the belt shows as a field of dots among the stars. At the cap, top-down on the
whole belt, the dots start to overlap: past it a lift still growing with zoom² piled them into a blob, and
a flat one holds the field's surface brightness. Eye-tuned on shots near Earth, on the Sun at 3 and 12 AU
and at 50 AU. The result is
multiplied by the Layer's own brightness setting (§4.9). Dots under the flux floor are discarded to save
fill, and the floor applies after the lift. A row with no H draws at a fixed dim flux (the builder picks it and states it).
The card shows the same V from the same formula in TypeScript; a test checks a few asteroids against JPL
Horizons' V at one date, within a stated tolerance.

### 4.5 Drawing

Additive screen-sized dots into the depthless HDR accumulation, in the NEAR0 slab, under the trails'
occlusion, like satellites: `lib::billboard`, `lib::camera`, `lib::trailOcclusion`, `ADDITIVE_BLEND`.
`frameSections.ts` gains a plan line, the compute, and the two passes beside satellites in
POST_FOREGROUND (and `tools/site/matteHiddenPasses.ts` the pass names). The compute pass culls rows
whose class is off (the class fades) and the four mesh-drawn numbers (§4.6). Colours by class are
a small table in `points/data/`.

### 4.6 Skipping the bodies that already draw

`src/layers/asteroids/points/data/meshAsteroidNumbers.ts` holds `[1, 4, 101955, 134340]` (owner ruling: a
constant, like satellites' `HUBBLE_NORAD_ID`). Those rows are never drawn, picked or found by search,
and the focus-id row does not claim their numbers. Nothing in the app makes such a link, and redirecting
one to the body would grow the selection-row contract.

### 4.7 Selection, follow, search, card

- **Identity is the MPC number.** The ref is `{ type: 'asteroid', number }`; the focus id and deep link
  carry the number. MPC numbers are permanent and never reassigned, so links survive a data refresh, and
  index = number − 1 makes lookups trivial.
- **Pick.** `deps.pickCode('asteroid')`; the stamp writes `packSelection(code, row)`. 26 bits of local index
  hold 67M rows (`src/data/selectionEncoding.ts`). The stamp culls exactly as the dots do (class, hidden,
  flux floor), so an invisible asteroid never takes a click from a star or a planet.
- **Search** lists the ~25k named asteroids, matched by name or by `(433)`. The ~870k unnamed ones are
  reachable by pick and deep link only, because an 900k-row search snapshot is not worth its memory.
- **Follow.** A `SelectionKindRow` whose `extractRow` returns the CPU-mirror world position;
  `placeLiveSelection` places it under a `transient:asteroid-<number>` id each frame (generic since #974),
  with `driver.placedEachFrame` and `followsSimClock`.
- **Reveal.** `selects: ['asteroid']` in `visibility.ts`, so a deep link with the Layer off switches it on
  and arrives (the generic reveal).
- **Card** (`detailCard` ui row, `type: 'asteroid'`): number and name, class, a, e, i, period, H, distance
  from the Sun and from Earth now, apparent magnitude now, and the data epoch.
- **Exhibits.** `picking.off` gains `'asteroid'` in the three exhibits that already list `'satellite'`
  (solarSystem, voyagerMissions, zoneOfAvoidance), so a dot never steals a click meant for a planet.

### 4.8 The selected orbit ring

`orbits/passes/asteroidOrbitsPass.ts` builds one `OrbitTrail` for each selected and focused asteroid (the
Kepler ellipse from the same elements, centred on the Sun's snapshot position, with its current mean
anomaly so the lobe sits on the dot) and calls
`drawOrbitConics(pass, runtime.orbitRenderer, trails, orbitTrailView(view, ctx, state))`. The Layer owns
its `OrbitTrailRenderer` instance, as satellites do. Fade = class fade × window fade.

### 4.9 Settings

One Settings section: the Layer toggle, the five class toggles (every class on by default), and the
Layer's own brightness slider (owner ruling; default 1, a multiplier on the flux, independent of the
stars' slider). No size knob.

## 5. Rulings

1. **Scope: numbered minor planets only** (~900k), not a bright cut and not all 1.4M (owner, 2026-11-12).
2. **Brightness: apparent magnitude** (H-G, Sun and camera distance, phase) (owner).
3. **Off at boot** (owner).
4. **Orbit ring through a shared `drawOrbitConics` helper**: each Layer keeps its own pass and renderer, and
   the Layer contract does not grow (owner). The helper takes values, not the frame plumbing (owner).
5. **Mesh skip is a constant in the Layer**, not a body-row field (owner).
6. **Faint field: true V plus an exposure lift by camera distance from the Sun**, the stars' approach
   (owner). **Own brightness slider**, not the stars' (owner).
7. My calls, open to challenge: the MPCORB source; a hand refresh, not a cron; the five classes and their
   mapping; comets out; the 1900–2100 window; the quantized 23-byte row; the MPC number as identity;
   a names file of its own; the compute pass; the photometry reuse; `picking.off` in the three exhibits.

## 6. Ground preparation

`refactor-ground` ran on 2026-11-12 (checkpoint shown in the dash). Two edit-site traces informed it:
every file the satellites PRs touched outside their Layer, and a greenfield derivation of the data shapes
blind to the code.

**Prep (its own PR, landed before the feature):** extract `drawOrbitConics` and `orbitTrailView`.

```ts
// src/@types/rendering/orbitTrailRenderer/OrbitTrailView.d.ts
export type OrbitTrailView = {
  readonly slabVp: Float64Array; readonly viewportPx: Readonly<Vec2>;
  readonly eyeMpc: Readonly<Vec3>; readonly pxPerRad: number;
  readonly occluders: OccluderSpheres; readonly depth: SampledDepthBinding; readonly showImpostor: boolean;
};
// src/@types/rendering/orbitTrailRenderer/OrbitTrail.d.ts
export type OrbitTrail = OrbitConic & { readonly color: Readonly<Vec3>; readonly fade: number };

// src/services/engine/frame/orbitTrailView.ts: the one adapter from frame plumbing to a value
export function orbitTrailView(view: FrameView, ctx: ReadyFrameContext, state: PassState): OrbitTrailView;
// src/services/engine/frame/drawOrbitConics.ts: stages, packs (writeOrbitTrailRecord) and draws
export function drawOrbitConics(pass: GPURenderPassEncoder, renderer: OrbitTrailRenderer,
  trails: readonly OrbitTrail[], at: OrbitTrailView): void;
```

Core's `orbitTrailsPass` (`orbitTrailsPass.ts:96`, `:118`) and `satelliteOrbitsPass`
(`satelliteOrbitsPass.ts:61`, `:77`) switch to it, which leaves one packing loop instead of two. It is
behaviour-neutral, and the existing trail tests and an eye check of planet and satellite rings cover it.
The `slabVp` = `view.slab.vp` invariant moves into `orbitTrailView`, its only producer.

**Growth (no prep needed):**

- rows in `app.ts`, `appSettingsSlices`, `appVisibility` and `frameSections`;
- a `SelectionKindRow`, with pick, focus id, deep link and follow all generic since #956 and #974 (a grep for
  `'satellite'` in core finds no selection branch left);
- a `detailCard` ui row, `search`, asset rows, `computes`;
- `src/data/asteroids/`, a raw-data registry row, a `DATA_FAMILIES` row, package scripts;
- website facts.

**Considered, not prep:**

- A `LayerBody.catalogId` field instead of the skip constant (declined, §5.5).
- A shared WGSL `fluxFromMagnitude` (`pow(10, −0.4·m)` is the definition of magnitude, not a tangle).
- An `orbitTrailPlanners` Layer-contract member (declined in favour of the helper).
- The greenfield 512-point polyline ring, which would lose the conic renderer's occlusion and impostor.

## 7. Docs and website

- `docs/DATA.md` (format table row for `ASTB`, the refresh order), `docs/RENDERER.md` (the compute pass
  and the Kepler lib), ATTRIBUTIONS.md.
- Website: `start/scene.mdx`'s "Asteroids … No" row becomes "Numbered asteroids: yes, two-body orbits"
  (comets and exoplanets stay No); `simplifications.mdx` gains the two-body and 1900–2100 limits; data
  source, data family, settings and commands facts, per the satellites precedent.

## 8. Risks

- **MPC redistribution terms.** Checked 2026-11-12: allowed with the header and attribution (§4.1).
- **Phone memory and download.** About 17 MB over the wire, 36 + 14 MB of GPU buffers once on. The Layer is
  off by default and demand-gated; `npm run phone` and `npm run loadtime` check it with the Layer on.
- **Fill cost.** 900k additive dots in the belt's plane seen edge-on. The flux-floor discard is the first
  lever; `npm run perf` measures before and after with the Layer on (per the `perf` skill).

## 9. Left to the builder

The decode location, the exact fade and load radii, the colour table, the no-H flux, the Kepler mirror's
home, the Horizons test tolerance and the asset rung.
