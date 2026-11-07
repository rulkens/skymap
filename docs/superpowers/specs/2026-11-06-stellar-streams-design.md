# Stellar streams — design

**Status:** approved and built on #1074; what shipped differently is under Amendments below. Branch `feat/stellar-streams`, worktree `feat-milky-way-structures`,
written against `main` at `74751cae3` plus the spike commits. Rulings: grill transcript
`docs/grill-sessions/stellar-streams-production-2026-11-06.md` (Q1–Q10); Q11–Q13 below are recommendations
for review.

**Depends on:** the asset-demand-as-data work another session is running (the `near` data form on
`AssetWiringRow`, §3). This spec targets that shape; the plan sequences the asset row after it lands.

## Amendments (2026-11-07)

Plan Tasks 14–21 and the final review changed the design below. Where a section disagrees with this list,
this list is what shipped.

- **Haze at half resolution** (§6): the haze look draws into a half-res target and an upsample pass blends it
  in (~30 ms → ~3 ms GPU). One gate (`stellarStreamsLookLive`) holds the haze producer, the upsample, the streak
  pass and its pick together.
- **Sagittarius** (§4.2): still-bound remnant particles capped at 10 % of the 60,000 (a uniform pick made it
  56 % and the core burned white). Its focus frames `frameRadiusKpc`, the 90th-percentile reach of the debris,
  not half the 275 kpc extent; galstreams streams frame half their length.
- **Focus framing capped** (§5.6): a stream's `frameRadiusKpc` is cut (`cappedFrameRadiusKpc`) so the focus camera stays within 61 kpc of the Sun, where the out band is ≥ 0.95; Sagittarius frames 11.9 kpc (was 55.3), Orphan-Chenab 14.9 (49.1). A floor keeps the camera ≥ 9.2 kpc from the Sun (in band full-on) on the Sun side, and wins where it clashes with the cap (anchors beyond ~26 kpc).
- **Captions** (§5.5): a stream is named once its length spans 150 px, at 35–150 px like the Milky Way
  structure captions, tinted by the stream's mean particle colour (BP−RP spread ×6, saturation ×2).
- **Colours** (§4.2): each particle samples a star type (giant, turnoff, BHB) by its stream's [Fe/H] and takes
  that type's colour, stored as Gaia BP−RP and tinted with the star catalogue's `starTint`. [Fe/H] comes from a
  curated table (Harris 1996, 2010 ed.; S5, Li et al. 2022), the median where none; Sagittarius runs from
  −0.57 bound to −1.13 for old debris.
- **Meta schema** (§4.3) gained `wikipediaTitle`, `frameRadiusKpc`, `colourT`, `metallicity` (measured only),
  `stellarMass` (13 published values, `partial` shown as "≥"), `centrelineMpc` and `ribbonWidthKpc`.
  `description` is the Wikipedia extract or null. The fetcher rejects a meta without `centrelineMpc`. The meta
  is 107 KB raw, 22 KB gzipped, and still demanded at boot.
- **Card** (§5.6): length (or extent), distance, width when known, metallicity and stellar mass where present,
  and a Wikipedia link and blurb for the 6 streams with an article of their own (5 articles, summaries cached in
  `data/raw/streams/`). The Particles, Source and Licence rows were dropped.
- **Pick** (§5.4): no particle pick. Each stream's track is simplified to at most 16 centreline points (556
  segments in all; Sagittarius gets two arms derived from the snapshot), drawn as static ribbons wide enough
  to hold the track. During a stream focus only the focused stream picks.
