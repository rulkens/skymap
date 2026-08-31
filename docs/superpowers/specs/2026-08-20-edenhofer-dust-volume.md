# Edenhofer local dust volume — design spec

Decisions: [`docs/grill-sessions/edenhofer-dust-volume-2026-08-19.md`](../../grill-sessions/edenhofer-dust-volume-2026-08-19.md) (Q1–Q11), building on the design research formerly in `docs/backlog/2026-07-18-local-dust-volume.md` (deleted with this spec — git history has it). This spec does not re-litigate those calls — it specifies how they land in code. Cited below as "grill Qn".

## Motivation

The Gaia star field renders the Sun's stellar neighbourhood; nothing renders the dust those stars sit inside. Edenhofer et al. 2024's parsec-scale 3D dust map (A&A 685, A82; Zenodo [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943), CC-BY 4.0) is the measured local companion — a genuine continuous extinction-density field, not an integrated column, reconstructed out to 1.25 kpc from 12 posterior HEALPix×distance samples (Nside 256, 516 log-spaced shells 69→1250 pc). This is the missing half of the 10¹⁹ "stars around the Sun" rung on the Powers-of-Ten ladder (`docs/powers-of-ten/data.js`), marked buildable precisely because Gaia already renders.

Rendering it means teaching the scalar-volume pipeline — today exclusively additive/emissive, tuned to make the cosmic web glow — to also be absorptive: dimming and reddening the stars behind it, the way real dark nebulae do.

## Data product and builder

- **Source:** `mean_and_std_healpix.fits` (3.25 GB) already on disk in the MAIN checkout at `data/raw/edenhofer/`, md5-verified against Zenodo, fetched by `data/raw/edenhofer/fetch_edenhofer.sh`. The release's own `interp2box.py` does the HEALPix→cartesian resample — it interpolates `log(density)` then exponentiates (verified at line 318), which is the correct resampling for this log-normal field; a hand-rolled linear resampler over the log-spaced radial shells would alias.
- **Statistic (grill Q3):** the builder computes the log-normal **median** from the shipped mean and std, `median = mean / sqrt(1 + (std/mean)²)`, offline in `tools/volumes/buildDustVolume.ts` — a closed-form per-voxel function of the two on-disk cubes, so no new SCFD channel is needed. This trims the mean's systematic void-brightening (log-normal mean is always brighter than any real realization) without a format change. `channels=2` (mean+std, live blend/uncertainty view) stays a backlog possibility, not built now.
- **Inner 69 pc hole (grill Q4):** accepted as-is — the reconstruction's own inner boundary, genuinely the lowest-dust region (why it starts there). A constant-floor fill is the documented fallback if the shell edge reads as a visible density step in the first visual pass; no fill ships at v1.
- **Extent and tiers (grill Q2):** tiers are a resolution knob over one fixed ±1.25 kpc Sun-centered cube — 128³/256³/384³ ≈ 19.5/9.8/6.5 pc voxels, mirroring MCPM's tier semantics (`tools/volumes/buildMcpmVolume.ts`) exactly: switching tiers changes quality, never what exists in the scene. 384³ stays inside the map's native ~2–10 pc effective resolution. A tighter parsec-scale Local-Bubble crop, if ever wanted, is a second field (`dust-bubble`) later, not a tier semantic.
- **Builder shape:** `tools/volumes/buildDustVolume.ts` clones `buildMcpmVolume.ts`'s structure (npy load → normalise/pack → `encodeScalarField` → tiered `.scfd` write, `SCALAR_FIELD_DATA_PREFIX` under `public/data/`) but reads the two Edenhofer cubes instead of one MCPM trace and applies the median-blend transform instead of `packLogTraceVoxels`'s log1p. Output is `channels=1` SCFD v3 (`src/data/volume/scalarFieldFormat.ts` — the `channels` byte at header offset 22), baked `frameKind: 'galactic'` — the native frame of the HEALPix map and of `interp2box.py`'s cartesian box, not equatorial; the `rotation` quaternion stays identity (reserved for per-cube tilt, not the frame rotation — see Sequencing step 5).

## Runtime shape

### Registry row

