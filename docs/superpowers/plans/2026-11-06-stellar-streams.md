# Stellar Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task, under the lean protocol in
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the stellar-streams spike into a production Layer: Vasiliev+2021 Sagittarius plus galstreams
tracks built by a TypeScript pipeline, the standard toggle/fade/band/asset machinery, a debug tuning section,
and labelled, clickable streams with a detail card.

**Architecture:** Offline: two fetchers pull raw files into `data/raw/`, one TS builder writes a versioned
`stellar-streams.bin` (40 B particle records) and a `stellar_streams_meta.json` sidecar. Runtime: the
`stellarStreams` Layer (ADR 0014 concern modules) loads the meta eagerly and the bin on demand, draws two
additive streak looks on NEAR0, picks on the sharp look, labels each stream and declares a `stellarStream`
selection kind (post-#1064, no core tables).

**Tech Stack:** TypeScript, WebGPU + WESL, Redux Toolkit slices, React (debug section, cards), Vitest, tsx
tools.

**Spec:** `docs/superpowers/specs/2026-11-06-stellar-streams-design.md`

## Global Constraints

- Branch `feat/stellar-streams`, worktree `.claude/worktrees/feat-milky-way-structures`. Never rebase,
  never push unless the controller says so.
- Layer layout per ADR 0014: root files + `state/` + `@types/` (contract types only) + concern modules
  `catalog/`, `streaks/`, `labels/`, `selection/`, `search/`; role folders only inside modules. The
  folder-shape ratchet (`tests/conventions/layerFolderShape.test.ts`) must stay green.
- Core files import nothing from `src/layers` (ADR 0013; `tests/conventions/layerImportBoundary.test.ts`).
- One symbol per file in `utils/` and `@types/`; constants files take the `.constants.ts` suffix; `type`
  aliases, never `interface`.
- Shaders live in `src/services/gpu/shaders/stellarStreams/`; WGSL struct layout and TS writers agree byte for
  byte.
- Moving files: `npm run move-files -- <from> <to>` (it rewrites `?static` imports too), never `git mv`.
- Comments: why, not what; module header ≤ 10 lines, comment lines ≤ half the code lines.
- Sagittarius budget `SGR_PARTICLE_BUDGET = 60_000`; seeded RNG; rebuilds are byte-identical.
- Visibility band `streams`: `in: [4 kpc, NEIGHBOURHOOD_RECEDE_KPC kpc]`,
  `out: [MILKY_WAY_RADIUS_MPC * 2, FOREGROUND_MAX_DISTANCE_MPC]`. Off by default.
- Attribution: Vasiliev, Belokurov & Erkal 2021, MNRAS 501, 2279, Zenodo 4300977, CC-BY 4.0; galstreams
  (Mateu 2023), `cmateu/galstreams`, BSD-3-Clause.

## Review Focus

1. **Deep link from far away with streams off** (`#focus=stream-gd-1` at the Earth boot view): the meta is
   loaded, the row resolves without the bin, the reveal saga switches the section on via `selects`, the camera
   flies there. Pinned in Task 10.
2. **Switched on but near the Sun** (inside 4 kpc): nothing drawn, no wake, `loading` false. Pinned in Task 7.
3. **Both looks' `flow` set to 0 in the debug section:** the loop goes back to sleep. Pinned in Task 7.
4. **A bin and meta from two different builds** (cached one, fresh other): rejected, never mislabelled.
   Pinned in Task 6.
5. **Faint haze over empty-looking sky takes a click:** only the sharp look stamps pick ids. Pinned in Task 9.

---

### Task 1: Raw data fetchers, registry, provenance and attributions

**Files:**
- Create: `tools/fetch/fetchVasiliev2021.ts`, `tools/fetch/fetchGalstreams.ts`,
  `data/raw/vasiliev2021/README.md`, `data/raw/galstreams/README.md` (+ `.sha256` sidecars written by the
  fetchers)
- Modify: `tools/utils/io/rawDataRegistry.ts`, `package.json` (`fetch-vasiliev2021`, `fetch-galstreams`),
  `ATTRIBUTIONS.md`, `packages/website/src/data/docsCommands.ts`, `packages/website/src/data/dataFamilies.ts`

**Interfaces:**
- Produces registry keys: `vasiliev2021.stars` (file: `data/raw/vasiliev2021/stars.txt`),
  `vasiliev2021.readme` (file), `galstreams.dir` (directory: `data/raw/galstreams/` holding `tracks/*.ecsv`
  and `lib/master_log.txt`).

Read `docs/DATA.md` "Adding a new raw data source" first; model the fetchers on `tools/fetch/fetchLocalBubble.ts`.

- [ ] `fetchVasiliev2021`: download `https://zenodo.org/records/4300977/files/Sgr_stream_simulations.zip`
  (43.6 MB), extract only `Sgr_snapshot/stars.txt` and `Sgr_snapshot/readme.txt` into
  `data/raw/vasiliev2021/`, write `.sha256` sidecars; skip when present and the checksum matches.
- [ ] `fetchGalstreams`: download the GitHub tarball of `cmateu/galstreams` at a pinned commit sha (a named
  constant in the fetcher, chosen at implementation time from `main`), extract `galstreams/tracks/` and
  `galstreams/lib/master_log.txt` into `data/raw/galstreams/`; one `.sha256` for the tarball.
- [ ] Registry rows (`kind`, `source: 'gitignored'`, `description`, `upstream`, `fetcher`, `readme`).
- [ ] READMEs: upstream URL, licence, columns (stars.txt: `x y z vx vy vz ra dec distance pmra pmdec vlos
  Lambda Beta Zeta Tstrip mass`; galactocentric axes with the Sun at x = −8 kpc), fetch date, checksum.
- [ ] `ATTRIBUTIONS.md` entries for both (the `attributionCoverage` test forces them), and the website
  data-page row it then requires (`dataPages.test.ts`).
- [ ] `DOCS_COMMANDS` rows for the two scripts (`docsProject.test.ts:32-33`).
- [ ] No new unit test: fetchers are I/O; the coverage tests above guard the rows.
- [ ] Commit.

### Task 2: The bin format codec

review: yes

**Files:**
- Create: `src/layers/stellarStreams/catalog/data/stellarStreamsFormat.constants.ts`,
  `src/layers/stellarStreams/catalog/utils/encodeStellarStreams.ts`,
  `src/layers/stellarStreams/catalog/utils/decodeStellarStreams.ts`,
  `src/layers/stellarStreams/catalog/@types/StellarStreamsPayload.d.ts`
- Test: `tests/layers/stellarStreams/catalog/utils/stellarStreamsCodec.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StellarStreamsPayload = {
    readonly particleCount: number;
    readonly streamCount: number;
    readonly records: Float32Array; // particleCount × STELLAR_STREAMS_RECORD_F32, GPU-ready
  };
  export function encodeStellarStreams(p: StellarStreamsPayload): ArrayBuffer;
  export function decodeStellarStreams(buf: ArrayBuffer): StellarStreamsPayload; // zero-copy view
  // constants: STELLAR_STREAMS_MAGIC = 0x4d525453 ("STRM"), STELLAR_STREAMS_VERSION = 1,
  // STELLAR_STREAMS_HEADER_BYTES = 16, STELLAR_STREAMS_RECORD_F32 = 10
  ```

Layout (little-endian), header comment spelled out in full (byte-layout contract):

| Offset | Size | Field |
|---|---|---|
| 0 | u32 | magic `"STRM"` |
| 4 | u32 | version = 1 |
| 8 | u32 | particleCount |
| 12 | u32 | streamCount |
| 16 + 40·i | f32×3 | position, heliocentric equatorial, Mpc |
| +12 | f32×3 | unit motion tangent |
| +24 | f32 | size, Mpc |
| +28 | f32 | luminosity |
| +32 | f32 | colour t ∈ [0, 1] |
| +36 | f32 | stream index (integer-valued) |

- [ ] Tests:
  - `round-trips a payload byte for byte` (encode → decode → same `records`, counts).
  - `rejects a wrong magic with a regenerate message` (message contains `npm run build-stellar-streams`).
  - `rejects another version with a regenerate message`.
  - `rejects a byte length that disagrees with particleCount`.
- [ ] Implement; the renderer's attribute offsets (spike `streaks/render/stellarStreamsRenderer.ts:53-60`)
  already match this record.
- [ ] Commit.

### Task 3: Sagittarius particles from the Vasiliev snapshot

**Files:**
- Create: `tools/utils/math/galToEq.ts`, `tools/streams/utils/readVasilievStars.ts`,
  `tools/streams/utils/sagittariusParticles.ts`, `tools/streams/@types/StreamParticles.ts`,
  `tools/streams/data/streamsBuild.constants.ts`
- Test: `tests/tools/utils/math/galToEq.test.ts`, `tests/tools/streams/utils/sagittariusParticles.test.ts`

**Interfaces:**
- Consumes: `GAL_TO_EQ_MATRIX` (`src/data/superGalacticTransform.ts:68-82`), `applyMat3`
  (`tools/utils/math/applyMat3.ts`, mirror `tools/utils/math/sgToEq.ts:7-10`), `raDecDistToEqCart`
  (`src/utils/math/raDecDistToEqCart.ts`, RA in **hours**), `splitmix64` (`tools/utils/random/`).
- Produces:
  ```ts
  export function galToEq(v: Readonly<Vec3>): Vec3;
  export type StreamParticles = {
    readonly positionsMpc: Float32Array; // n × 3
    readonly tangents: Float32Array; // n × 3, unit
    readonly sizeMpc: Float32Array;
    readonly luminosity: Float32Array;
    readonly colourT: Float32Array;
  };
  export function sagittariusParticles(rows: readonly VasilievStar[], seed: bigint): StreamParticles;
  ```
  `VasilievStar = { x, y, z, vx, vy, vz, ra, dec, distanceKpc, tStripGyr }` (other columns ignored), in
  `tools/streams/@types/VasilievStar.ts`.

Rules: seeded uniform pick of `SGR_PARTICLE_BUDGET = 60_000` rows; position from `ra/dec/distance`
(`raHours = ra / 15`, kpc → Mpc); tangent `normalize(galToEq([vx, vy, vz]))` (the snapshot's axes are galactic:
x towards the GC from the Sun, y towards l = 90°, z to the NGP); luminosity uniform jitter in [0.5, 1] × a
constant, **no age boost**; colour t = `clamp01(1 + tStrip / SGR_OLDEST_STRIP_GYR) · 0.8 + U(0, 0.2)` so bound
(`tStrip = 0`) and recent debris lean orange (t → 1) and old debris blue; size from a per-source range constant.

- [ ] Tests:
  - `galToEq maps the galactic centre direction to RA 266.40°, Dec −28.94°` (to 0.01°).
  - `galToEq keeps vectors unit length`.
  - `subsamples to the budget, deterministically for one seed` (same seed → identical arrays; other seed →
    different).
  - `the tangent is the rotated galactocentric velocity` (one hand-made row, expected vector from `galToEq`).
  - `bound particles lean orange and the oldest lean blue` (colour t of `tStrip = 0` > that of the oldest).
  - `luminosity carries no stripping-time trend` (mean over young vs old halves within 5%).
- [ ] Commit.

### Task 4: galstreams particles, meta sidecar and the build command

review: yes

**Files:**
- Create: `tools/streams/buildStellarStreams.ts` (CLI), `tools/streams/utils/readGalstreamsTracks.ts`,
  `tools/streams/utils/pickStreamTracks.ts`, `tools/streams/utils/orientTrackByMotion.ts`,
  `tools/streams/utils/trackParticles.ts`, `tools/streams/utils/streamMetaEntry.ts`,
  `tools/streams/@types/GalstreamsTrack.ts`, `tools/streams/@types/StellarStreamMetaEntry.ts`
- Modify: `tools/streams/README.md` (rewrite for the TS pipeline), `package.json`
  (`build-stellar-streams`: `tsx tools/streams/buildStellarStreams.ts && npm run build-data-manifest`),
  `packages/website/src/data/docsCommands.ts`, `tools/deploy/r2/dataFamilies.ts`, `docs/DATA.md`
- Delete: `tools/streams/buildStellarStreams.py`
- Test: `tests/tools/streams/utils/pickStreamTracks.test.ts`, `orientTrackByMotion.test.ts`,
  `trackParticles.test.ts`, `tests/tools/streams/buildStellarStreams.test.ts`

**Interfaces:**
- Consumes: Task 2's `encodeStellarStreams` + constants, Task 3's `sagittariusParticles`, `galToEq`,
  `writeMetaSidecar` (`tools/curation/writeMetaSidecar.ts`), registry keys from Task 1.
- Produces: `public/data/stellar-streams/v1/stellar-streams.bin` and
  `public/data/stellar-streams/v1/stellar_streams_meta.json`;
  ```ts
  export type StellarStreamMetaEntry = {
    id: string; // slug: lowercase, non-alphanumerics → '-', e.g. 'gd-1', 'sagittarius'
    names: string[];
    description: string;
    source: 'vasiliev2021' | 'galstreams';
    reference: string;
    lengthKpc: number;
    distanceKpc: readonly [number, number];
    widthDeg: number | null;
    particleCount: number;
    anchorMpc: readonly [number, number, number];
  };
  ```
  The runtime mirror of this type lands in Task 6 (`catalog/@types/StellarStreamMeta.d.ts`) with the same
  fields.

Rules (from the spike's Python, `tools/streams/buildStellarStreams.py:118-228`, minus the clumps):
- Track pick: per stream name, the master log's `On` track (`master_log.txt` columns: Imp, On, TrackName,
  Name, …, `width_phi2` at index 8), else any track; skip tracks whose distances are all ≈ 1.0 (sky-only),
  kinds other than `st`, and galstreams' own Sagittarius.
- Orientation: flip the track when its proper-motion-implied direction runs against track order (rv 0 when
  missing).
- Particles: count `clip(L·60·max(1, w/0.3), 300, 30000)` (L kpc, w the width in kpc from `width_phi2`, default
  0.3°, floor 0.03 kpc); even along the track; Gaussian cross-track scatter σ = w; end fade
  `clip(min(phase, 1 − phase)·8, 0, 1)`; luminosity = end fade × U(0.5, 1) × constant; colour t = U(0, 0.6);
  size `clip(0.8·w, 0.05, 0.3)` kpc. **No along-track waves.**
- Order: Sagittarius is stream 0, the rest sorted by slug; particles emitted stream by stream.
- Meta: one entry per stream in index order; `anchorMpc` = the track's midpoint by length (Sagittarius: the
  bound particles' mean position); description one sentence naming the source.
- `dataFamilies` row like `local-bubble` (`dataFamilies.ts:66-73`) matching
  `/^(?:stellar-streams\.bin|stellar_streams_meta\.json)$/`.
- `DATA.md`: format table row (`STRM`, `0x4D525453`, v1), `public/data` layout line, refresh-order row.

- [ ] Tests:
  - `pickStreamTracks prefers the On track and skips sky-only, non-st and Sagittarius tracks`.
  - `orientTrackByMotion flips a track listed against its proper motion` and `keeps one listed along it`.
  - `trackParticles spreads particles evenly with only the end fade varying luminosity along the track`
    (binned mean luminosity flat within 10% over the middle 3/4).
  - `trackParticles count follows L·60·max(1, w/0.3), clipped to [300, 30000]`.
  - `the build writes a stream count equal to the meta length, Sagittarius first, slugs sorted after`
    (run the builder's core over fixture inputs, no network).
  - `a rebuild over the same inputs is byte-identical`.
- [ ] Run `npm run fetch-vasiliev2021 && npm run fetch-galstreams && npm run build-stellar-streams` locally;
  report particle and stream counts and the bin size (expect ~127k, ~83, ~5.1 MB). The worktree's
  `public/data` is a symlink to main's: the files land there, and `build-data-manifest` skips a symlinked
  tree (identity paths in dev, as intended).
- [ ] Commit.

### Task 5: Settings, visibility and the toggle

**Files:**
- Create: `src/layers/stellarStreams/@types/StellarStreamsSettings.d.ts`,
  `src/layers/stellarStreams/streaks/@types/StellarStreamsLook.d.ts` (exists; keep),
  `src/layers/stellarStreams/state/stellarStreams/{initialState,slice,selectors}.ts`,
  `src/layers/stellarStreams/state/slices.ts`, `src/layers/stellarStreams/visibility.ts`
- Modify: `src/layers/stellarStreams/layer.ts`, `src/compositions/appSettingsSlices.ts`,
  `src/compositions/appVisibility.ts`, `tests/state/settings/makeSettingsFixture.ts`,
  `packages/website/src/data/docsSettings.ts` (or a `NOT_IN_PANEL` regex for the look knobs, see
  `tests/packages/website/docsReference.test.ts:100,119-131`), the website labels-and-guides doc row
  (`docsReference.test.ts:150-154`)
- Test: `tests/layers/stellarStreams/visibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StellarStreamsSettings = {
    enabled: boolean; // false
    labelEnabled: boolean; // true
    streak: StellarStreamsLook;
    haze: StellarStreamsLook;
  };
  // slice 'settings/stellarStreams', reducerPath 'stellarStreams'; actions:
  setStellarStreamsEnabled(boolean), setStellarStreamsLabelEnabled(boolean),
  setStellarStreamsLook({ look: 'streak' | 'haze'; patch: Partial<StellarStreamsLook> }),
  resetStellarStreamsLooks()
  // selectors: selectRoute / selectStellarStreams (localBubble's selectors.ts shape)
  ```
  Defaults: `streak = { intensity: 0.09, sizeScale: 0.28, stretch: 5, minPx: 0.8, flow: 4 }`,
  `haze = { intensity: 0.005, sizeScale: 1.4, stretch: 0.5, minPx: 1.5, flow: 0 }` (today's
  `streaks/data/stellarStreamsLooks.ts`, which becomes the initial-state source).
- Visibility entries exactly as spec §5.2 (`key: 'stellarStreams'`, `selects: ['stellarStream']`, band
  `streams`; label entry `{ label: 'stellarStream', cluster: 'stellarStreams', of: 'stellarStreams' }`).
- UI row: `{ slot: 'labelsAndGuides', content: { toggle: 'stellarStreams', label: 'Stellar streams' } }`.

- [ ] Tests (`visibility.test.ts`, via `bandValueOf`):
  - `the streams band is 0 at 2 kpc, 1 at 20 kpc and 0 past the foreground gate`.
  - `the show entry selects the stellarStream kind` (the reveal saga's hook).
- [ ] No reducer tests (plain setters); the composition identity test (`appVisibility.test.ts:78-86`) covers
  the registry entry.
- [ ] Commit.

### Task 6: Loading the bin and the meta

**Files:**
- Create: `src/layers/stellarStreams/catalog/utils/streamPairMismatch.ts`,
  `src/layers/stellarStreams/catalog/load/stellarStreamsFetcher.ts`,
  `catalog/load/stellarStreamsSlot.ts`, `catalog/load/stellarStreamsMetaFetcher.ts`,
  `catalog/load/stellarStreamsMetaSlot.ts`, `catalog/load/stellarStreamsAssetRows.ts`,
  `catalog/@types/StellarStreamMeta.d.ts`, `catalog/@types/StellarStreamsAssetKey.d.ts`
- Modify: `src/layers/stellarStreams/create.ts`, `destroy.ts`, `layer.ts`,
  `@types/StellarStreamsRuntime.d.ts`, `streaks/render/stellarStreamsRenderer.ts` (`upload` takes the
  payload; add `clear()` for release)
- Test: `tests/layers/stellarStreams/catalog/load/stellarStreamsFetcher.test.ts`

**Interfaces:**
- Consumes: Task 2 decode; `createAssetSlot`, `Fetcher`, `dataUrl` + `fetchWithProgress`.
- Produces:
  ```ts
  export type StellarStreamsRuntime = {
    readonly renderer: StellarStreamsRenderer;
    readonly slot: AssetSlot<StellarStreamsPayload, void>;
    readonly metaSlot: AssetSlot<readonly StellarStreamMeta[], void>;
    readonly meta: () => readonly StellarStreamMeta[] | null; // the committed meta, or null
  };
  ```
- The two slots load independently (the meta must not wait for the bin, the bin must still draw if the meta
  fails). One pure check, `catalog/utils/streamPairMismatch.ts`
  `(binStreamCount: number, metaLength: number) => string | null`, runs in **whichever fetcher finishes
  second**: the bin fetcher checks against the committed meta if there is one, the meta fetcher against the
  loaded bin if there is one; a mismatch rejects that fetch with `length mismatch … regenerate via
  "npm run build-stellar-streams"` (the message `structureCatalogFetcher.ts` uses).
- Asset rows: `stellarStreamsMeta` with `demand: () => true` (≈20 KB, wanted early); `stellarStreams` (the bin)
  with **interim** `demand: (ctx) => ctx.settings.stellarStreams.enabled`, `release` = switched off,
  `gates: 'stellarStreams'`, priority the next free rung after satellites (84). Task 12 replaces the interim
  demand with the `near` form.
- Delete the spike's direct `fetch` in `create.ts`.

- [ ] Tests:
  - `rejects a bin whose stream count disagrees with the committed meta` (Review Focus 4).
  - `rejects a meta whose length disagrees with the loaded bin`.
  - `accepts a bin with no meta yet` (it draws index-only).
- [ ] Commit.

### Task 7: Streaks driven by settings, fade and the visible-only wake

review: yes

**Files:**
- Modify: `src/layers/stellarStreams/frame.ts`, `streaks/passes/stellarStreamsPass.ts`,
  `streaks/render/stellarStreamsRenderer.ts`, `streaks/@types/StellarStreamsRenderer.d.ts`
- Delete: the `window.__streamLooks` read; `streaks/data/stellarStreamsLooks.ts` moves into Task 5's
  initial state (or stays as its source; no second copy)
- Test: `tests/layers/stellarStreams/frame.test.ts`, `tests/layers/stellarStreams/layer.test.ts`

**Interfaces:**
- Pass: `ContentPass<'stellarStreams'>` with `fade: 'stellarStreams'`; `enabled` = renderer has data;
  `draw(pass, view, ctx, state, fade)` multiplies `fade` into each look's `intensity` and reads both looks from
  `state.settings.stellarStreams`.
- Planner: `fade: 'stellarStreams'`, `hasDistanceBand: true` (pattern `src/layers/satellites/frame.ts:24-32`):
  ```ts
  awake = fade > 0 && renderer.hasData() && (streak.flow > 0 || haze.flow > 0);
  loading = fade > 0 && !renderer.hasData();
  settling = false;
  ```
- The uniform block layout is unchanged (spike renderer `:88-96`: camera prefix, eye at f32 20,
  intensity 23, sizeScale 24, stretch 25, minPx 26, timeSec 27, flow 28); name those offsets as constants.

- [ ] Tests (`frame.test.ts`):
  - `does not wake at fade 0` (Review Focus 2).
  - `does not wake when both looks' flow are 0` (Review Focus 3).
  - `does not wake before the bin loads, and reports loading only while visible`.
  - `wakes while visible with data and a drifting look`.
- [ ] `layer.test.ts`: `the Layer's pass sits on a FRAME_ORDER line` (pattern
  `tests/layers/structure/layer.test.ts:75`).
- [ ] Commit.

### Task 8: The debug tuning section

**Files:**
- Create: `src/layers/stellarStreams/streaks/ui/StellarStreamsTuningSectionContainer.tsx`,
  `streaks/data/stellarStreamsLookRanges.constants.ts`
- Modify: `src/layers/stellarStreams/layer.ts` (`{ slot: 'debug', content: StellarStreamsTuningSectionContainer }`),
  `packages/website/src/data/docsDebugSections.ts`
- Test: `tests/layers/stellarStreams/streaks/ui/StellarStreamsTuningSectionContainer.test.tsx`

Read `docs/superpowers/conventions/ui-ux.md` first; mirror
`src/layers/localBubble/shell/ui/LocalBubbleTuningSectionContainer.tsx` (store-reaching files stay in `ui/`).

**Interfaces:**
- Ranges (min, max, step) per knob, one table for both looks: intensity [0, 0.3, 0.001], sizeScale [0.05, 3,
  0.01], stretch [0, 10, 0.1], minPx [0.25, 4, 0.05], flow [0, 12, 0.5].
- Two groups, "Streaks" and "Haze", five sliders each, plus "Reset looks" dispatching
  `resetStellarStreamsLooks()`. The heading text must appear in the component (`docsProject.test.ts:50-58`).

- [ ] Test: `a slider change dispatches setStellarStreamsLook for its look and knob` and `reset restores the
  defaults` (interaction test per ui-ux.md).
- [ ] Commit.

### Task 9: Picking

review: yes

**Files:**
- Create: `src/services/gpu/shaders/stellarStreams/pick.wesl` (or a `fs_pick` entry beside `streams.wesl`),
  `src/layers/stellarStreams/streaks/render/stellarStreamsPickPipeline.ts`
- Modify: `streaks/render/stellarStreamsRenderer.ts` (expose `drawPick`), `streaks/passes/stellarStreamsPass.ts`
  (`pickEnabled`, `drawPick`), `create.ts` (obtain `deps.pickCode('stream')`)
- Test: `tests/layers/stellarStreams/streaks/passes/stellarStreamsPass.test.ts`

Invoke the `wesl-shaders` skill before editing WESL. Pattern: `src/layers/milkyWay/picking/render/milkyWayPickRenderer.ts`
(NEAR0 pick, `depth32float`, `less`, depth write on, target `r32uint`).

**Interfaces:**
- The pick fragment writes `packSelection(code, streamIndex + PICK_SENTINEL_OFFSET)`
  (`src/data/selectionEncoding.ts:44,53`); `code` is a uniform filled from `deps.pickCode('stream')`, the
  stream index from instance attribute 2.w.
- Only the **sharp** look draws pick geometry (Review Focus 5); its across-width is at least
  `PICK_PADDING_PX` (4) device px; same vertex stage as the visual draw (shared function, no copy).
- Uses the windowed `view.slab.vp` / `view.viewportPx` the visual pass uses, so the pick crop applies.

- [ ] Tests:
  - `drawPick draws the streak look only` (fake renderer records one pick draw, none for haze).
  - `pickEnabled is false when the pass is disabled or the fade is 0`.
- [ ] Manual check (controller): hover a stream in the dev server; the hover preview names it.
- [ ] Commit.

### Task 10: The selection kind, card and search

**Files:**
- Create: `src/layers/stellarStreams/selection/@types/StellarStreamRef.d.ts`,
  `selection/@types/StellarStreamSelectionRow.d.ts`, `selection/@types/StellarStreamTarget.d.ts`,
  `selection/kinds.ts`, `selection/stellarStreamsSelectionRow.ts`,
  `selection/data/stellarStreamFocus.constants.ts`,
  `selection/ui/StellarStreamDetailCard/StellarStreamDetailCard.tsx` (+ `.module.css`),
  `selection/ui/CompactStellarStreamCard/CompactStellarStreamCard.tsx`,
  `search/present/stellarStreamsSearchRows.ts`
- Modify: `src/layers/stellarStreams/layer.ts` (`selection`, `search`, `ui` detailCard), the composition
  root entry for selection arms if #1064 requires one (check `src/compositions/` for the selection registry)
- Test: `tests/layers/stellarStreams/selection/stellarStreamsSelectionRow.test.ts`,
  `tests/layers/stellarStreams/selection/ui/StellarStreamDetailCard.test.tsx`

Mirror the satellites kind (`src/layers/satellites/selection/kinds.ts`, `satellitesSelectionRow.ts`,
`focus/ui/SatelliteDetailCard`); read `src/@types/engine/layer/SelectionKindFacts.d.ts` and `SelectionFocus.d.ts`.

**Interfaces:**
- ```ts
  type StellarStreamRef = { readonly type: 'stellarStream'; readonly slug: string };
  // row = the meta entry fields + positionMpc (= anchorMpc) + radiusMpc (= lengthKpc / 2 in Mpc)
  // focus id: `stream-<slug>`; claims /^stream-[a-z0-9-]+$/
  ```
- Facts: `focus` = `{ arrivalSize: 0.6, flyInto: false, ring: null }` (a stream is long and thin: frame its
  length, no ring); `mayHaveLabel: () => true`; `displayName` = the stream's name.
- Row: `resolvePick(pick)` maps `localIdx − PICK_SENTINEL_OFFSET` → meta index → slug; `encodePick(ref)` is the
  inverse; `extractRow` reads **only the meta** (no bin needed).
- Card (spec §5.6): headline name; kind line "Stellar stream", or "Dwarf-galaxy debris, N-body model" for
  `source: 'vasiliev2021'`; length (kpc), distance range (kpc), width (° or "—"), particles drawn; source line
  with reference and licence. Compact: name, kind line, distance range.
- Search: one `LayerSearchEntry` per stream `{ id: 'stream-<slug>', names, class: 'primary', chip: 'Stream' }`.

- [ ] Tests:
  - `resolvePick and encodePick round-trip every stream`.
  - `a deep-link ref resolves with the bin unloaded` (meta committed, bin slot idle; Review Focus 1).
  - `focusId decodes stream-gd-1 and refuses other prefixes`.
  - `the detail card shows the N-body kind line for Sagittarius and the width dash`.
- [ ] Commit.

### Task 11: Labels

**Files:**
- Create: `src/layers/stellarStreams/labels/present/produceStellarStreamLabels.ts`
- Modify: `src/layers/stellarStreams/layer.ts` (`guides: () => ({ screenLabels: [{ slab: NEAR0, id:
  'stellarStreamLabels', label: 'stellarStream', produceLabels: … }] })`)
- Test: `tests/layers/stellarStreams/labels/present/produceStellarStreamLabels.test.ts`

Pattern: `src/layers/structure/**/present/produceStructureLabels.ts` (NEAR0 anchors camera-relative via
`ctx.drawCamPos`) and `src/layers/blackHoles/markers/present/produceBlackHoleCaptions.ts`.

**Interfaces:**
- One `Label2D` per stream: `id: 'stream:<slug>'` (text fixed per id — the director's signature ignores text,
  `docs/backlog/2026-08-22-label-entanglement-residuals.md`), `worldPos` = `anchorMpc − drawCamPos`,
  `fadeAlpha` = the handed label fade, `prominencePx` = apparent length in px
  (`lengthMpc / distance · pxPerRad`), `pickId` = `encodePick(ref)` and `subjectId` set, gated by
  `isPickableUnderFocus`.
- No labels until the meta is committed.

- [ ] Tests:
  - `emits one label per stream once the meta is in` and `none before`.
  - `each label's pickId equals the selection row's encodePick`.
  - `a longer stream outranks a shorter one at equal distance` (prominence).
- [ ] Commit.

### Task 12: Band-driven asset demand (depends on the asset-demand-as-data PR)

**Precondition:** the asset-demand-as-data work (another session) has merged to `main`, and `main` is merged
into this branch. Read the landed shape in `src/@types/loading/AssetWiringRow.d.ts`. If it has not landed,
**STOP and report**; the interim switch-only demand from Task 6 ships until it does.

**Files:**
- Modify: `src/layers/stellarStreams/catalog/load/stellarStreamsAssetRows.ts`
- Test: whatever the landed shape's own tests pin per row (follow its pattern for localBubble/satellites)

- [ ] Replace the bin row's interim `demand`/`release` with the band form on show entry `stellarStreams`, band
  `streams`, lead 1.2, release 2 (field names as landed).
- [ ] Commit.

### Task 13: Perf, eye check and docs (controller)

**Files:**
- Modify: `docs/superpowers/plans/2026-11-06-stellar-streams.md` (tick boxes), ledger

- [ ] `npm run perf -- --url http://localhost:<this wt port>` at the oblique pose
  (`#pose=a,-0.00043726202,-0.0069827522,-0.0038794295,4.4046,-0.6,0.065,0`) and the M54 pose
  (`#pose=a,0.005388403,-0.021997970,-0.013330148,4.4046,-0.6,0.022,0`): streams off (before) vs on (after);
  read the `perf` skill first. Record GPU ms for `stellar-streams` and frame totals.
- [ ] Eye check pairs (main vs branch) at both poses plus a label/pick/card shot, sent to the owner with deep
  links.
- [ ] Commit.

### Task 14: Haze look at half resolution (perf-gate follow-up, owner ruling 1c)

**Why:** Task 13's perf gate measured ~30 ms GPU added at `milky-way-outside` with streams on; the haze
look is the cost (fill-bound, sweep exponent 0.60; haze at sizeScale 0.01 drops hdr·NEAR0 to 8.1 ms). The
owner ruled: draw the haze into a reduced-resolution target and upsample it, as the Milky Way does with
`mw-aggregate`. Target: `stellar-streams` (+ its upsample) ≤ ~4 ms at milky-way-outside, look as close to
today's as possible. The streak look and the pick stay full res.

**Files:**
- Create: `src/layers/stellarStreams/streaks/render/stellarStreamsHazeTarget.ts` (a `RenderTargetSpec`, id
  `stellar-streams-haze`, `HDR_TARGET_FORMAT`, `depth: null`, clear 0; scale divisor 2 — copy the
  `milkyWayAggregateTarget.ts` shape)
- Create: `src/layers/stellarStreams/streaks/passes/stellarStreamsHazePass.ts` (draws the haze look only, into
  the haze target; viewport = `sizeOf('stellar-streams-haze')`, pxPerRad scaled by `vh / canvasSize.height`
  exactly as `milkyWayAggregatePass.ts` does, so `minPx` stays in the target's pixels)
- Create: `src/layers/stellarStreams/streaks/passes/stellarStreamsHazeUpsamplePass.ts` (via
  `createUpsamplePass`, like `milkyWayUpsamplePass.ts`; one `createAdditiveUpsample` handle on the runtime,
  destroyed in `destroy`)
- Modify: `stellarStreamsPass.ts` (streak look only), `stellarStreamsRenderer.ts` (draw one look per call
  instead of both), the Layer's `layer.ts` (`renderTargets`, passes), `create.ts` / `destroy.ts`, the runtime
  type
- Modify: `src/data/rendering/frameSections.ts` — a `{ kind: 'render', target: 'stellar-streams-haze', slab:
  NEAR0, passes: ['stellar-streams-haze'] }` row beside `mw-aggregate`, and `stellar-streams-haze-upsample`
  in the hdr NEAR0 list immediately before `stellar-streams` (both after the dust multiply, see the pass
  header)
- Test: the frame-section/pass-name tests that pin the roster; a renderer test that a haze-only call writes
  the haze look's uniforms and skips when its intensity is 0

**Interfaces:**
- Consumes: `StellarStreamsLook` (`intensity`, `sizeScale`, `stretch`, `minPx`, `flow`), core `fade`.
- Produces: renderer `draw(pass, vp, viewportPx, pxPerRad, camPos, clockSec, look, opacity)` (one look);
  pass names `stellar-streams-haze`, `stellar-streams-haze-upsample`.

- [x] Haze target + passes + roster rows; all three passes share one enabled predicate (data loaded, look
  intensity > 0) so producer and consumer cannot disagree.
- [x] Haze `minPx` reads in the half-res target's pixels: halve nothing by hand, the viewport/pxPerRad scaling
  does it — say so in the target header.
- [x] `npm run typecheck && npm test` green; commit.

### Task 15: Cap Sagittarius's bound share (owner ruling Q-remnant a, amends Q7)

**Why:** 56% of the 60k subsample is the still-bound remnant (~33k particles in a few kpc), which blows the
core out to white. Cap bound particles (`tStripGyr === 0`) at 10% of `SGR_PARTICLE_BUDGET`; the rest of the
budget is debris, so the tails gain density. Total stays 60k.

**Files:**
- Modify: `tools/streams/data/streamsBuild.constants.ts` (`SGR_BOUND_SHARE = 0.1`)
- Modify: `tools/streams/utils/sagittariusParticles.ts` (seeded pick per class: bound up to the cap, unbound
  for the rest; file order and determinism preserved; header says why)
- Modify: `tools/streams/README.md`, `public/data/stellar-streams/v1/*` rebuilt with `npm run
  build-stellar-streams` (byte-identical on a second run)
- Test: `tests/tools/streams/utils/sagittariusParticles.test.ts` — bound count = min(cap, bound rows); total
  = min(budget, rows); same seed → same picks; with fewer unbound rows than the remainder, bound fills the
  rest (budget is never underspent)

- [x] `sagittariusMeta` keeps reading the full snapshot (anchor + lengthKpc unchanged) — assert in the test.
- [x] Rebuild (128,419 holds, byte-identical rerun); data untracked (`public/data` is gitignored), the owner's R2 sync.

### Task 16: Caption only long-enough streams; short card source line (owner ruling Q-labels a)

**Why:** 83 captions crowd the halo. A caption shows only when the stream's apparent length on screen is at
least `STELLAR_STREAM_LABEL_MIN_PX` (start at 80 px), or when that stream is hovered or selected. The detail
card's galstreams source line wraps; it becomes the track reference alone (`fu2018 track`) — the meta
`description` already credits galstreams (Mateu 2023).

**Files:**
- Modify: `src/layers/stellarStreams/labels/present/produceStellarStreamLabels.ts` (filter by the apparent
  length the declutter priority already computes; read hover/selection from the snapshot the way another
  Layer's label producer does — find it, don't invent a new channel)
- Modify: `src/layers/stellarStreams/labels/data/stellarStreamLabelStyle.constants.ts` (the threshold)
- Modify: `src/layers/stellarStreams/selection/data/stellarStreamSourceFacts.constants.ts`
- Test: a short far stream gets no caption; the same stream hovered or selected gets one; a long one always
  does

- [x] No Layer contract member added or widened (STOP and report if the hover/selection read needs one).
- [x] Commit.

### Task 17: Realistic stream colours from metallicity and a sampled star mix (owner ruling X8FX, amends Q3)

**Why:** the owner asked for realistic colours. Streams are old (10–13 Gyr), metal-poor populations: light from
red giants and turnoff stars plus some blue horizontal-branch (BHB) stars, so integrated colour runs from
B−V ≈ 0.6 (metal-poor globular-cluster streams) to ≈ 0.9 (metal-rich dwarf debris). Today's colour is a
stylised random blue-to-amber mix because galstreams and the Vasiliev snapshot carry no metallicity. Brightness
stays density-only (Q3 unchanged); only colour changes.

**Rulings:** (1) per-stream [Fe/H] from a committed curated table: Harris (1996, 2010 edition) [Fe/H] for streams
whose progenitor globular cluster is known (stream name = cluster: Pal 5, NGC 5466, M68, NGC 3201, M5, M3,
NGC 1261, NGC 2298, NGC 2808, NGC 288, …), and the S5 survey (Li et al. 2022, ApJ 928, 30; arXiv:2110.06950)
spectroscopic [Fe/H] for the streams it measured; every other stream uses the table's median. (2) Each particle
samples a star type — giant, turnoff, BHB — with fractions and per-type B−V that depend on the stream's [Fe/H]
(metal-poor → more BHB, bluer giants). (3) Sagittarius: strip time maps to a [Fe/H] gradient (bound core
≈ −0.5 → oldest debris ≈ −1.2; cite the source used) and samples the same population model.

**Files:**
- Create: `tools/streams/data/streamMetallicity.constants.ts` — rows `{ name, feh, ref }` keyed by the galstreams
  `Name`; header cites both sources with URLs. **Every value is copied from the fetched primary source**
  (Harris `mwgc.dat` 2010 edition; the Li+2022 table on arXiv), never from memory; list in the report which
  source line each value came from.
- Create: `tools/streams/utils/` — one function per file: the population sampler (`[Fe/H]`, rng → B−V), the
  Sgr strip-time → [Fe/H] map, and the stream → [Fe/H] lookup (table or median). The population model's anchors
  (fractions and B−V per type at [Fe/H] −2.2 and −0.5, linear between) go in `streamsBuild.constants.ts` with
  a one-line source (an old-population isochrone, e.g. MIST 12 Gyr); comments say it is a two-anchor
  approximation.
- Modify: `trackParticles.ts`, `sagittariusParticles.ts` (colourT now encodes B−V linearly over a fixed range,
  named constants), the meta rows (`feh: number | null` — measured values only, null for median-defaulted;
  `fehRef: string | null`), the runtime meta type + parser.
- Modify: `streams.wesl` — colour from B−V. **Reuse the star layer's existing B−V/Teff → RGB function** if a
  shared one exists (stream stars then match catalogue stars on screen); else a fixed ramp of real star
  colours. The caption tint (`streamTintRgb` or as landed) uses the same mapping in TS, kept pinned to the
  shader by the existing text-equality test (update it).
- Modify: the detail card — a "Metallicity" row `[Fe/H] −2.2 (Harris 2010)` when `feh` is measured, absent
  otherwise (never display a defaulted value).
- Modify: `tools/streams/README.md`, `ATTRIBUTIONS.md` (Harris catalogue, S5), `docs/DATA.md` if it lists the
  stream inputs; rebuild with `npm run build-stellar-streams` (byte-identical on a second run). No bin version
  bump: nothing has shipped (the bin has never been synced to R2).
- Test: the sampler (metal-poor stream has a higher BHB share and lower mean B−V than a metal-rich one; same
  seed → same output), the lookup (table hit vs median), the Sgr map (monotone, endpoints), the card row
  present/absent.

- [x] No Layer contract change. Brightness untouched.
- [x] Commit (code; the rebuilt data is gitignored).

Task 13 re-runs (perf, eye check) after Task 17.

---

## Definition of Done

**Deliverables**
- `npm run fetch-vasiliev2021`, `npm run fetch-galstreams`, `npm run build-stellar-streams` work end to end and
  produce `stellar-streams/v1/stellar-streams.bin` (~127k particles, ~83 streams) and
  `stellar_streams_meta.json`.
- `src/layers/stellarStreams/` in ADR 0014 modules: `catalog/`, `streaks/`, `labels/`, `selection/`, `search/`;
  `tools/streams/buildStellarStreams.py` deleted; no `window.__streamLooks`.
- `ATTRIBUTIONS.md`, `DATA.md`, website commands/data/settings/debug rows updated.

**Observable behaviours (smoke)**
- Off at boot; switching "Stellar streams" on in Labels & guides shows nothing near the Sun, fades in between
  4 and 10 kpc, and is gone past the foreground gate.
- Streaks drift along each stream's motion; Sagittarius runs from an orange core to yellow-orange arms;
  galstreams streams are pale yellow-white, shaded by metallicity; no along-track brightness waves on the
  galstreams streams.
- The render loop sleeps when streams are off, out of band, or both looks' flow are 0.
- Debug panel "Stellar streams" sliders change the look live; Reset restores it.
- Hover a stream: preview card; click: detail card with name, kind line, length, distance range, width,
  particles, source; F focuses and frames it; Esc clears.
- Each stream has one label; clicking the label selects the stream.
- Palette search finds "GD-1" and "Sagittarius"; `#focus=stream-gd-1` from the boot view switches the section on
  and flies there.
- Perf numbers at the two poses reported before/after.

**Deferral boundary**
- Per-stream highlight of the selected stream; real-orbit animation or time scrub; streams without real
  distances; packed records; R2 sync (the owner's step from main); `matteHiddenPasses` and the other backlogged
  adjacent findings.