- **Focus recedes everything else** (§2's per-stream highlight non-goal, §5.6): a stream focus dims the rest
  of the scene and the other streams, and nothing but the focused stream takes a click. Core changes behind it:
  - a selection row declaring `focusSphere` drives the recession; structures declare their ball, streams
    `RECEDE_ALL_FOCUS_SPHERE`, a sphere nothing lies inside;
  - every sphere change fades through zero (structure → structure takes 800 ms, not a snap);
  - the Milky Way disc and Sgr A* dim and leave the pick outside any focus sphere; the Zone of Avoidance
    recedes and takes no pick under any focus;
  - a focus recedes the scene only while its subject's kind is shown: both blends scale by the selecting show
    entry's fade × band, so a focused stream switched off or out of its band leaves the scene undimmed and
    clickable. Kinds no show entry selects (structures) are unaffected.
- **Deploy** (§9): the R2 sync runs from this branch before the merge, not from `main` after it
  (`tools/streams/README.md`, "Deploy order").

## 1. Intent

The spike drew 83 Milky Way stellar streams as drifting streak particles: Sagittarius from a home-made particle
spray, the rest from galstreams centre-line tracks with invented clumps, loaded by a bare `fetch` with no toggle,
fade, distance window, labels or tests. This change makes it a production Layer: real data built by a TypeScript
pipeline, the toggle/fade/band/asset machinery every Layer uses, a debug tuning section, and clickable, labelled
streams with a detail card.

## 2. Goals, non-goals

**Goals.**
- Sagittarius from the Vasiliev, Belokurov & Erkal 2021 N-body snapshot (with the LMC), subsampled to 60,000.
- The other streams from galstreams tracks: particles spread evenly along each track with the measured width;
  no invented structure.
- A demand-loaded, versioned bin plus an eagerly loaded meta sidecar, both on R2 via the manifest.
- Off by default; a "Labels & guides" toggle; a distance window; drift that wakes the loop only while visible.
- A DebugPanel section tuning both looks live.
- One label per stream, GPU picking, a detail card, palette search and `#focus=stream-<slug>` deep links.

**Non-goals.**
- Animating along real orbits or a time scrub (the drift is a direction cue, not dynamics).
- Per-stream highlight of the selected stream (needs stream-sorted ranges; backlog if wanted).
- Packing records below 40 B (ruled out in Q7).
- Streams without real distances (41 galstreams tracks are sky-only; skipped as in the spike).

## 3. Ground preparation

Produced by `refactor-ground` on 2026-11-06 (touchpoint audit + greenfield cross-check).

**Ideal diff.** `src/layers/stellarStreams/` (concern modules, ADR 0014), one entry each in
`appVisibility.ts` and `appSettingsSlices.ts`, the existing FRAME_ORDER plan + roster lines, data rows
(`rawDataRegistry`, `dataFamilies`, `ATTRIBUTIONS.md`, website data/commands/settings/debug docs rows), new
tools files.

**Verdicts.**

| Touchpoint | Verdict |
|---|---|
| Asset demand by the declared band | **Bolt-on today**: localBubble copies band edges as literals (`localBubbleAssetRows.ts:10-11`), satellites re-measures its band's `from` (`satellitesAssetRows.ts:25-27`). Missing joint: demand as Layer data. **Owned by the asset-demand session**; streams consume its `near` form. |
| Planner awake by fade | Growth: `fade` + `hasDistanceBand` (`satellites/frame.ts:24-32`). |
| FRAME_ORDER, picking, screen labels | Growth: plan + roster lines exist; `pickProgram` derives from FRAME_ORDER; labels register via `guides()`. |
| Selection kind | Growth since #1064: `Layer.selection` kinds + `deps.pickCode`. No core table. |
| Toggle, `layers=` link | Growth: toggle row; `layers=` walks `APP_VISIBILITY_REGISTRY`. |
| Settings + debug section | Growth: slice + `debug` ui row; composition entry; settings fixture line (tsc-forced). |
| Data pipeline | Growth: registry rows; `dataFamilies` row (offline inventory follows). |
| Galactic → equatorial rotation | Growth: new `tools/utils/math/galToEq.ts` over `GAL_TO_EQ_MATRIX` (`src/data/superGalacticTransform.ts:68-82`). |

**Greenfield cross-check.** No compatibility tension (new format, nothing deployed). Adopted: an eager meta
sidecar so search and deep links work before the bin loads; slugs as the stable id, the dense stream index only
on the wire and in the pick word; a `streamCount` header checked against the sidecar. Not adopted: the 24 B
packed record (Q7).

**Prep in this branch:** none. Adjacent findings go to the backlog in the spec commit (§11).

## 4. Data

### 4.1 Raw inputs (`data/raw/`, registry keys, provenance READMEs + `.sha256`)

| Key | Content | Fetcher |
|---|---|---|
| `vasiliev2021.stars` | `Sgr_snapshot/stars.txt` (+ `readme.txt`) from Zenodo record 4300977, CC-BY 4.0 | `tools/fetch/fetchVasiliev2021.ts` (downloads the 43.6 MB zip, extracts the two files) |
| `galstreams.dir` | `galstreams/tracks/*.ecsv` and `galstreams/lib/master_log.txt` from `cmateu/galstreams` at a pinned commit, BSD-3 | `tools/fetch/fetchGalstreams.ts` (GitHub tarball of the pinned sha) |

### 4.2 Build (`npm run build-stellar-streams`, then `build-data-manifest`)

`tools/streams/buildStellarStreams.ts` replaces the Python file (deleted with its README rewritten).

- **Sagittarius.** Seeded uniform subsample of `stars.txt` to `SGR_PARTICLE_BUDGET = 60_000`. Position from
  `ra, dec, distance` via `raDecDistToEqCart`. Tangent = `normalize(galToEq([vx, vy, vz]))` (the snapshot's
  galactocentric axes are galactic axes). Brightness from density only (equal-mass particles); colour from a
  sampled star mix at the [Fe/H] of each star's `Tstrip` (X8FX, amends Q3). Size from a per-source range.
- **galstreams.** One track per stream: the master log's `On` track, else any track with real distances;
  skip placeholder-distance tracks, non-`st` kinds and galstreams' own Sagittarius. Orient each track to its
  proper motions (rv 0 where missing). Particles evenly along the track with Gaussian cross-track scatter of
  the measured `width_phi2` (default 0.3°), count `clip(L·60·max(1, w/0.3), 300, 30000)`; end fade over the
  last eighth; per-particle brightness jitter; colour from a sampled star mix at the stream's [Fe/H] (X8FX,
  amends Q3); **no along-track waves** (Q2).
