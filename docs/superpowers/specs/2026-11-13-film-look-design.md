# Film look — design spec

**Status:** approved shape (refactor-ground checkpoint, asks kQDv + kGbo, 2026-11-13). Spike reference:
branch `spike/film-look` (commit `514895770`), never landed.

## 1. What this is

A switchable cinematic post look, off by default: a display-space grade (contrast about mid grey, black
lift, cool/warm split tone, oval vignette, analogue grain), lateral chromatic aberration and edge softness
of an anamorphic lens, an anamorphic bloom (taps stretched by the squeeze, horizontal streak flares),
a veiling-glare wash, and an area-aware firefly cap so the Sun's disc washes out the way a camera's Sun does
while lone bright pixels keep today's flicker guard. Optional 2.39:1 letterbox bars.

With the look **off the frame is the frame shipped today**: same passes, same pipelines, same shader
code, same VRAM.

## 2. Rulings (owner's)

| #  | Ruling |
| -- | ------ |
| R1 | Ship it from the spike, production-grade, "according to our repo rulings" (2026-11-13). |
| R2 | On-switch: a **Display section header toggle** plus a **`#film` hash param row**. [kQDv Q3] |
| R3 | **Keep the letterbox**; drop **barrel distortion** and the **`?film` query gate**. [kQDv Q2] |
| R4 | **No BloomJob**: `runBloom` keeps reading settings and resolves "look off" itself. [kQDv Q1, kGbo] |
| R5 | One PR, prep commit first. The `URL_GATES` backlog item stays in the backlog. [kQDv Q4, Q5] |
| R6 | Film off must not change performance; measured, not assumed (chat, 2026-11-13). |
| R7 | Debug knobs stay in the DebugPanel; the grain must not repeat; chromatic aberration must be able to go strong; the raised cap must be area-aware (spike turns). |

### Decisions made in this spec (challenge freely)

- **D1. Two pipeline variants, one shader.** The compositor fragment declares `override FILM: bool = false;`
  and the film block sits under `if (FILM)`. The compositor keys its pipeline cache on
  `${blend}:${dstFormat}:${film}`, passing `constants: { FILM: 1 }` only for the film variant. Off, the
  compiled pipeline is today's code; the only residue is a larger uniform buffer (80 bytes, was 32).
- **D2. The letterbox is two DOM bars, no frame code.** A `LetterboxBars` component beside the canvas,
  below the HUD in stacking order and above the canvas, `pointer-events: none`, each bar
  `height: max(0px, calc((100vh - 100vw / 2.39) / 2))`, shown while `film.enabled && film.letterbox`. It
  covers the canvas and its GPU overlays (labels, rings) and leaves the HUD panels on top; the recorder and
  the shot tool capture the composited page (`Page.captureScreenshot`, which already carries the tour's
  DOM captions), so bars reach recordings. The builder check overturned the in-canvas version: the
  executor gains no special case, the shader no lane, and the band's formula has one home, the CSS.
- **D3. Streak has no switch**: `streakStrength === 0` is off (no passes, no fold), the same rule `veil` uses.
- **D4. The grain seed is a value** from `EngineState.frameIndex`, incremented by `renderFrame` once per
  frame; the compositor holds no counter.
- **D5. The cap floor travels as a uniform** (`capFloor = DEFAULT_BLOOM_CAP`), so the bright shader has no
  `2.0` literal and no parity test. Erosion runs only where `cap > capFloor` and the soft threshold admitted
  the pixel (`f > 0`), so dark sky pays no neighbourhood reads.
- **D6. Settings cluster is nested two deep, all-numeric records under two flags**, so each DebugPanel
  board is one `SliderField<K>` list with no key exclusions.
- **D7. `#film` is `deepLink: false`** like `orientation`: a view preference, not a navigational target.
- **D8. Knob names carry units**: `grainSizePx`, `chromaticPx`, `softnessPx`.
- **D9. The streak reads `bloom1`, not `bloom0`.** Every streak source is then quarter-res like the streak
  targets, so stride and falloff need no per-iteration scale (the spike doubled both on iteration 0 because
  it read half-res `bloom0`). The radar's second finding. `bloom1` at that point holds the Karis
  downsample alone (the upsample folds come later), which also tames fireflies in the streak seed; the Virgo
  eye check confirms the cores still streak.