One `VolumeSourceEntry` (`src/@types/data/volume/VolumeSourceEntry.d.ts`), a sibling of `MCPM_ENTRY` (`src/data/sources/mcpm.ts:4-25`), at `src/data/sources/edenhofer-dust.ts`. `Source.EdenhoferDust` gets the next available code in `src/data/source.ts` (last entry today: `Polyphorm2MRS: 30`). Two `VolumeFieldDefaults` fields grow to carry it — see Ground preparation below.

### Render target and step

Today's scalar-volume march runs on the **COSMO** slab (`frameProgram.ts:98`), whose near clip is `COSMO_NEAR_MPC = 0.01` (10 kpc, `slabs.ts:116`) — a ±1.25 kpc cube sits entirely inside that near plane and would be clipped away. Per the 2026-08-19 slab research (folded into this spec), the fix is **NEAR0**, not a new slab: NEAR0 is infinite-far reversed-Z (`SLAB_REVERSED_Z[NEAR0] = true`, `slabs.ts:91`) with an adaptive near plane and no far clip, so it covers a Sun-centered ±1.25 kpc cube from every camera pose — the exact move the Milky Way impostor already made off the same 10 kpc COSMO constraint.

Concrete shape, following the `volume`/`star-aggregates`/`mw-aggregate` precedent (`renderTargets.ts:190-221`, `frameProgram.ts:98-132`):

- A new render-target row `dust-volume`, `HDR_TARGET_FORMAT`, depthless, `scale: (s) => s.settings.dust.targetScale` — the exact `mw-aggregate` live-scale pattern (`renderTargets.ts:219`), default `2` (grill Q6, half-res).
- A new frame-program step `{ kind: 'render', target: 'dust-volume', slab: NEAR0 }`, ordered before `{ kind: 'render', target: 'hdr', slab: NEAR0 }` (`frameProgram.ts:132`) — the twin of `{ kind: 'render', target: 'volume', slab: COSMO }` preceding its own `hdr` step (`frameProgram.ts:98/105`).
- `dustVolumeRenderer`, a sibling of the existing scalar-volume renderer, sharing the raymarch skeleton via Prep 2's `shaders/lib` extraction (see Ground preparation) rather than forking `scalarVolume/fragment.wesl` wholesale. It accumulates per-channel RGB transmittance into `dust-volume` (not a density-times-palette LUT sum), starting from a fully-transparent-to-light clear state.

### The multiplicative fold

`milkyWayCloudRenderer.ts`'s dust pass already pins the exact blend state this fold needs — per-channel multiply, `srcFactor: 'dst', dstFactor: 'zero'` (`DUST_BLEND`, `milkyWayCloudRenderer.ts:104-107`) — and `Blend` (`src/@types/engine/frame/Blend.d.ts:29`) already carries the `'multiply'` tag, documented there against exactly this precedent. The existing upsample factories hardcode additive: `createAdditiveUpsample` (`services/gpu/passes/additiveUpsample.ts`) bakes `ADDITIVE_BLEND` into its pipeline by documented design (module header: "the blend state is load-bearing, not a default"), and its `ContentLayer` wrapper `createUpsampleLayer` hardcodes `blend: 'additive'` (`frame/passes/createUpsampleLayer.ts:19`). The dust fold is therefore a **sibling** pair, not a parameterisation of the existing ones: a `createMultiplyUpsample` GPU pass mirroring `additiveUpsample.ts`'s shape but with the `DUST_BLEND`-equivalent pipeline blend, plus its `ContentLayer` registration tagged `blend: 'multiply'`, registered in `CONTENT_LAYERS` after the star-emission layers (`star-catalog`, `milkyWayUpsampleLayer` — grill Q9: whole-fold after the star layers, so dark-nebula silhouettes read correctly against the Gaia field and the cosmological background gets the real zone-of-avoidance darkening for free). This is v1's accepted error: no per-source depth means foreground stars in front of a cloud also dim slightly; Q9's follow-up discussion judged this smallest where it matters (bright nearby stars sit in locally thin dust).

### Reddening

Per grill Q5: per-channel RGB transmittance via CCM89-style extinction ratios, `T = exp(-τ·(k_r, k_g, k_b))`, not a scalar gray fade — reddening is the visually load-bearing signature of a dark nebula (amber edges against the Gaia field), and the extra `exp()`s per march step are free. `R_V` is a tunable knob (the user overrode the recommendation to pin it at 3.1) living in the dust debug section below.

### UI (grill Q7)

Two-tier split, mirroring the Milky Way's SettingsPanel/DebugPanel split:

- **SettingsPanel** — the generic `VolumeFieldRow` (`src/components/SettingsPanel/VolumeFieldRow.tsx`) carries on/off, tier, intensity/contrast/trim/exposure/density as it does for every volume. Its palette dropdown is already conditional on `onPaletteChange` being wired (`VolumeFieldRow.tsx:214`, `{onPaletteChange && (...)}`) — the dust row's `absorptive` flag (Ground preparation) suppresses that wiring, so the meaningless-for-a-multiplicative-field palette picker simply doesn't render. No new component.
- **DebugPanel** — a dedicated `settings.dust = { rv, targetScale }` tuning section, following the `MilkyWayTuningSection` triad exactly: a declarative slider-field table (template `src/data/milkyWay/milkyWaySliderFields.ts`), a presentational section component, and a store-boundary container mounted from `DebugPanel.tsx`. `targetScale` (grill Q6) and `rv` (grill Q5) both live here, tunable live for the perf/look A/B the grill sessions deferred to a plan task.

### Registration surface (mechanical, mirrors MCPM/polyphorm at every site)

`Source.EdenhoferDust` entry → `SOURCE_REGISTRY` row (`src/data/sources.ts`, the `MCPM_ENTRY` import+union-row pattern at lines 77/144) → tiered fetcher `edenhoferDustFetcher` (mirrors `mcpmFetcher.ts`'s `Record<Tier, string>` filename table) → slot + `assetWiring.ts` demand row (mirrors the `mcpm` key at `assetWiring.ts:248-249`) → raw-data registry key (`tools/utils/io/rawDataRegistry.ts`, alongside `'mcpm.dir'` at line 261) → R2 allow-list regex (`tools/deploy/r2/allowDataFile.ts:24`, alongside the `mcpm-(small|medium|large)\.scfd` / `polyphorm-2mrs-…` rows). Per the adjacent finding below, the fetcher is a third hand-copy of the tiered-SCFD pattern, not a shared factory. The _runtime_ surface (registry row → fetcher → slot → demand row) ships with the renderer slice, not the data-pipeline PR: a live slot before the registry-routed ingest exists (Ground preparation, third joint) would upload the dust cube into the additive renderer and march it emissively.

## Fade-band choreography

Two problems, one mechanism (grill Q8):

- **Outer edge — handoff to procedural galactic dust.** The live app's Milky Way dust is still the v1 sprite pass (`milkyWayLayer`, multiplicative, NEAR0); it dies on approach via `SCALE_FADE_BANDS.milkyWayApproach` (full at 2 kpc, gone at 200 pc — `scaleFadeBands.ts`), meeting the real Gaia star catalog, which crossfades in over the same descent (`GAIA_STARS_ENTRY.crossfadePc = { inner: 8_000, outer: 25_000 }`, `src/data/sources/gaia-stars.ts:48`). The Edenhofer field wants the **inverse** band — full where Gaia is fully in (inside 8 kpc), gone by 25 kpc — so the measured local scene (Gaia stars + the dust measured from those very stars) arrives and leaves as one regime, meeting the procedural dust exactly where Gaia meets the procedural stars. No independent band invented.
- **Inner edge — no march tax at planetary zoom.** Full above ~1 pc, gone below ~0.1 pc: imperceptible at sub-parsec distance (the from-Earth dark-lane look is a separate, deferred artifact — see Non-goals) and, via `hasActiveFields`, zeroes the march entirely once the camera is inside the inner edge, so Earth-zoom frames pay nothing for it.
- **All four edges are runtime-tunable, not baked constants** — this is exactly what Prep 1 exists to enable.

**The blocker Prep 1 removes:** `deriveVolumeLiveness` (`volumeLiveness.ts:102`) multiplies `fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc)` into every field's fade opacity unconditionally — `surveyDeepZoom` is gone by 2 kpc (`scaleFadeBands.ts`), which would zero the dust cube exactly where it must be fully present. Fades must become per-field (registry-driven band choice) before the dust field can ship at all; see Ground preparation.

## Ground preparation

_(Refactor-ground checkpoint, 2026-08-19 — **SIGNED OFF 2026-08-20**, carried from `docs/backlog/2026-07-18-local-dust-volume.md`. This section is the plan-authoring gate per `plan-style.md`; a plan under this spec cannot start without it.)_

Ideal shape: one `VolumeSourceEntry` row (`edenhofer-dust`, NEAR0-rendered, `absorptive: true`), with `VolumeFieldDefaults` growing two optional fields — `absorptive?: boolean` (drives the dormant palette-slot conditional in `VolumeFieldRow.tsx:214`) and `fadeBands?: readonly FadeBand[]` (default `[surveyDeepZoom]`) — and `VolumeFieldSettings` growing `bands` seeded from it, so band edges are generically tunable via `writeVolumeField` (discharges grill Q8's "tunable" with zero dust-special code). `settings.dust = { rv, targetScale }` mirrors the `MilkyWaySettings`/`MILKY_WAY_SLIDER_FIELDS` debug-section pattern. The target row uses the live-scale precedent (`scale: (s) => s.settings.dust.targetScale`, mw-aggregate style).

Verdicts: everything is growth at existing seams **except two missing joints**:

- **Prep 1** — per-field fade bands. `volumeLiveness.ts` applies `surveyDeepZoom` unconditionally to every field; own PR, first (grill Q10).
- **Prep 2** — extract the raymarch skeleton (`intersectUnitAabb` + ray reconstruction + `sphericalEnvelope`, all inline in `scalarVolume/fragment.wesl` today) to `shaders/lib/` — a second-consumer trigger, since the dust renderer will be that second consumer. Sequenced after the volume-raymarch-acceleration work would have settled; **that effort is PARKED, PR #556 closed** — the file is free, Prep 2 is unblocked.

Growth-via-sibling (feature commits, not prep): `createMultiplyUpsample` (the additive fold factories bake their blend by documented design; `Blend` already carries `'multiply'`; `DUST_BLEND` in `milkyWayCloudRenderer.ts:104` is the pipeline precedent) and a `dustVolumeRenderer` sibling to the existing scalar-volume renderer (the shared additive pipeline bakes in a density→palette-LUT blend that a transmittance accumulator doesn't want).

Adjacent finding (default: backlog line, promotion is the user's call): the dust fetcher is the **third** hand-copied tiered-SCFD fetcher (`mcpmFetcher`, polyphorm's) — a `createTieredScfdFetcher(baseName)` factory would collapse them.

**Checkpoint rulings (2026-08-20):** (1) shape SIGNED OFF; (2) Prep 2 ships as its own tiny PR; (3) fetcher factory stays a backlog line — this PR copies the pattern a third time.

**Post-merge re-verification (2026-08-20, after #583 volume-ingest consolidation landed):** all anchors hold — `volumeLiveness.ts:102` still applies `surveyDeepZoom` unconditionally (Prep 1 unchanged); the `writeVolumeField` slice action survives (`settingsSlice.ts:322`; the deleted helper was the engine-side `writeVolumeFieldSetting`); the `VolumeFieldRow` palette-slot conditional is intact (`VolumeFieldRow.tsx:214`). The #583 refactor _improves_ the shape it lands on: `buildVolumeFieldSettings` (`volumeFieldDefaults.ts:67-78`) is now the single registry→settings seed path, so `fadeBands` → `bands` flows through one function.

**The third joint — registry-routed ingest (found 2026-08-20 re-auditing against #583):** `uploadVolumeField` hardcodes its upload destination, `state.gpu.volumeFieldRenderer` (`uploadVolumeField.ts:25`), and that renderer is single-store/single-pipeline — one field `Map` whose `draw` marches every resident field with its baked-`ADDITIVE_BLEND` pipeline (`volumeFieldRenderer.ts:186/393`). A dust cube ingested through the unmodified path would be emissively marched on the COSMO `volume` target and never reach `dustVolumeRenderer`. Flow already bypasses the one path for this class of reason (different renderer — #583's decision #14); a second bypass is the second-special-case trigger, so the joint is renderer routing _inside_ the path: the registry row's `absorptive` flag picks `dustVolumeRenderer` over `volumeFieldRenderer` in `uploadVolumeField`/`unloadVolumeField` (both renderers share the upload/unload/`hasActiveFields`/`listIds` surface). This cannot precede the sibling renderer's existence, so it is not a prep PR — it lands as an early commit of the renderer-slice PR, after which the dust slot commit is again a single `uploadVolumeField(state, store, id, cube)` call. The same commit un-hardcodes `deriveVolumeLiveness`'s renderer binding (`volumeLiveness.ts:80`): the projection is instantiated per renderer/layer-pair (additive pair on COSMO, dust pair on NEAR0), with the band choice per field via Prep 1.

## Non-goals

- **Depth-sliced compositing.** Grill Q9's physically-correct option — per-source depth so foreground stars never dim — is named as a shared follow-up the analytic Milky Way and this dust volume adopt together (one mechanism, both consumers), building it once rather than twice. Not designed here.
- **Earth-sky extinction panorama.** The crisp from-Earth dark-lane view (Great Rift, Coalsack) that a 6.5–10 pc cartesian cube can't give — its own backlog item: [`docs/backlog/2026-08-19-earth-sky-extinction-panorama.md`](../../backlog/2026-08-19-earth-sky-extinction-panorama.md).
- **Samples-based products** (the 19.5 GB 12-sample cube, the 2 kpc validation edition). Mean+std at 1.25 kpc is the shipped input (grill Q3); the authors themselves caution against trusting small-scale structure in the 2 kpc edition.
- **69 pc inner-hole fill.** Accepted empty (grill Q4); a constant-floor fill is a documented fallback, not built now.
- **`channels=2` SCFD extension** (live mean↔median blending, an uncertainty view) — stays a backlog possibility.
- **`dust-bubble` fine field** (parsec-voxel Local-Bubble crop) — only if ever independently wanted (grill Q2).
- **`createTieredScfdFetcher` factory** — stays a backlog line (grill Q10 adjacent finding, checkpoint ruling 3).

## Sequencing (grill Q1, Q10, Q11)

1. **Docs** (this spec + the grill transcript) land first, own PR — implementation is deliberately deferred below, so a bundled spec would sit stale on a branch for weeks. Same change deletes the backlog index line + `docs/backlog/2026-07-18-local-dust-volume.md` per backlog hygiene (this spec supersedes it).
2. **Prep 1** (per-field fade bands) — own PR, first in the code sequence; behavior-relevant for existing fields (MCPM, CF-4, polyphorm all key off `surveyDeepZoom` today) and deserves its own review/revert surface.
3. **Data pipeline** (`buildDustVolume.ts` + tools-side registration: raw-data registry key, R2 allow-list) — can run in parallel with Prep 1/2; touches no renderer code. The runtime registration surface (registry row, fetcher, slot, demand row) waits for step 5 — see Registration surface.
4. **Prep 2** (WESL raymarch-lib extraction) — own tiny PR, unblocked now that PR #556 (volume-raymarch-acceleration) is closed/parked.
5. **Renderer slice** (`dust-volume` target, `dustVolumeRenderer`, `createMultiplyUpsample`, registry-routed ingest as an early commit, then the runtime registration surface) — gates on the analytic Milky Way landing (grill Q1, Option B: the fold integrates once against the _final_ MW layer set, at zero calendar cost since steps 2–4 don't touch the renderer). Escape hatch: if the analytic MW slips badly, this slice can go first and the MW swap inherits the "dust fold after MW emission" invariant instead. The early-commit list also sets `FRAME_TO_WORLD['galactic']` to the real GAL→EQ rotation in `buildCubeModelMatrix.ts` (today an identity stub, `buildCubeModelMatrix.ts:66` — unexercised because no shipped cube used `'galactic'` before this dust cube), using the canonical `R_GAL_TO_EQ` rotation already computed in `superGalacticTransform.ts` (mirroring how `SG_TO_EQ_MAT4_COL_MAJOR` exports the canonical SG→EQ form for `'supergalactic-cartesian'` — `R_GAL_TO_EQ` needs the same treatment, since it's module-private today).
6. **Band/seam tuning** — last, against the shipping analytic Milky Way.

## References

- `docs/backlog/2026-07-18-local-dust-volume.md` — superseded by this spec; deleted in the same PR (git history)
- `docs/grill-sessions/edenhofer-dust-volume-2026-08-19.md` — Q1–Q11
- `docs/powers-of-ten/data.js` — the 10¹⁹ rung this completes
- Edenhofer et al. 2024, A&A 685, A82 (`10.1051/0004-6361/202347628`); Zenodo [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943), CC-BY 4.0
- `docs/backlog/2026-08-19-earth-sky-extinction-panorama.md` — the deferred from-Earth artifact