- Stream order: Sagittarius first, then by slug, so ids are stable across rebuilds; particles emitted per stream.
- Deterministic: one seeded RNG; a rebuild over the same raw files is byte-identical.

### 4.3 Formats (`public/data/stellar-streams/v1/`, one `dataFamilies` row for both files)

**`stellar-streams.bin`** — little-endian, magic + version per DATA.md:

```
0   u32  magic        "STRM"
4   u32  version      1
8   u32  particleCount
12  u32  streamCount
16  particles: particleCount × 40 B
      f32×3 position (heliocentric equatorial, Mpc) · f32×3 unit tangent ·
      f32 size (Mpc) · f32 luminosity · f32 colour t [0,1] · f32 stream index
```

Encode/decode live in the Layer (`catalog/utils/`), constants in `catalog/data/*.constants.ts`; the builder
imports the encoder (the satellites precedent). A version or magic mismatch rejects with a "regenerate via
`npm run build-stellar-streams`" error.

**`stellar_streams_meta.json`** — `writeMetaSidecar` shape, array position = stream index:

```ts
type StellarStreamMetaEntry = {
  id: string; // slug, e.g. 'gd-1', 'sagittarius'; the URL id
  names: string[];
  description: string;
  source: 'vasiliev2021' | 'galstreams';
  reference: string; // e.g. 'Vasiliev, Belokurov & Erkal 2021' or the galstreams track ref
  lengthKpc: number;
  distanceKpc: readonly [min: number, max: number];
  widthDeg: number | null; // null for the N-body stream
  particleCount: number;
  anchorMpc: readonly [number, number, number]; // label + focus point
};
```

