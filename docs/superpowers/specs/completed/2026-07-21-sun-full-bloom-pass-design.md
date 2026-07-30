# Full bloom pass — Sun, planets, stars, Milky Way — design

> **Status.** Approved design — every decision below is user-ratified (grill session:
> `docs/grill-sessions/sun-full-bloom-pass-2026-07-21.md`). Awaiting plan.
> **Date.** 2026-07-21.
> **Relationship to prior work.** Consumes the single-`rgba16float`-accumulator frame
> architecture (`renderTargets.ts`, `frameProgram.ts`, the compositor) unchanged in kind;
> ports the galaxy-renderer dev tool's dual-filter bloom
> (`tools/galaxy-renderer/src/engine/createGalaxyEngine.ts` + its `bloom*.wesl` shaders)
> into the main app; extends the `foreground:0`-depth occlusion mechanism shipped by
> near-field caption occlusion (PR #461, `lib/sceneDepth.wesl`) to the COSMO overlay
> layers. Directly relevant deferred work it may resolve for free: the additive dark-limb
> twilight glow (deferred in `plans/completed/2026-07-19-planet-atmospherics-feature.md`)
> and the Saturn-ring-brightness backlog item — both stay in the backlog until visually
> confirmed.

## 1. What we're building

A real multi-scale screen-space bloom for the bright emissive layers. Today the resolved
Sun disc is a flat emissive sphere with **zero** glow (`starRenderer` sphere branch), and
point-stars/Milky Way rely on single-pass sprite halos. After this feature, near-saturated
light — the Sun disc, lit planet limbs, the brightest star cores, the dense Milky Way
ridge — bleeds into a wide, soft, stacked halo produced by a 5-level dual-filter mip
pyramid (Bjørge-style: soft-knee bright pass, Karis-weighted downsamples, tent-filter
additive upsamples), composited back into the linear HDR accumulator before the one
tone-map.

### 1.1 Goals

- The Sun disc gets its missing glow; bright stars and the Milky Way ridge gain a
  quality bloom on top of (not replacing) their sprite glow.
- Selectivity by **threshold placement**, not extra scene draws: the bright pass reads
  the already-rendered HDR light; the survey galaxy points sit far below the threshold
  and stay crisp. The bloom chain is pure fullscreen passes — cost is resolution-bound,
  independent of scene complexity.
- One tone-map. The frame graph's two tone-mapped composites collapse into one
  (`tonemap(fg over hdr)` instead of `tonemap(fg) over tonemap(hdr)`) — a correctness
  improvement independent of bloom.
- Quality-first budget: ~3–5 ms acceptable; estimate ~1–2 ms at dpr-2 desktop for the
  half-res chain. **Perf is tuned after it's built** (user decision), measured with
  `npm run perf --scenario solar-system` before/after.

### 1.2 Non-goals (explicitly deferred)

- **Twilight additive glow + Saturn ring retune** — likely improved for free; their
  backlog entries stay until visually confirmed.
- **Per-layer bloom strength / aux-channel tagging** — one global
  `{enabled, strength, threshold}`; revisit only if threshold selectivity proves
  insufficient.
- **Sprite-glow retune** — `starGlowProfile`/`starKnee` untouched; revisit in the
  post-build tuning phase only if the combined look reads milky (grill Q6).
- **Sharing the bloom WESL with the galaxy-renderer tool** (the `cloudSprite.wesl`
  pattern) — the tool keeps its copy for now; consolidation is a backlog candidate.
- **Bloom in the tour snapshot** — `settings.bloom` joins `tonemap` in the
  `SettingsSnapshot` exclusion list; the tour does not animate it.

## 2. Ground preparation

Per the refactor-the-ground convention. Verdicts: six of seven touchpoints are pure
growth (table rows / new files at existing seams); one deliberate draw-order coupling
must become a real joint first. **User decision: prep and feature ride ONE PR**, with
commits sequenced prep-first so each prep step is independently revertable and visually
verifiable.

### Prep commit A — COSMO overlays occlude bodies by coverage, not draw order

`frameProgram.ts:24-31` documents today's ordering trick: the `foreground:0 → swap`
composite draws **after** the COSMO swap overlays so opaque bodies cover the
cosmological selection rings, label stems, MSDF labels, and marker lines. The tone-map
merge (prep B) inverts that order, so the occlusion must move from draw order into the
layers themselves.

The joint already exists in embryo: `foregroundLabelsLayer` samples `foreground:0`
depth via `lib/sceneDepth.wesl`. Extend that to the three non-debug COSMO overlay
layers — `labelsLayer`, `markerLinesLayer`, `selectionRingLayer` (`clipPathDebugLayer`
and `diskRadiusRingLayer` are debug-only and skipped). One deliberate difference from
the NEAR0 caption case: COSMO overlay depths are **not comparable** to NEAR0 reversed-Z
slab depth, and don't need to be — any foreground body is nearer than cosmological
geometry by construction. The test is a **coverage test** (foreground depth written at
this pixel ⇒ discard), not a cross-slab depth compare.

Behavior-neutral: bodies occlude overlays exactly as before; verify visually (nothing
changes) before prep B lands.

### Prep commit B — one tone-map

- Move the `render → foreground:0 (NEAR0)` step before the composites.
- New composite step `{ source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null }`
  — callable today with zero compositor changes (`Compositor.draw()` takes `blend` and
  `tone` as independent args; `CompositeBlend.d.ts:14` pre-declared the `over` consumer).
- Delete the second tone-mapped composite (`foreground:0 → swap`). The remaining
  `hdr → swap` replace-composite is now the frame's only tone-map.
- `dstFormatFor` (compositor.ts:225-229) currently assumes `over → swapFormat`; derive
  the format from the composite step's `dest` instead.

Ratified look change: bodies-over-starlight now tone-maps once in linear
(imperceptible-to-better); COSMO overlays keep their occlusion via prep A.

## 3. The frame program after

```
compute: flow
compute: atmosphereSkyView
render → volume (COSMO)
render → hdr (COSMO)                 · includes volume-upsample layer (unchanged)
render → star-aggregates (NEAR0)
render → hdr (NEAR0)                 · includes star-upsample layer (unchanged)
render → foreground:0 (NEAR0)        · MOVED earlier (prep B)
composite: foreground:0 → hdr        · over, tone:null (prep B) — hdr is now ALL linear scene light
render → bloom0                      · bright pass: soft-knee threshold + firefly clamp, reads hdr
render → bloom1..bloom4              · 4 dual-filter downsamples (Karis average on level 0 only)
render → (upsample fold, 4 stages)   · 8-tap tent, additive, coarse→fine back to bloom0
render → hdr (bloom fold)            · bloomFoldLayer: bloom0 × strength, additive blit into hdr
composite: hdr → swap                · replace, tone — UNCHANGED, the frame's only tone-map
render → swap (COSMO overlays)       · now coverage-occluded per prep A
render → swap (NEAR0 captions)       · unchanged
pick …                               · unchanged
```

Skipping: when `settings.bloom.enabled` is false, **none of the bloom steps are emitted**
(gate at program build, not a no-op draw — per the opacity-0-means-no-render rule).

## 4. The bloom chain

Ported from the tool (shaders adapted, not shared): `bloomBright.wesl`,
`bloomDownsample.wesl`, `bloomUpsample.wesl` →
`src/services/gpu/shaders/bloom/{bright,downsample,upsample}.wesl` + one shared
`io.wesl` for the family (the fullscreen-triangle vertex fn is per-family duplicated by
WESL module-locality convention, same as compositor/volumeUpsample/starAggregateUpsample).

- **Bright pass**: max-channel soft-knee threshold `f = max(0, l − threshold) / l` +
  firefly clamp (`maxB ≈ 2.0`); `threshold` is a uniform from `settings.bloom`,
  defaulted just under the `starKnee` ceiling so only near-saturated cores contribute
  (grill Q6 — exact default is a tuning-phase value).
- **Downsample ×4**: 5-tap dual filter; Karis `1/(1+maxChannel)` weighting on level 0
  only.
- **Upsample ×4**: 8-tap tent filter, additive one/one, folding each coarse level back
  onto the next finer *in place* — the upsample steps re-target `bloom3..bloom0`. The
  executor already supports this: its per-frame `touched` set gives the first pass
  against a target `loadOp: 'clear'` and every subsequent pass `loadOp: 'load'`
  (`executeFrame.ts:42-45, 102-112`), so the fold-in-place shape lands with zero
  executor changes and no extra target rows.
- **Fold into hdr**: a small dedicated blit pass + `ContentLayer`
  (`bloomFoldLayer`, the `volumeUpsampleLayer` shape) — additive into `hdr`, carrying
  the `strength` uniform. A dedicated layer (rather than the generic compositor) because
  strength is a per-draw uniform the compositor deliberately doesn't have.

New pass factory: `src/services/gpu/passes/bloomPyramid.ts` (pipelines + per-level
texel-size uniforms, mirroring the tool's `mipTexelBufs`).

## 5. Render targets

Five new rows in `buildSpecs()` (`renderTargets.ts`) — pure table growth, `scale` is
already an integer divisor:

```ts
{ id: 'bloom0', format: 'rgba16float', depth: null, scale: 2 },
{ id: 'bloom1', format: 'rgba16float', depth: null, scale: 4 },
{ id: 'bloom2', format: 'rgba16float', depth: null, scale: 8 },
{ id: 'bloom3', format: 'rgba16float', depth: null, scale: 16 },
{ id: 'bloom4', format: 'rgba16float', depth: null, scale: 32 },
```

plus one `TARGET_CLEAR_VALUES` entry per row (`{r:0,g:0,b:0,a:0}`, additive semantics —
`executeFrame` throws loudly on a missing entry).

`PASS_GROUP_TITLES`: one `'Bloom'` group, N rows (one per bloom `groupKey`,
matching how the two volume rows share `'Volumes & aggregates'`) — so `npm run perf`
and the DebugPanel bucket the chain under a single heading.

## 6. Settings

`settings.bloom: { enabled: boolean; strength: number; threshold: number }`, mirroring
the `tonemap` group file-for-file: `EngineSettingsState.d.ts`, `initialState.ts`,
`settingsSlice.ts` reducers, `selectors.ts`, a **Bloom sub-section inside the existing
Settings → Display section** (extend `DisplaySectionContainer` + the presentational
`DisplaySection` with the three controls — enabled toggle, strength slider, threshold
slider — per the create-component conventions), and **exclusion** from
`SettingsSnapshot.d.ts` (§1.2). `renderFrame.ts` threads the three values into
`frameProgram(...)` exactly as `tonemap.exposure`/`curve` are threaded today. Defaults:
`enabled: true`, `strength ≈ 0.85`, `threshold` from the tuning phase.

## 7. Platform + performance

- **iOS**: same pipeline everywhere — the chain is plain 2D-texture WGSL (no
  `texture_1d`, no WebKit-hostile constructs). Because all passes share the one frame
  encoder, an invalid pipeline silently blanks the whole canvas on iOS — verify on
  device before merge (`createShaderModuleWithDevLog` is the diagnosis path).
- **Perf protocol** (perf skill): baseline `npm run perf --scenario solar-system
  --scenario star-field --scenario milky-way` on this worktree's dev-server port
  **before** the feature commits, re-measure after, quote MERGED totals not per-layer
  numbers. `--sweep` to confirm the chain is fragment-bound (resolution-scalable).
  Expected ~1–2 ms added; the 3–5 ms allowance and the already-over-budget
  `solar-system` scenario (16.9 ms) make the post-build tuning phase real work, done
  with the user per their "tune once built" call.

## 8. Testing (what can actually break)

- **Program-shape tests** (extend the existing frameProgram tests): with bloom enabled,
  the foreground→hdr composite precedes the bright pass, the fold precedes the (single)
  tone-map composite, and exactly one tone-mapped composite exists; with bloom disabled,
  no bloom step is emitted and the program is otherwise identical.
- **Bright-pass knee JS-mirror** only if the threshold curve gets a JS twin for a
  settings preview (otherwise no shader-math mirror tests — tuning is visual).
- No reducer/selector restatement tests, no target-row constant tests (the runtime
  throw on a missing clear value already fails loudly) — per
  `docs/superpowers/conventions/testing.md`.
- Prep A/B are verified visually (behavior-neutral / ratified look change), plus the
  program-shape test pinning the single-tone-map invariant.

## 9. Decision log

Full alternatives + reasoning in `docs/grill-sessions/sun-full-bloom-pass-2026-07-21.md`
(Q1 selective scope, Q2 quality-first budget, Q3 threshold-not-redraw input, Q4 merged
single-tonemap frame graph, Q5 5-mip half-res pyramid, Q6 sprite-glow coexistence,
Q7 defaults). PR packaging: prep + feature in one PR, commits prep-first (user call,
recorded in memory `prep-rides-same-pr-ask`).