## 3. Ground preparation

### 3.1 Ideal shape (data first)

- Settings: a `film` row in `CORE_SETTINGS_SLICES`, cluster `{ enabled, letterbox, grade, glow }`.
- Frame → compositor: `ToneMap.film: FilmLook | null`, folded once in `renderFrame`.
- Frame → bloom: `runBloom` reads `state.settings.film` beside `state.settings.bloom` (R4).
- Pyramid: `fold` addressed by `FoldKind`, `bright` takes a params object; `streak` and `veil` are new methods.
- Targets: four `allocateWhen` rows. Link: a `HashParamSource` row + `LinkIntent.film?`.
- UI: a header toggle in Display; two DebugPanel boards; the letterbox bars component.

### 3.2 Verdicts

| Touchpoint | Verdict | Note |
| --- | --- | --- |
| `ToneMap.film` optional with a compositor fallback | bolt-on | field only one case reads; becomes required `FilmLook \| null` |
| `fold(…, slot?: 0\|1\|2)` | bolt-on | silent fallback to 0; becomes `kind: FoldKind` over a `Record` |
| `bright(…, cap?)` + WGSL literal floor | bolt-on | becomes `{ threshold, cap, capFloor }`, no literal |
| `hasUrlGate('film')` in a slice | bolt-on | seventh hand-added gate; dropped (R3) |
| film cluster, rows, hash row, saga line, UI | growth | existing seams |

### 3.3 Prep (own commit, first)