The fetcher of the bin fails loudly when `meta.length !== streamCount` (the `structureCatalogFetcher` precedent).

## 5. The Layer (`src/layers/stellarStreams/`, ADR 0014)

```
layer.ts create.ts destroy.ts frame.ts visibility.ts
@types/      StellarStreamsRuntime, StellarStreamsSettings
state/       stellarStreams/ (slice, initialState, selectors), slices.ts
catalog/     load/ (bin fetcher + slot, meta fetcher + slot, asset rows), utils/ (codec), data/, @types/
streaks/     render/ (renderer, pick pipeline), passes/, data/ (default looks), ui/ (tuning section), @types/
labels/      present/ (screen-label producer)
selection/   kinds.ts, row, present/, ui/ (Detail + Compact cards), @types/ (ref, row, target)
search/      present/ (palette rows from the meta)
```

Shaders stay in `src/services/gpu/shaders/stellarStreams/` (streak + pick).

### 5.1 Settings (`settings.stellarStreams`)

```ts
type StellarStreamsSettings = {
  enabled: boolean; // false at boot (Q6)
  labelEnabled: boolean; // true
  streak: StellarStreamsLook;
  haze: StellarStreamsLook;
};
type StellarStreamsLook = { intensity: number; sizeScale: number; stretch: number; minPx: number; flow: number };
```

Defaults are today's `STELLAR_STREAMS_LOOKS`. `window.__streamLooks` goes.

### 5.2 Visibility (`visibility.ts`)

```ts
{
  key: 'stellarStreams',
  selects: ['stellarStream'],
  bands: {
    streams: {
      in: [4 * KPC, NEIGHBOURHOOD_RECEDE_KPC * KPC],
      out: [MILKY_WAY_RADIUS_MPC * 2, FOREGROUND_MAX_DISTANCE_MPC],
    },
  },
},
{ label: 'stellarStream', cluster: 'stellarStreams', of: 'stellarStreams' },
```

The UI row: `{ slot: 'labelsAndGuides', content: { toggle: 'stellarStreams', label: 'Stellar streams' } }`.

### 5.3 Assets

