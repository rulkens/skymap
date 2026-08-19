# Distant-galaxy fading — limiting-magnitude model — design

> **Status.** Approved design (brainstorm output). Awaiting a TDD plan.
> **Date.** 2026-07-10.
> **Relationship to prior work.** Replaces the point-shader intensity
> chain built up by the 2026-05-03 Malmquist-bias plan and the ad-hoc
> depth fade in `defaults.ts` (self-described there as "cosmetic … a
> saturation-avoidance hack"). The bias-correction *weights* survive,
> re-expressed as magnitude offsets. Phase 2 (luminosity-sorted draw
> range) is the "draw-range" tier of the pointRenderer perf roadmap.
>
> **Status addendum (2026-08-18).** §2's current-system description and
> §6's deletion targets describe pre-#502 code. PR #502 (physical
> surface-brightness rendering) replaced the ramp/floor/depth-fade braid
> this spec was written against; `falloffHalfMpc`, `intensityFloor`, and
> the `(22 − mag)/8` ramp no longer exist. The points shaders and
> renderer also moved, into `galaxyCatalog/`-family folders under
> `services/gpu/shaders/` and `services/gpu/renderers/`. An
> implementation plan must first reconcile this design against the SB
> model — supersede or complement it — before coding; the bytes-136–152
> reserved uniform slots §3 plans to repurpose are still free on main. A
> Phase-1 spike (panel → singleton → packer → shader, including an A/B
> anchor-fit tuning UI for the coupled depth/k knobs) is archived
> alongside this file as `2026-07-10-distant-galaxy-fading-spike.patch`
> — reference only; it predates the shader moves and will not apply.

## 1. What we're building

Galaxy-point visibility driven by one physically grounded quantity — the
galaxy's apparent magnitude **as seen from the camera** — compared
against a limiting magnitude that adapts to zoom. Two user sliders (sky
depth, softness). The default look shows *fewer* galaxies than today:
no more uniform far-field haze; luminous giants survive to distance,
dwarfs melt in only on close approach or a deeper slider.

### Goals

- **Fewer galaxies by default** — kill the additive haze created by the
  `intensityFloor = 0.02` pin and the compressed `(22 − mag)/8` ramp.
- **Tunable** — sky-depth + softness sliders; per-source calibration is
  one number, not two entangled constants.
- **Gradual reveal** — flying toward a region reveals its fainter
  members (camera-relative fade); zooming out raises the adaptive limit
  so the full cosmic web melts in at overview scale.
- **Performant** — visibility maps to a sorted draw range, so hidden
  galaxies cost zero vertex work (the renderer is vertex-bound).
- **Un-braided** — six multiplicative alpha factors become additive
  terms in a single magnitude pipeline.

### Non-goals (explicitly deferred)