**P1. `BloomPyramid`: fold by kind, bright by params.** `fold(pass, src, kind: FoldKind, strength)` with
`FoldKind = 'bloom'` only (the record grows in the feature commit); `bright(pass, src, { threshold, cap,
capFloor })` writing `[threshold, knee, cap, capFloor]`; `bright.wesl` reads `u.z`/`u.w` and clamps to
`u.w` (today's behaviour exactly, since cap === capFloor). `DEFAULT_BLOOM_CAP = 2.0` joins
`DEFAULT_BLOOM_THRESHOLD` in `src/data/defaults.ts` (the pyramid's private `2.0` and the shader's move
there). Callers: `runBloom.ts` and the galaxy-renderer tool's `encodeBloomPyramid.ts`. No behaviour change.

The greenfield cross-check proposed a resolved `BloomJob` on the bloom step as a second prep; the owner
ruled it out (R4).

## 4. Settings and state

```ts
// src/@types/settings/FilmGrade.d.ts
export type FilmGrade = {
  contrast: number; lift: number; splitTone: number;
  grain: number; grainSizePx: number; vignette: number;
  chromaticPx: number; softnessPx: number;
  /** Anamorphic ratio 1..2; also stretches the bloom taps. */
  squeeze: number;
};
// src/@types/settings/FilmGlow.d.ts
export type FilmGlow = {
  /** Firefly cap in HDR units; equal to DEFAULT_BLOOM_CAP = no erosion. */
  cap: number;
  streakThreshold: number; streakStrength: number; streakLength: number; streakTint: number;
  veil: number;
};
// src/@types/settings/FilmSettings.d.ts
export type FilmSettings = { enabled: boolean; letterbox: boolean; grade: FilmGrade; glow: FilmGlow };
```

Slice `settings/film` (`reducerPath: 'film'`), reducers: `setFilmEnabled(boolean)`,
`setFilmLetterbox(boolean)`, `tuneFilmGrade(Partial<FilmGrade>)`, `tuneFilmGlow(Partial<FilmGlow>)`
(the `setGeodesicTuning` precedent). Defaults `DEFAULT_FILM: FilmSettings` in `src/data/film/filmDefaults.ts`:

| key | default | slider range |
| --- | --- | --- |
| enabled / letterbox | false / false | toggles |
| contrast | 1.1 | 0.8–1.6 |
| lift | 0.02 | 0–0.1 |
| splitTone | 0.5 | 0–1 |
| grain | 0.06 | 0–0.2 |
| grainSizePx | 2 | 1–6 |
| vignette | 0.35 | 0–1 |
| chromaticPx | 3 | 0–30 |
| softnessPx | 3 | 0–20 |
| squeeze | 1.5 | 1–2 |
| cap | 12 | 1–50 |
| streakThreshold | 1.5 | 0–10 |
| streakStrength | 1 | 0–3 (0 = off) |
| streakLength | 1 | 0.25–4 |
| streakTint | 0.7 | 0–1 |
| veil | 0.3 | 0–2 (0 = off) |

Not in `CORE_SNAPSHOT_CLUSTERS` (a tour does not force it; one token when it does). `selectFilm` in
`selectors.ts`; `makeSettingsFixture` gains the cluster; `CoreSettingsState.film`.

Two shared predicates, one home each, read by both the render-target rows and `runBloom` (the
`allocateWhen` contract: consumer gated on the SAME condition):
`src/utils/film/filmStreakOn.ts` (`enabled && glow.streakStrength > 0`) and
`src/utils/film/filmVeilOn.ts` (`enabled && glow.veil > 0`).

`EngineState.frameIndex: number` (seeded 0 in `engine.ts`), `renderFrame` does `state.frameIndex += 1`
first thing.

## 5. Frame → compositor

```ts
// src/@types/rendering/FilmLook.d.ts
export type FilmLook = { readonly grade: FilmGrade; readonly seed: number };
// ToneMap
readonly film: FilmLook | null;   // null = off; every literal says so
```

`renderFrame`: `film: state.settings.film.enabled ? { grade, seed: state.frameIndex >>> 0 } : null`.
Every `ToneMap` literal (7 test files, the galaxy-renderer tool) gains `film: null`.

Compositor: `entryFor(blend, dstFormat, film: boolean)`; key `${blend}:${dstFormat}:${film ? 'film' : 'plain'}`;
`fragment.constants = film ? { FILM: 1 } : undefined`. A second sampler binding (3, linear) for the
aberration taps is declared in the layout for both variants (an unused binding costs nothing). Uniform
buffer 80 bytes:

| lane | bytes | field | type | note |
| --- | --- | --- | --- | --- |
| 0–7 | 0–31 | exposure, whitepointSq, asinhSoftness, curve, toneEnabled, preserveAlpha, hdrKnee, hdrHeadroom | as today | unchanged |
| 8 | 32 | contrast | f32 | |
| 9 | 36 | lift | f32 | |
| 10 | 40 | splitTone | f32 | |
| 11 | 44 | grain | f32 | |
| 12 | 48 | grainSizePx | f32 | |
| 13 | 52 | vignette | f32 | |
| 14 | 56 | chromaticPx | f32 | px at the corner |
| 15 | 60 | softnessPx | f32 | px at the corner |
| 16 | 64 | squeeze | f32 | |
| 17 | 68 | seed | u32 | `frameIndex` |
| 18–19 | 72–79 | pad | | |

Lanes 8–17 are written only when `tone.film !== null`; the plain variant never reads them. `io.wesl`'s
`CompositorUniforms` mirrors this table byte for byte (the file says so in its header, the one place it
runs over the comment budget).

Shader (`compositor/fragment.wesl`, ported from the spike minus distortion): under `if (FILM)`, after
the curve and the HDR spill: contrast about 0.18, lift, split tone (cool `0.90,0.97,1.10` / warm
`1.08,1.00,0.90` by `smoothstep(0, 0.7, luma)`), oval vignette (x divided by squeeze,
`smoothstep(0.2, 1.1, r2)`), grain `out += grainRgb * grain * (0.25 + 0.75·4l(1−l))` with 30 % chroma,
clamp ≥ 0. No letterbox code in the shader (D2). Before the curve, also under
`if (FILM)` and only when `chromaticPx > 0 || softnessPx > 0`: the 12-tap spectral smear
(`caSpectrum`, renormalised per channel) sharing its taps with the golden-angle softness disc (radius
`softnessPx·r2`, squeezed in x, rotated per pixel and frame by `cellNoise`). `lib/film.wesl` carries
`pcg3d`, `cellNoise`, `grainLayer`, `filmGrain`, `caSpectrum` as in the spike. Galaxy-renderer tool:
add the `lib/film.wesl` symlink beside `tonemap.wesl` (its `lib/` is per-file symlinks; the spike broke
the tool's link).

## 6. Frame → bloom

`BloomPyramid` after the feature:

```ts
export type FoldKind = 'bloom' | 'streak' | 'veil';           // src/@types/rendering/FoldKind.d.ts
export type BrightParams = { threshold: number; cap: number; capFloor: number };
export type StreakTaps = { texel: number; stride: number; threshold: number; falloff: number; tint: number };
bright(pass, srcView, params: BrightParams): void;
fold(pass, srcView, kind: FoldKind, strength: number): void;   // Record<FoldKind, GPUBuffer>
streak(pass, srcView, iteration: 0 | 1 | 2, taps: StreakTaps): void;  // 3 × 32-byte buffers
veil(pass, srcView, axis: 'x' | 'y', srcTexelSize: Vec2): void;       // 2 × 16-byte buffers
```

Constants in `src/data/bloomConstants.ts`: `STREAK_FALLOFF_TEXELS = 48`, `VEIL_SIGMA_TEXELS = 8`.

`runBloom` order, look on (look off = today's ten passes, nothing else encoded):

1. bright `hdr → bloom0` with `{ threshold, cap: enabled ? glow.cap : DEFAULT_BLOOM_CAP, capFloor: DEFAULT_BLOOM_CAP }` (begin timestamp)
2. downsample 1..4, texel x scaled by `squeeze` (1 when off)
3. if `filmStreakOn`: streak ×3, sources `bloom1 → streak0 → streak1 → streak0` (all quarter-res, D9), strides `1, 4, 16`, threshold on iteration 0 only, falloff `streakLength · 48`, tint
4. upsample 3..0, same texel scaling
5. if `filmVeilOn`: veil x `bloom4 → veil0`, veil y `veil0 → veil1`, fold `veil1 → hdr` kind `'veil'` strength `glow.veil`
6. if `filmStreakOn`: fold `streak0 → hdr` kind `'streak'` strength `streakStrength`
7. fold `bloom0 → hdr` kind `'bloom'` (end timestamp, always last)

Render-target rows (`renderTargetRows`): `streak0`, `streak1` at `bloomScale(1)`, `allocateWhen: filmStreakOn`;
`veil0`, `veil1` at `bloomScale(4)`, `allocateWhen: filmVeilOn`; HDR format, clear `a = 0`.

Shaders: `bloom/streak.wesl` and `bloom/veil.wesl` as in the spike (zeroed off-frame taps, per-channel
exponential falloff with tint dispersion; separable Gaussian, 24 taps each side). `bloom/bright.wesl`:
`u = [threshold, knee, cap, capFloor]`; `maxB = capFloor`; when `cap > capFloor && f > 0`, erode over the
3×3 bloom0-texel neighbourhood (±2 hdr texels) and `maxB = clamp(eroded, capFloor, cap)`.

## 7. Link and UI

- `hashParamSources`: row `film`, `deepLink: false`, `writesOn: [setFilmEnabled.match]`,
  `write: enabled ? '1' : null`, `read: value === '1' ? { film: true } : {}`,
  `readAbsent: [setFilmEnabled(false)]`. `LinkIntent.film?: boolean`;
  `applyLinkSettingsSaga` puts `setFilmEnabled(intent.film)` when present.
- Display section: `CollapsibleSection title="Film look"` with a header toggle (aria "Toggle Film look"),
  body one `panelRow` of hint copy: "Grain, glow and a softer lens, like a filmed shot." Container wires
  `selectFilmEnabled` → `setFilmEnabled`. Person and job: as a viewer I want the scene to feel filmed so a
  shot or a show reads as cinema, not a diagram. Place: after Bloom, before HDR. States: on/off only.
- DebugPanel: `FilmGradeTuningSectionContainer` ("Film grade": the grade sliders + the Letterbox and
  Film look toggles via `DebugOverlayToggles`) and `FilmGlowTuningSectionContainer` ("Film glow"), both
  after `FocusMovesTuningSectionContainer`.

## 8. Performance gate (R6)

Before any film code (after P1): `npm run perf -- --url http://localhost:<this worktree's port>` on
`earth-surface`, `solar-system`, `star-field`, `milky-way`, `local-group`, `full-survey`, 30 frames,
saved to the scratchpad. After the feature, look **off**, same flags: MERGED `bloom` and the tone-map
composite slot within run noise (~0.5 ms) on every scenario, plus one control scenario. Any regression
halts for a ruling. Look **on**: the harness has no settings seam and no `star-sun` pose, so the price is read from the
DebugPanel's GPU timings section (`?gpuTimings`) at `#focus=star-sun&film=1` and
`#focus=body-earth&t=2026-11-12T07:00:00Z&film=1`, `bloom` and `hdr→swap` rows, against the same links
without `film`; reported as an approximate price, never folded into the neutral claim.

## 9. Tests (acceptance)

Only what can fail on a real bug the compiler misses:

- `compositor.test.ts`: *film look packs lanes 8..18 and compiles the FILM variant* (lane offsets against
  the table; pipeline count 2 for plain + film on one key); *film null packs nothing past lane 7 and reuses
  the plain pipeline*.
- `bloomPyramid.test.ts`: extend the anti-race test: the three fold kinds, the three streak iterations and the
  two veil axes each bind the buffer they wrote and never share; extend the blend test: streak and veil
  pipelines have no blend.
- `runBloom.test.ts`: *look off encodes exactly today's pass sequence*; *look on: streak reads bloom0 after
  bright, veil reads bloom4 after the last downsample, the folds precede the bloom fold, and the end
  timestamp still rides the last pass*.
- `hashParamSources.test.ts`: *film writes `1` only when on, reads `1` as on, absent turns it off*.
- `DisplaySection.test.ts`: *toggles filmEnabled via the header toggle* (the bloom pattern).
- No tests for the slice, the defaults, the selectors, the saga line (one `put`), the shaders, or the
  letterbox bars (presentational, no interaction).

## 10. Eye checks (DoD smoke, this worktree's port)

- `#focus=star-sun&film=1` vs the same link without `film`: the Sun washes out smoothly, no lobes.
- `#focus=galaxy-cluster-virgo-m87&film=1`: streaks on the bright cores, grain not repeating across frames.
- `#focus=body-earth&t=2026-11-12T07:00:00Z&film=1` corner crop: softness and aberration grow toward the corner; Fomalhaut's neighbours unchanged against the no-film shot.
- Letterbox on (DebugPanel): black bars over the canvas and its labels, HUD panels still on top; a
  `npm run shot` of the link carries the bars.
- Film off: the shot is pixel-identical to main's for the Earth link.

## 11. Docs and backlog

- `docs/RENDERER.md` quick map: one bullet for the film look (where it lives, the FILM override, the
  letterbox bars component, the shared predicates).
- Backlog: `docs/backlog/2026-11-13-film-barrel-distortion.md` (anamorphic barrel distortion needs the
  overlays under the film pass; dropped by R3) with its index line.

## 12. Left to the builder

- Exact `CollapsibleSection` markup for a body with no sliders; the hint's styling.
- Where `LetterboxBars` mounts (beside the canvas, under the HUD) and its stacking value.
- Whether `DebugOverlayToggles` takes the two booleans from a derived `{ enabled, letterbox }` view or the
  board renders two `DebugCheckbox` rows.
- Test fixture plumbing for `frameIndex` in `renderFrame` tests.