- **Bin:** `near: { band: 'streams', lead: 1.2, release: 2 }` on the `stellarStreams` show entry (the
  asset-demand session's shape; field names follow whatever lands). `gates: 'stellarStreams'`.
- **Meta:** always demanded (≈20 KB); search, labels' text and deep links read it before the bin arrives.
- Priority: the next free rung after satellites.

### 5.4 Frame

- **Planner** (`frame.ts`): `fade: 'stellarStreams'`, `hasDistanceBand: true`;
  `awake = fade > 0 && binLoaded && (streak.flow > 0 || haze.flow > 0)`; `loading = false`
  (`gates` already fades the streams in on commit, so a cold load never needs the gate to wait, and a
  `loading` vote could only fire in the release window, forcing a needless wake).
- **Pass** (`streaks/passes/`): NEAR0 after `local-bubble` (existing roster line). Core hands `fade`; the draw
  multiplies it into both looks' intensity and reads the looks from settings. Time wraps on a multiple of the
  8 s drift loop, as in the spike.
- **Pick:** `drawPick` with a pick pipeline that reuses the streak vertex stage, draws the sharp look only, widens
  each streak to at least `PICK_PADDING_PX` across, and writes `packSelection(pickCode('stream'), index + 1)`
  from the record's stream index. `pickEnabled` = the pass's own gate.

### 5.5 Labels (Q11, recommended)

One `Label2D` per stream on NEAR0 at `anchorMpc` (track midpoint by length; Sagittarius at the remnant),
camera-relative `worldPos` (`ctx.drawCamPos`, the structure-labels pattern), `fadeAlpha` = the handed label fade,
`prominencePx` = the stream's apparent length so the declutter keeps long streams, `pickId` = the stream's pick
word and `subjectId` set (clickable captions, no new resolve code). Ids `stream:<slug>`; text fixed per id.

### 5.6 Selection (post-#1064)

- **Ref:** `{ type: 'stellarStream'; slug: string }`. Focus id `stream-<slug>`.
- **Row:** the meta entry plus `positionMpc = anchorMpc`; resolves from the meta alone, so a deep link works
  with the bin unloaded.
- **Facts** (`selection/kinds.ts`): a `focus` preset framing the stream's length, `mayHaveLabel: () => true`,
  `displayName` = the name.
- **Card (Q12, recommended):** headline name; kind line ("Stellar stream" or "Dwarf-galaxy debris, N-body
  model" for Sagittarius); length, distance range, width; particles drawn; source line with the reference and
  licence. Compact card: name + kind line + distance range.
- **Search:** one palette row per stream from the meta (`LayerSearchEntry`, id claimed by the row's focus id).

### 5.7 Debug section

`streaks/ui/StellarStreamsTuningSectionContainer.tsx` in the `debug` slot: both looks' five knobs as sliders
(ranges in `streaks/data/`), plus a reset. Website `DOCS_DEBUG_SECTIONS` and `DOCS_SETTINGS` rows (test-forced).

## 6. Perf (Q13, recommended)

~127k instances × 2 draws × 4 vertices, two `worldToClip` per vertex, additive capsule-Gaussian fragments. The
spike's 115k ran smoothly at the oblique pose; the haze draw's large sprites are the fill-rate risk. The plan
prices it with `npm run perf` at the oblique and M54 poses, before (streams off) and after; the hard rule is
**zero cost when hidden** (pass and planner gated on fade; bin not loaded off-band or when switched off).

## 7. Error handling

- Bin fetch or decode failure: the slot lands in `error`; no draw, no wake; console names the regenerate command.
- Meta missing: no labels, search or cards; the bin still draws (index-only).
- `streamCount` mismatch: reject the pair (never mislabel).

## 8. Testing (per testing.md: only what can break unnoticed)

- Codec round-trip; stale magic/version rejected.
- `galToEq`: the galactic centre direction maps to RA 266.40°, Dec −28.94°.
- Builder: Sgr subsample count and determinism; tangent is the rotated velocity; a galstreams track listed
  against its motion is flipped; luminosity carries no along-track waves (only the end fade varies with phase);
  meta length equals the bin's stream count; stream order stable.
- Planner: no wake at fade 0, with flow 0, or before the bin loads.
- Visibility: band values at 2 kpc (0), 20 kpc (1), past the foreground gate (0).
- Selection row: `resolvePick` ↔ `encodePick` round-trip; a deep-link ref resolves with the bin unloaded.
- Labels: one per stream, `pickId` equals `encodePick`.
- Layer: the pass sits on a FRAME_ORDER line (structure's layer test pattern).

## 9. Deploy and docs

`dataFamilies` row; `ATTRIBUTIONS.md` entries for Vasiliev+2021 (CC-BY 4.0) and galstreams (BSD-3); website data
page entry; `DATA.md` format row, layout line and refresh-order row; `package.json` `fetch-vasiliev2021`,
`fetch-galstreams`, `build-stellar-streams` with website `DOCS_COMMANDS` rows. R2 sync is the owner's step from
the main worktree.

## 10. Risks

- **The asset-demand dependency.** If its shape changes, only `catalog/load/` changes. Until it lands the plan
  holds the asset-row task.
- **Haze fill rate** at close poses (big additive sprites): priced in the perf step; the `minPx` and `sizeScale`
  knobs are the levers.
- **galstreams churn:** pinned commit; a bump is a deliberate rebuild.

## 11. Adjacent findings (to the backlog in this spec's commit)

- `tools/site/matteHiddenPasses.ts` is a hand list with no coverage test.
- Website docs tables need hand rows per debug section, settings leaf, script and toggle; the `ui` entries carry
  no docs metadata.
- `appSettingsSlices` drift is untested, and `sourceRegistryCoverage.test.ts:4-5` claims otherwise.
- Asset `priority` rungs are hand-picked with no distinctness test.