- Fixing the HEALPix AngularReweight radial artifact ("Option B: skip
  sparse shells" from `computeAngularWeights.ts:85-91`) — ported as-is.
- Dropping vertex slot 3 (`magnitude`, unused after this change) to
  shrink the stride 52 → 48 bytes — a follow-up backlog item; this spec
  does not change the vertex layout.
- Real luminosity functions for Milliquas/DESI (their Schechter triples
  stay placeholders; the per-source offset is calibrated visually).
- Touching the disk-tier LOD ladder, the disk crossfade band, focus
  dimming, or the survey on/off fades — all orthogonal multipliers that
  remain exactly as they are.

## 2. The current system, and why it disappoints

A galaxy's brightness in `shaders/points/vertex.wesl:186-231` is a braid
of six multiplicative factors:

```
intensity = clamp((22 − mag)/8, intensityFloor, 1)   // Earth-apparent ramp
          × brightness                                // dead knob, no UI
          × biasWeight                                // per biasMode select
          × 1/(1 + (d/falloffHalfMpc)²)               // bolted-on depth fade
          × diskCrossfade × focusDim
```

Problems, each traced during the 2026-07-10 investigation:

1. The floor pins every faint galaxy to 2% brightness and the linear
   ramp compresses a ~1600× physical flux range (mag 14→22) into 20× —
   millions of identical floor-level points additively blend into fog.
2. The real levers (`falloffHalfMpc = 1000`, `intensityFloor`,
   `INVISIBILITY_THRESHOLD = 0.005`) are hardcoded; the UI has only a
   depth-fade *checkbox*; the `brightness` setting is plumbed to the
   shader but no UI dispatches it.
3. Fading to zero saves blend cost but not vertex cost — every one of
   ~2.5M instances runs the vertex shader every frame; culled ones exit
   via degenerate clip *after* the work is done.

## 3. The model — one magnitude pipeline

Every visibility factor becomes an **additive term in magnitude space**:

```
m_eff = absMag + 5·log10(max(d_cam, ε)) + 25   // camera-relative apparent mag
      + sourceMagOffset                         // per-source constant (§5)
      + biasMagOffset                           // baked per-vertex offset (§4)
```

`absMag` is already baked (vertex slot 12); `d_cam` is already computed
for billboard sizing — the distance-modulus add is the only new
per-vertex math.

The limit adapts to zoom, computed **CPU-side, once per frame**, and
shipped as a single uniform:

```
m_lim = depthSlider + k·log10(max(sceneScaleMpc, 1))
```

- `sceneScaleMpc` = camera distance to the origin. This is a deliberate
  seam: it is one scalar computed in one place, so switching to orbit
  radius (or a blend) during visual tuning is a one-line CPU change
  with no shader edit.
- `k` is a code constant, initial value 5 (visible set roughly constant
  while receding); tuned upward for a stronger overview reveal. Not a
  user knob.

Intensity is a true flux curve with a soft window, replacing ramp,
floor, and depth fade:

```
knee      = m_lim − softness
flux      = min(1, 10^(−0.4·(m_eff − knee)))
window    = smoothstep(0, 1, (m_lim − m_eff) / softness)   // 1 at the knee, 0 at m_lim
intensity = flux × window × diskCrossfade × focusDim
```

Brighter than the knee → saturates at 1 (overall tone remains the job
of the existing exposure/tonemap). Inside the softness band → real
flux falloff, eased to exactly 0 at `m_lim`. At 0 the existing
degenerate-clip cull fires; the pick pass stays exempt (dimmed galaxies
remain clickable), exactly as today.

`m_lim` and `softness` land in the `Uniforms` struct by repurposing the
reserved-but-unread slots in `points/io.wesl` (`apparentMagLimit`,
`schechterMStar/Alpha/MLim/NRef`) — byte offsets stay stable.

## 4. Bias weights fold in as magnitude offsets

The three per-vertex weights (slots 9/10/11) are re-expressed at
bake/splice time as **magnitude offsets**, `Δm = −2.5·log10(w)`, clamped
to `[−2.5, +10]` (a weight of 0 — e.g. famous rows' vMax short-circuit —
would otherwise be `+∞`; +10 mag is far past any plausible limit, so
the row is culled just as `× 0` culls it today). The shader selects the
active mode's offset and *adds* it — no per-vertex `log10`, the
conversion happens once on the CPU where clamping is testable.

- Slots 9/10/11 keep their byte offsets; only their contents change
  meaning (offset instead of weight). `spliceSchechterRatios` /
  `spliceAngularWeights` apply the conversion before writing.
  (A single active-offset slot rewritten on mode change would be the
  simpler vertex layout — stride 52 → 44 with the slot-3 follow-up —
  but makes every mode toggle a full-buffer splice; kept as a flagged
  follow-up candidate, not part of this feature.)
- **BiasMode 1 (VolumeLimited) is retired** along with its `absMagLimit`
  slider: the depth slider supersedes it (a camera-relative limit *is*
  a volume cut, continuously tunable). Enum values are append-only, so
  `1` is marked removed, never reused; persisted settings carrying
  mode 1 map to 0 (None) on load.
- Modes 0/2/3/4 keep their numbers and semantics; AngularReweight stays
  the default. The `biasMode.ts:51` docstring (stale `0 | 1 | 2 | 3`
  union) gets corrected in passing.

## 5. Per-source calibration is one number

`falloffHalfMpc` + `intensityFloor` (two entangled per-source constants)
are replaced by a single `sourceMagOffset` on `GalaxyCatalogSourceEntry`:

- Bulk catalogs (SDSS, 2MRS, GLADE, Famous): `0`.
- Sparse far-field catalogs (Milliquas, DESI deep/wedge/SGW, Synthetic):
  a negative offset (a "boost") calibrated visually so their current
  carefully-tuned showcase look is preserved at default slider values —
  honouring the standing do-not-retune-DESI decision. The offset is the
  *only* special treatment; they run the same shader path as everyone.

## 6. Deletions and migration

Removed outright:

| Surface | Replacement |
|---|---|
| `settings.galaxyCatalogs.depthFade` (checkbox + `depthFadeEnabled` uniform) | the model itself |
| `settings.galaxyCatalogs.brightness` (+ `setBrightness`/`selectBrightness`, dead) | exposure/tonemap |
| `settings.bias.absMagLimit` (+ M_lim slider) | depth slider |
| `falloffHalfMpc`, `intensityFloor` per-source | `sourceMagOffset` |
| `(22 − mag)/8` ramp, `1/(1+(d/half)²)` term in `vertex.wesl` | §3 curve |

New settings: `settings.galaxyCatalogs.skyDepth` (number, mag units,
range ~14–26) and `settings.galaxyCatalogs.fadeSoftness` (mag units,
range 0.5–4). Defaults chosen in the visual-tuning task (§9), biased
sparser than today's look.

Migration sweep (a plan task, not an afterthought): persisted-settings
load path, `captureSettings.ts` (tour snapshots read `brightness` and
`depthFade`), any tour clips or presets setting the removed fields, and
the settings-panel container props.

## 7. Phase 2 — luminosity-sorted draw range

The bake sorts each source's instances **brightest-first by absMag**
and keeps a permutation:

```
sortedToOriginal : Uint32Array   // sorted index → original catalog row
sortedAbsMags    : Float32Array  // ascending (brightest first)
```

- Non-finite absMag rows carry the baked fallback absMag (§8) and sort
  by it like everyone else.
- **The permutation is private to one owning module** (the sorted-cloud
  layout). It exposes `resolvePick(sortedIdx) → originalRow` and
  permutation-aware splice writes; neither the pick decode path nor the
  Schechter/HEALPix workers (which keep computing in original catalog
  order) ever touch `sortedToOriginal` directly — no caller can forget
  it, which is the wrong-galaxy-highlights bug class. The on-GPU
  encoding (`selectionEncoding.ts`) is untouched.

Per frame, per visible source, the CPU computes the faintest absMag
that could possibly pass the limit anywhere in the cloud, using the
camera's distance to the source's bounding sphere (`d_min`, clamped to
ε when the camera is inside — the bound then admits everything, which
is correct and merely conservative):

```
faintestVisible = m_lim − 5·log10(max(d_min, ε)) − 25 − sourceMagOffset − minBiasOffset
count           = upperBound(sortedAbsMags, faintestVisible)   // binary search
pass.draw(6, count)
```

`minBiasOffset` is the most-negative offset the active bias mode can
apply (−2.5·log10(1.2) ≈ −0.2 for the clamped modes; 0 for None/VMax),
so brightening weights can never pop a galaxy the range already culled.
The clamp bounds are exported constants of `weightToMagOffset` and the
draw-range bound reads them — one canonical home, no drift.
The bound is conservative — the shader's exact per-vertex fade still
owns the visual edge, so there is no popping, only skipped work.

## 8. Edge cases (pinned, not discovered later)

- **Non-finite absMag** (famous rows with NaN photometry): handled at
  **bake**, not in the shader — the bake writes a finite fallback
  absMag (bright enough to sit at the knee at default settings), so the
  shader carries no NaN special case at all. Verified by a test against
  a synthetic cloud with NaN rows.
- **Weight = 0**: `Δm` clamps to +10 → culled, matching today's `× 0`.
- **Camera inside a source's bounding sphere**: draw range degrades to
  "draw all" (conservative), never to "draw none".
- **Pick pass**: exempt from the intensity cull (unchanged) and uses
  the full instance count, not the visual draw range — otherwise a
  user couldn't click a galaxy mid-fade.

## 9. Testing & verification

- Pure functions, one per file per house rules, each with a focused
  test: `effectiveApparentMag`, `adaptiveLimitingMag`,
  `limitingMagIntensity`, `weightToMagOffset`, `visibleInstanceCount`.
  Reuse `apparentFromAbsolute`/`absoluteFromApparent` — no duplicate
  distance-modulus math.
- Permutation invariants on a synthetic cloud: sort is stable for ties,
  `sortedToOriginal` round-trips, a splice through the permutation
  lands on the same galaxy as an unsorted splice.
- The WGSL mirrors `limitingMagIntensity` term-for-term; correctness is
  verified visually on the dev server (per the WGSL-meticulous house
  rule), including: near-field approach reveal, zoom-out overview
  reveal, sparse-catalog look preservation, bias-mode A/B against main.
- Visual-tuning task at the end: pick `k`, slider defaults, and the
  sparse-source offsets with the user at the dev server.

## 10. Entanglement notes (design-time radar)

The design deletes braids: six multiplicative alpha factors → additive
magnitude terms; two per-source constants → one; a redundant mode +
slider pair → gone; the sparse-catalog exemption branch → plain data.
Remaining accepted couplings: the pick-pass cull exemption (essential —
clickability ≠ visibility), and the WGSL/TS mirror of the intensity
curve (same coupling every shader in the repo carries; mitigated by the
term-for-term test + visual pass).
