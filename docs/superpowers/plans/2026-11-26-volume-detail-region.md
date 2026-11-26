# Volume detail region

**Goal.** Ship [the spec](../specs/2026-11-26-volume-detail-region-design.md): inside a density
volume or close outside it, MCPM and Polyphorm 2MRS draw at native resolution from a box of 48³
full-res bricks, centred on the camera clamped into the volume and streamed by HTTP Range, over the
half-res base.

**Base.** Branch `feat/volume-detail-region`: the spec (`8f7da371f`, the owner's rulings folded in at
`949e94964`), then main merged in at `fd7f34369`, which carries #1179 (terrain shadows) and #1180
(Mars tiles v3). The controller works in the worktree that holds the branch
(`.claude/worktrees/agent-a1047db95976abf81`, still at `8f7da371f`: fast-forward it first). Every
path and line cited below is checked against `fd7f34369`.

**Pre-task questions (sdd-execution.md).** Nothing to ask. The perf gate runs (spec §11 steps 1–2,
§13 check 2). Parallelism: this PR alone on its branch.

**Ledger.** `.superpowers/sdd/2026-11-26-volume-detail-region/progress.md` in the controller's
worktree; archived beside this plan at landing.

## Owner rulings this plan builds on

Spec §2. Ground check (vxC4): one 3D texture per field with brick `b` at slot `b mod K`, a box drawn
from AABB uniforms, the tile stream; the surface tiles' archive index format, moved to a shared
home; bricks are level 0 of `volume-pyramid/v1`, sidecar unchanged; one gzip member per brick;
K = 5 on small and medium, K = 8 on large; the 2MRS native input from the owner's export folder,
its R2 mirror backlogged; one PR, prep first. Spec review (2026-11-26): the spike's three-box fade
(passed by eye); the region is drawn from close outside a volume too; brick reads use the HTTP
cache, `no-store` measured in acceptance and switched only on the owner's word; region state lives
on the region object, the planner contract does not grow; full-res builds only on the owner's
machine; the archive move only after the terrain-shadow PR merged (it did, as #1179).

## Standing constraints (every task, every dispatch)

- **Both volumes behave identically.** No branch on a field id; per-field facts come from the
  sidecar and the source row.
- **The spike worktree is untouchable.** Nothing in `.claude/worktrees/volume-progressive-octree` is
  edited, staged, reverted, cleaned or deleted. Stage by path, never `git add -A`.
- **Moves and renames only through the tools**: `npm run move-files` and `npm run refactor`, with the
  commands spelled out in the task; never `git mv` or hand-edited imports.
- **One symbol per file** in `utils/` and `@types/`; `type`, never `interface`; the Layer's own types
  in `src/layers/cosmicWebDensity/detailRegion/@types/`, shared ones in `src/@types/`.
- **Tests only where they can fail on a real bug** (testing.md); a task says so when it adds none.
- **Comments** explain why, within comments.md's budget (header ≤ 10 lines, comment lines ≤ half the
  code lines).
- **No contract grows**: the Layer contract, `ReconcileEffects`, `SagaContext`, the planner contract.
- **Measuring**: ms per frame and fps first, percent after; each run about 30 minutes, one pass,
  under `caffeinate -dims`; captures under 200 MB in total, deleted once their numbers are in the
  ledger; a worktree's tools always get `--url` of that worktree's own server. Tiers are forced with
  `?perf`, `await __skymapPerf.setTier('<tier>')`, `await __skymap.settled()`, and each run asserts
  the files it fetched; the `?tier=` switch is dead. Checks run once where they decide something.
- **Owner steps are the owner's**: data builds of the native inputs and the R2 sync. Agents never
  sync R2 and propose only `npm run sync-r2-secure`.

## Decisions the plan makes

The spec leaves these open or gets them wrong against the code; each is settled here.

1. **`readArchiveRange` takes no cache argument.** Ruling 10 puts both callers on the HTTP cache, so
   the spec's `cache` parameter would be a knob nobody sets; check 6's `no-store` run is a scratch
   patch. (Spec §3 updated to match.)
2. **Two brick scripts, not one with an argument.** npm appends `-- <args>` to the end of the whole
   script, after its `&& npm run build-data-manifest` tail, which is why `build-mcpm` and `build-2mrs`
   exist. So `build-mcpm-bricks` and `build-2mrs-bricks`, not the spec's `build-volume-bricks --
   <field>`.
3. **The native-peak check reads the whole file.** The dataBox skips x < 40 (MCPM) and x < 352
   (2MRS), where the grid peak may sit; a peak taken over the box's slabs alone could throw on good
   input. A streamed max over the whole `.npy` (about 2 s from SSD) is compared instead.
4. **`readNpy` parses its header through `readNpyHeader`**, so the header grammar lives once.
5. **`DetailRegionState` carries `inReach`**, so `detailRegionDraw` returns null out of reach from the
   state alone.
6. **The planner's gate uses `drawPxPerRad / COSMIC_WEB_DENSITY_TARGET_SCALE`**, the density target's
   `scale: 3` (`layer.ts:36`) moved to a constant both read; it differs from the pass's
   height-scaled value (`createScalarVolumePass.ts:38`) by under one target row.
7. **`RegionUniforms` has no explicit pad members.** vec3 alignment puts every member at the spec's
   offsets, and the parity test wants a sentinel for every declared member (the #1178 precedent).
8. **The sidecar fetch is shared.** `loadVolumePyramid.ts:31-34` fetches it inline; the region needs
   the same fetch, so it becomes `fetchVolumePyramidSidecar`.
9. **Brick ids have one home**, `brickId` and `brickCoordsOf` in `src/utils/volume/`: the builder
   writes them as archive keys and the runtime reads them back.
10. **Data reaches R2 before acceptance**, not only before the merge: check 6 times fills against
    production. Uploading early is safe: the files are additive and an old app ignores the new
    manifest entries.
11. **The fade ramp keeps the spike's eye travel.** Outside, motion straight away from a face moves
    the eye but not the box; it can only speed a running fade, never start one.

## Shader price (feedback: count every added read)

Texture sample calls per march step, by pipeline (`REGION` override):

| Pipeline | Where in the ray | Volume reads | Palette reads | Volume texel taps | Added ALU per step |
| --- | --- | --- | --- | --- | --- |
| 0 base only (today) | everywhere | 1 | 1 | 8, or 16 between mips | none |
| 1 steady | settled box, before `tGate` | 1 (region, level 0) | 1 | 8 | 2 compares |
| 1 steady | elsewhere | 1 (base) | 1 | 8 or 16 | 2 compares |
| 2 fading | settled box | 1 (region) | 1 | 8 | up to 6 compares |
| 2 fading | `into` or `out`, outside settled | 2 (region + base), one mix | 1 | 16–24 | up to 6 compares, 1 mix |
| 2 fading | elsewhere | 1 (base) | 1 | 8 or 16 | up to 6 compares |

Per ray: pipeline 1 adds one ray–box intersection and one division (`tGate`); pipeline 2 three
intersections. The jitter `textureLoad` per ray is unchanged. **A region seen from outside adds no
shader term**: its box is a box in the same local frame, so the steady pipeline stays one interval
test and exactly one volume read per step. Task 6.4 counts these in the final WGSL.

## Tasks

| # | Task | Spec | Dispatch |
| --- | --- | --- | --- |
| 0 | Backlog: date the old volume prune; pick up the timing item | §18 | controller |
| 1 | Timing acceptance carried from #1178 | §11.1 | controller |
| 2 | The ~7% raster cost explained (halting gate) | §10.2 | controller |
| 3.1 | Prep (b): `regionOf` rides `VolumeFieldLiveness` | §3 | D1 |
| 3.2 | Prep (c): the region value in `densityAccumulationKey` | §3 | D1 |
| 3.3 | Prep (d): `VolumeFieldRenderer.attachRegion` | §3 | D1 |
| 3.4 | Prep (a), moves: the archive index format to shared homes | §3 | D2 |
| 3.5 | Prep (a), reader: `readArchiveRange` | §3 | D2 |
| 4.1 | Extractors write the native d1 tier | §5 | D3 |
| 4.2 | `readNpyHeader` | §5 | D3 |
| 4.3 | Brick facts: edge, ids, path, the zero block | §4 | D3 |
| 4.4 | The brick builder | §4, §5 | D3 |
| 4.5 | Deploy rows | §4.5 | D3 |
| 4.6 | Owner: build the bricks for development | §5 | owner |
| 5.1 | `planDetailRegion` | §6.1–6.2 | D4 |
| 5.2 | `detailRegionDraw` and the tier table | §6.2–6.3, §6.6 | D4 |
| 5.3 | The toroidal brick store | §6.4 | D5 |
| 5.4 | The brick fetcher | §6.4–6.5 | D5 |
| 5.5 | Region, host, runtime, teardown | §6.4–6.6 | D5 |
| 5.6 | The once planner and its wiring | §6.4 | D5 |
| 6.1 | Renderer: group 2, three pipelines, the region block | §7 | D6 |
| 6.2 | The steady march | §7 | D6 |
| 6.3 | The fading march | §7, §8 | D6 |
| 6.4 | Count the reads in the final WGSL | §7 | controller |
| 7.1 | Docs | §15 | D7 |
| 7.2 | Owner: data to R2 | §14 | owner |
| 7.3 | Acceptance checks 1–14 | §13 | controller |
| 7.4 | Whole-branch review and one fix round | — | reviewer + D6's agent |
| 7.5 | Landing: audits, `/feature-done`, the merge ask | §14 | controller |

**Dispatches** (sdd-execution.md; paste its agent protocol into every brief, and the standing
constraints above):

| Dispatch | Tasks | Model | Why this model |
| --- | --- | --- | --- |
| D1 | 3.1–3.3 | sonnet | type plumbing through files that share one mental model |
| D2 | 3.4–3.5 | sonnet | tool-driven moves plus one extracted fetch with its tests |
| D3 | 4.1–4.5 | opus | binary output, streamed 2–3.5 GB reads, block layouts (`review: yes` on 4.4) |
| D4 | 5.1–5.2 | opus | the plan's box, reach and fade logic (`review: yes` on 5.1) |
| D5 | 5.3–5.6 | opus | GPU ownership, streaming, lifecycle, frame wiring (`review: yes` on 5.5) |
| D6 | 6.1–6.3 | opus | shader and TS↔WGSL layout (`review: yes` on 6.1–6.3) |
| D7 | 7.1 | sonnet | docs |

**Order.** Strictly sequential on the one branch: 0 → 1 → 2 → **gate** → D1 → D2 → D3 → D4 → D5 →
D6 → 6.4 → D7 → 7.2 → 7.3 → 7.4 → 7.5. One overlap: **Task 4.6 runs while D4 works**; it writes
only gitignored files (main's `data/raw/` and `public/data/volume-pyramid/v1/`), which D4 never
touches. Implementers never share a git index (this project lost a commit that way). Mid-branch
reviews, one round each, given the diff, the task contract and the named spec section, follow D3,
D4, D5 and D6. Controller checks follow D1 and D2 (pixels identical to main) and D5 (the region
streams, pixels still identical). Each dispatch stays well under 350k tokens.

**Archive-move gate: met.** Task 3.4 needed #1179 merged; it is in this branch since `fd7f34369`.
Tasks 0–3.3 never touch the archive files; Tasks 4.4 and 5.4 import the moved names, so they follow
3.4–3.5.

---

## Task 0 (controller, inline): backlog

**Files:** `docs/BACKLOG.md`

- `:173` "Prune the six tiered volume `.scfd` from R2": replace "not before one month after the
  deploy (date `<deploy date + 1 month>`, the owner fills it in at deploy)" with "not before
  2026-12-26 (one month after #1178's deploy)".
- `:123` "Density volume timing acceptance": delete. Task 1 picks it up, and backlog hygiene deletes
  a picked-up line in the same change.
- No test.

**Commit:** `Backlog: date the old volume prune; the timing acceptance is picked up`

---

## Task 1 (controller): timing acceptance carried from #1178

No commit except the ledger. Every scratch patch is local, applied to both sides alike, carries
`// delete when Task 1 is done`, and is never committed. These numbers are the "step 1" baseline
spec §13 checks 2 and 3 refer to.

**Servers.**

| Server | What | Notes |
| --- | --- | --- |
| Before | scratch worktree `git worktree add --detach .claude/worktrees/scratch-pre-1178 e41e5d89a` (main before #1178), `node_modules` symlinked to main's, its own port | Main's `manifest.json` no longer names the tiered MCPM and 2MRS `.scfd` (checked 2026-11-26), so this server gets its own `public/data/`: one symlink per top-level entry of main's `public/data/` except `manifest.json`, plus a copy of main's `manifest.json` with the rows `scalar-field/v3/{mcpm,polyphorm-2mrs}-{small,medium,large}.scfd` → their hashed files added back. Check all six hashed files exist in main's `public/data/scalar-field/v3/`; a missing one stops the task and goes to the owner. |
| After | the feature worktree, `public/data` linked (`/link-data`), its own `npm run dev` port | its volume code is main's |

**Timing rig (#1175's wall-clock bench).** A scratch patch draws each field `K` times inside the
renderer's field loop; boot `?perf`, `setStrategy('merged')`, `setPose`, 240 rAF deltas per run.
Controls before any number is quoted: the no-op floor (`layers=-cosmicWebDensity`), K-doubling
(`T(16) − T(off) ≈ 2·(T(8) − T(off))` within 15%), ≥ 5 rounds with median and spread. Per-draw cost
is `(T(K) − T(off)) / K`. Paired A/B, alternating.

**Poses**, with `layers=-survey,-structureRing,-cosmicWebFilaments,-zoneOfAvoidance,-starCatalog,-milkyWayDisk,-label`:
MCPM inside `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0`, outside `…,600,0`, far `…,2000,0`, knot
`a,-132.82,18.99,67.28,0.5,0.3,20,0`; 2MRS inside `a,21.27,21.07,36.88,0.5,0.3,30,0`, outside
`…,600,0`, far `…,2000,0`.

| # | Check (half-res spec §12) | How | Bar |
| --- | --- | --- | --- |
| 7 | Per-draw cost, large | After at large: every pose above, ASTC (native on the Mac) and BC4 (a scratch filter in `loadVolumePyramid` dropping the ASTC features before `pickVolumePyramidFormat`). Before's large in the same rounds as the control: within 15% of the spike session's "today" (inside 0.59–0.65 ms), or the comparison goes to the owner instead of pass/fail | ≤ 1.10 × the spike rows (inside / outside / far / knot): MCPM ASTC 0.400 / 0.575 / 0.125 / 0.375 ms; BC4 0.400 / 1.25 / 0.15 / 0.425; 2MRS ASTC 0.375 / 0.363 / 0.163 (no knot) |
| 8a | Medium vs before | the rig while moving (auto-rotate), medium, MCPM inside, after vs before | ≤ 1.10 × |
| 8b | Phone, small | OnePlus through `npm run phone`, each server started `SKYMAP_HTTPS=1 npm run dev` and passed by its `Network:` URL as `--url` (tools/phone/README.md); small, moving, MCPM inside, after vs before; `npm run phone -- net '<link>' --url <server>` records which format's files the phone fetched | ≤ 1.10 ×. Phone not attached: owed, in the ledger and the PR body |
| 9 | Load time | in each worktree: `npm run loadtime -- --rebuild --profile slow-4g --profile fast-4g --link '?layers=…#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0'` (the tool builds and serves its own bundle from its worktree); volume arrival from a scratch `console.info('[volume-arrival]', id, performance.now())` at the density slot's commit, read from the same run's console; medium's L1–L3 gzip-6 wire bytes against the two old `-medium.scfd` | no bar; shown to the owner |

**Gate.** A breach of a ≤ 1.10 × bar halts and goes to the owner (the half-res spec's rule).

**Results** go into the ledger and the PR body: ms per draw and fps first.

**Done when:** each row has its numbers, or "owed" for the phone.

---

## Task 2 (controller): the ~7% raster cost explained

Measurement and reading only. No commit except the ledger. Spec §10.2.

**Where.** The spike's code. Its worktree `.claude/worktrees/volume-progressive-octree` is read-only:
never edit, restart, stage or delete there. Make a scratch copy: `git worktree add --detach
.claude/worktrees/scratch-box-7pct <the spike worktree's HEAD sha>`, then copy (`cp`, never `mv`)
every file `git -C .claude/worktrees/volume-progressive-octree status --porcelain` lists as changed or
untracked (among them `src/services/gpu/renderers/volumeField/spike/boxSpike.ts`, the `fs_box`
branch in `src/services/gpu/shaders/scalarVolume/fragment.wesl`, `tools/spike/`); `node_modules` and
`public/data` symlinked; its own port. Scratch patches carry `// delete when Task 2 is done`; the
scratch worktree goes when the task ends.

Steps, one pass, about 30 minutes of measuring in all, on a quiet GPU (no live app):

1. **Reproduce.** Region on and off at MCPM inside and knot, the raster path against a scratch
   full-screen triangle, 5 rounds, K-doubling within 15%. The spike saw 39.2 → 41.8 ms per 64
   draws. If the gap stays inside the round-to-round spread it was contention: record it and stop
   (outcome A).
2. **Invocations.** Fragment invocations per covered pixel in both paths (a scratch atomic counter
   in a storage buffer, read back once): helper lanes along the cube's triangle edges run the whole
   march.
3. **Divergence.** A pose where the region fills the screen (no box edge in view) against one where
   its edge crosses the screen.
4. **Test form.** The per-ray interval test (spec §7) against the spike's per-step 3D test, at MCPM
   inside and at `a,-239.45,-16.5,201.3,0.5,0.3,600,0`, where the spike's region cost 0.66 ms per
   draw against the base's 0.45 and where ruling 9 now draws it. The faster form is Task 6.2's.
5. **Capture.** One Metal GPU capture per pipeline: register count and occupancy.

**Report** to the owner in one dash ask, ms per draw and fps first, with the outcome:

- **A, not reproduced**: continue.
- **B, explained and fixed**: a change measured to remove the cost (a test form, a full-screen path)
  joins Task 6.2's contract with the owner's OK; continue.
- **Neutral or negative**: the cost reproduces and no cause is found, or a cause is found with no
  measured fix, or the better test form still costs more than 0.55 ms per draw at the 600 Mpc pose.
  **The plan halts here.** No further task runs until the owner rules ("accepted, cost X ms", or a
  redesign); the ruling goes into the ledger.

---

## Task 3.1: Prep (b) — `regionOf` rides `VolumeFieldLiveness`

Behaviour-neutral: every caller passes `() => null`; pixels identical.

**Files:**
- `src/@types/rendering/DetailRegionDraw.d.ts` (create)
- `src/@types/rendering/VolumeFieldLiveness.d.ts` (modify; the header says "two read closures")
- `src/@types/rendering/VolumeFieldRenderer.d.ts` (modify: `draw` `:53-62`)
- `src/layers/cosmicWebDensity/densityCubes/utils/deriveVolumeLiveness.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/present/deriveCosmicWebDensityLiveness.ts` (modify:
  passes `() => null`)
- `src/services/engine/frame/passes/createScalarVolumePass.ts` (modify: `:40-41` hands on
  `liveness.regionOf`)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify: `draw` `:329` takes
  `regionOf`, unread until Task 6.1)
- tests (modify): `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (10 `draw`
  calls), `volumeUniformsLayout.parity.test.ts` (1), `tests/services/engine/frame/passes/createScalarVolumePass.test.ts`
  (2), `tests/layers/cosmicWebDensity/densityCubes/utils/deriveVolumeLiveness.test.ts`,
  `tests/layers/cosmicWebDensity/densityCubes/present/deriveCosmicWebDensityLiveness.test.ts`

**Contract.**

```ts
// src/@types/rendering/DetailRegionDraw.d.ts — numbers only: it goes into the accumulation key.
export type DetailRegionDraw = {
  /** Read at weight 1. The stored box's local [0,1]³, inset half a native voxel. */
  readonly settledLo: Vec3;
  readonly settledHi: Vec3;
  /** Local [0,1]³ to region texture coordinates (repeat-sampled): dataBox.dims / (K · 48). */
  readonly texScale: Vec3;
  /** Native voxel edge, Mpc: the region is read only where a pixel spans less. */
  readonly voxelMpc: number;
  /** null = the steady pipeline. Boxes in the same local frame. */
  readonly fade: {
    readonly intoLo: Vec3; readonly intoHi: Vec3;
    readonly outLo: Vec3; readonly outHi: Vec3;
    readonly w: number;
  } | null;
};

// VolumeFieldLiveness<Id> gains
/** This frame's detail region for the field; null = the base alone. */
readonly regionOf: (id: Id) => DetailRegionDraw | null;

// VolumeFieldRenderer.draw: one reader before `inputs`
draw(pass, viewProj, viewportPx, pxPerRad, cameraPosWorld,
     settingsOf, fadeOpacityOf, regionOf: (id: Id) => DetailRegionDraw | null, inputs): void;

// deriveVolumeLiveness gains the reader and returns it in the bundle
deriveVolumeLiveness(renderer, fieldSettingsOf, fadeOpacityOf, regionOf): VolumeFieldLiveness<Id> | null;
```

Steps:

- [ ] Types, then the four source files; the compiler lists every call to fix.
- [ ] No new test: plumbing of a reader that is `() => null` everywhere.
- [ ] `npm run typecheck:fast`; `npm test -- volumeField createScalarVolumePass cosmicWebDensity`.

**Commit:** `Prep: a per-field detail-region reader rides the volume liveness bundle`

**Done when:** the controller's shot at MCPM inside (large) matches main, RMS ≤ 0.1 of 255.

---

## Task 3.2: Prep (c) — the region value in the accumulation key

**Files:**
- `src/layers/cosmicWebDensity/densityCubes/utils/densityAccumulationKey.ts` (modify)
- `src/layers/cosmicWebDensity/frame.ts` (modify: the call `:28-34` passes `live.regionOf`)
- `tests/layers/cosmicWebDensity/densityCubes/utils/densityAccumulationKey.test.ts` (modify)

**Contract.**

```ts
export function densityAccumulationKey<Id extends string>(
  ids: readonly Id[],
  settingsOf: (id: Id) => VolumeFieldSettings,
  opacityOf: (id: Id) => number,
  cubeStampOf: (id: Id) => number | null,
  regionOf: (id: Id) => DetailRegionDraw | null,
  tier: Tier,
): string;
```

Each field's row ends with `regionOf(id)`, printed by the same `JSON.stringify` (exact numbers,
`null` as `null`). Streaming outside the drawn box changes nothing in the value, so it never
restarts the mean.

Steps:

- [ ] Tests:
  - `structurally equal region values give the same key`: two fresh objects with the same numbers.
    Guards an identity compare, which would restart the mean every frame and never converge.
  - `a fade step or a moved settled box gives a new key`: `fade.w` 0.25 → 0.5, and `settledHi[0]`
    changed, each against a base value. Guards the freeze: a region change the key missed would keep
    the converged image of the old box at rest.
- [ ] Implement. `npm test -- densityAccumulationKey planVolumeAccumulation`.

**Commit:** `Prep: the detail region's draw value restarts the density mean`

---

## Task 3.3: Prep (d) — `VolumeFieldRenderer.attachRegion`

**Files:**
- `src/@types/rendering/VolumeFieldRenderer.d.ts` (modify)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify)
- every `VolumeFieldRenderer` stub the compiler names in `tests/` (modify)

**Contract.**

```ts
// VolumeFieldRenderer, beside `upload`:
/**
 * Binds `texture` as `id`'s detail region; null drops the binding. Borrowed, not owned: the region
 * host is the one caller, and it passes null before it destroys the texture. Kept across `upload`
 * of a new base volume.
 */
attachRegion(id: Id, texture: GPUTexture | null): void;
```

- The renderer keeps region textures in their own `Map<Id, GPUTexture>`, apart from the field
  entries, so a base re-upload (small ↔ medium) leaves the region bound. `unload` and `destroy`
  never destroy a region texture.
- No test here: nothing reads the binding until Task 6.1, whose tests pin "null drops it" and "a base
  re-upload keeps it".

Steps:

- [ ] As above. `npm run typecheck:fast`; `npm test -- volumeField cosmicWebDensity`.

**Commit:** `Prep: VolumeFieldRenderer.attachRegion, a borrowed region texture per field`

---

## Task 3.4: Prep (a), moves — the archive index format to shared homes

Behaviour-neutral. **Three commits**, one per mechanical step (the refactor skill: a pure move keeps
git's rename detection); the plan's one deviation from one commit per task.

**Precondition:** `git merge-base --is-ancestor 7a1f5d0e8 HEAD` succeeds (#1179 is in the branch).

**Files:** the seven moved files and their importers at `fd7f34369`: `createArchiveTileSource.ts`,
`surfaceTileMortonKey.ts`, `tools/deploy/r2/collectSurfaceTiles.ts`,
`tools/utils/textures/packSurfaceTileLevels.ts`,
`tools/textures/surfaceHorizon/@types/HeightArchiveLevel.d.ts`,
`tools/textures/surfaceHorizon/utils/readHeightPyramid.ts`; tests
`tests/layers/body/surfaceTiles/archive/utils/surfaceTileArchiveIndex.test.ts` (moved),
`tests/layers/body/surfaceTiles/stream/load/createArchiveTileSource.test.ts`,
`tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts`,
`tests/tools/deploy/r2/collectSurfaceTiles.test.ts`,
`tests/tools/utils/textures/packSurfaceTileLevels.test.ts`,
`tests/tools/utils/textures/planSurfaceTileParts.test.ts` (dragged); `docs/DATA.md` (`:237`).

Steps:

1. **Keep the tile-only constant body-side** (commit `Prep: the surface-tile key's level cap gets its own file`):
   `npm run refactor -- extract src/layers/body/surfaceTiles/archive/data/surfaceTileArchiveFormat.ts#SURFACE_TILE_ARCHIVE_MAX_LEVEL src/layers/body/surfaceTiles/archive/data/surfaceTileArchiveMaxLevel.ts --dry`,
   then without `--dry`. Its comment (`// 6 B key: 2·23 bits`) goes with it.
2. **Move** (commit `Prep: the archive index format moves to shared homes`). A manifest in the
   scratchpad, a JSON array of `{ "from", "to" }`:

   | From | To |
   | --- | --- |
   | `src/layers/body/surfaceTiles/archive/@types/SurfaceTileArchiveEntry.d.ts` | `src/@types/archive/ArchiveEntry.d.ts` |
   | `src/layers/body/surfaceTiles/archive/@types/SurfaceTileArchiveIndex.d.ts` | `src/@types/archive/ArchiveIndex.d.ts` |
   | `src/layers/body/surfaceTiles/archive/data/surfaceTileArchiveFormat.ts` | `src/data/archive/archiveFormat.ts` |
   | `src/layers/body/surfaceTiles/archive/utils/decodeSurfaceTileArchiveIndex.ts` | `src/utils/archive/decodeArchiveIndex.ts` |
   | `src/layers/body/surfaceTiles/archive/utils/findSurfaceTileArchiveEntry.ts` | `src/utils/archive/findArchiveEntry.ts` |
   | `tools/utils/textures/planSurfaceTileParts.ts` | `tools/utils/archive/planArchiveParts.ts` |
   | `tools/utils/textures/encodeSurfaceTileArchiveIndex.ts` | `tools/utils/archive/encodeArchiveIndex.ts` |
   | `tests/layers/body/surfaceTiles/archive/utils/surfaceTileArchiveIndex.test.ts` | `tests/utils/archive/archiveIndex.test.ts` |

   `npm run move-files -- --manifest <moves.json> --dry`, then without `--dry`. Exit 1 means the
   moves are written: fix each finding and grep for the old path; never re-run.
3. **Rename** (commit `Prep: archive index symbols lose the SurfaceTile prefix`).
   `npm run refactor -- rename --manifest <renames.json> --dry`, then without, entries
   `["<new path>#<old name>", "<new name>"]`: `SurfaceTileArchiveEntry` → `ArchiveEntry`,
   `SurfaceTileArchiveIndex` → `ArchiveIndex`, `decodeSurfaceTileArchiveIndex` → `decodeArchiveIndex`,
   `findSurfaceTileArchiveEntry` → `findArchiveEntry`, `planSurfaceTileParts` → `planArchiveParts`,
   `encodeSurfaceTileArchiveIndex` → `encodeArchiveIndex`. A second manifest with `--no-file-rename`
   for the five constants in `archiveFormat.ts`: `SURFACE_TILE_ARCHIVE_{MAGIC,VERSION,HEADER_BYTES,ENTRY_BYTES,MAX_PART_BYTES}`
   → `ARCHIVE_{…}`. Then by hand, in the same commit: the strings and headers that still say
   SurfaceTile (`planArchiveParts`' error messages, each moved file's `/** name — … */` line),
   `archiveFormat.ts`'s header (an archive index shared by the surface tiles and the volume bricks;
   the magic stays `'STAI'`, its bytes are on R2), and `docs/DATA.md:237`, which names
   `surfaceTileArchiveFormat.ts` (move-files never rewrites docs).
4. `git grep -n 'SurfaceTileArchive\|surfaceTileArchiveFormat\|planSurfaceTileParts\|SURFACE_TILE_ARCHIVE_' -- src tools tests docs packages ':!docs/**/completed/**'`
   leaves only `SURFACE_TILE_ARCHIVE_MAX_LEVEL`, `surfaceTileArchivePath`, `surfaceTileMortonKey` and
   history.

- No new test: moves and renames; the existing archive, tile-source, pack and collect tests ride
  along.
- `npm run typecheck:fast`; `npm run build` (the refactor skill: after a move or an extract);
  `npm test -- archive surfaceTiles collectSurfaceTiles packSurfaceTileLevels`.

**Done when:** the three commits are pure (move, extract, rename), and the tile source's imports
point into `src/@types/archive/`, `src/data/archive/` and `src/utils/archive/`.

---

## Task 3.5: Prep (a), reader — `readArchiveRange`

**Files:**
- `src/@types/archive/ArchiveRangeRead.d.ts` (create)
- `src/utils/archive/readArchiveRange.ts` (create)
- `src/data/archive/archiveFetchDeadlineMs.ts` (create)
- `src/layers/body/surfaceTiles/stream/load/createArchiveTileSource.ts` (modify: `FETCH_DEADLINE_MS`
  `:13` becomes the shared constant for both its fetches; the Range core `:75-92` becomes a call)
- `tests/utils/archive/readArchiveRange.test.ts` (create)
- `tests/layers/body/surfaceTiles/stream/load/createArchiveTileSource.test.ts` (modify)

**Contract.**

```ts
// src/@types/archive/ArchiveRangeRead.d.ts
export type ArchiveRangeRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  /** The server answered 200: it ignored Range. The caller warns once. */
  | { readonly kind: 'no-range' }
  | { readonly kind: 'failed' };

// src/utils/archive/readArchiveRange.ts — one single-span GET with the shared deadline, through the
// HTTP cache. Only a 206 of exactly `entry.length` bytes is 'bytes'; a 200's body is cancelled so a
// whole pack is not downloaded. Throws on length 0: `bytes=o-(o-1)` is not a valid Range.
export function readArchiveRange(
  url: string,
  entry: Pick<ArchiveEntry, 'offset' | 'length'>,
): Promise<ArchiveRangeRead>;

// src/data/archive/archiveFetchDeadlineMs.ts
export const ARCHIVE_FETCH_DEADLINE_MS = 10_000;
```

The tile source keeps its warn-once on `'no-range'`, its `'missing'` and `'empty'` answers and its
`isMissing`. Behaviour is unchanged.

Steps:

- [ ] Move the Range-level cases out of the tile source's test into `readArchiveRange.test.ts`: `a
      short body reads failed` (`:109`) and `cancels the body of a 200 so a whole pack is not
      downloaded` (`:135`, now `'no-range'`). Add `sends one Range header spanning exactly the
      entry` (offset 100, length 50 → `bytes=100-149`, a 206 of 50 bytes reads `'bytes'`), `a
      thrown fetch reads failed`, and `a zero-length entry throws`. The tile source keeps `reads
      failed and warns once when a part answers 200 instead of 206` (`:98`).
- [ ] Implement; the tile source calls it.
- [ ] `npm test -- readArchiveRange createArchiveTileSource surfaceTileStream`.

**Commit:** `Prep: readArchiveRange, the Range read the surface tiles and volume bricks share`

**Done when:** the controller's shot over Copenhagen (the loadtime README's 100 km pose) streams
tiles as main does, and the tile tests pass unchanged apart from the moved cases.

---

## Task 4.1: Extractors write the native d1 tier

**Files:**
- `tools/volumes/extractMcpmCube.py` (modify: `FACTORS` `:57` becomes `(8, 4, 2, 1)`; `write_tier`
  already handles 1 at `:129-130`; the usage lines `:28-29` name `d1`)
- `tools/volumes/extractPolyphormExport.py` (modify: `write_tier(current, 1, meta, export_dir,
  out_prefix)` once, after the native stats print and before the cascade `:154-158`)
- `tools/@types/volumes/VolumePyramidFieldRow.d.ts` (modify: the `npy` doc names `_d1`; no new member)
- `data/raw/mcpm/README.md` (modify: step 3 also writes `mcpm_sdss_d1.npy`, 712 × 1200 × 728 f32,
  2.49 GB, not mirrored to R2)
- `docs/BACKLOG.md` (modify `:174`, "Mirror the 2MRS volume inputs to R2": names MCPM's `d1` too, and
  that both d1 files exceed wrangler's 300 MiB cap)

`tools/deploy/r2/collectExtraFiles.ts:40` keeps its `[8, 4, 2]` list: d1 is too big for wrangler.
No test: Python, outside CI; Task 4.6 checks the outputs.

**Commit:** `Volume extractors write the native d1 tier`

---

## Task 4.2: `readNpyHeader`

**Files:**
- `tools/@types/parsers/NpyHeader.d.ts` (create)
- `tools/parsers/readNpyHeader.ts` (create)
- `tools/parsers/npyReader.ts` (modify: `readNpy` parses its header through `readNpyHeader`)
- `tests/parsers/readNpyHeader.test.ts` (create)

**Contract.**

```ts
// tools/@types/parsers/NpyHeader.d.ts
export type NpyHeader = {
  /** '<f2', '<f4' or '<f8'. */
  readonly dtype: string;
  readonly shape: readonly number[];
  /** Byte offset of the first value: 10 + the v1 header length. */
  readonly dataOffset: number;
};

// tools/parsers/readNpyHeader.ts — from the file's leading bytes (≥ 10 + header length; a v1
// header is at most 65,545 bytes in all). Throws on a bad magic, a major version other than 1,
// fortran_order, a malformed dict, or too few bytes.
export function readNpyHeader(bytes: Uint8Array): NpyHeader;
```

Steps:

- [ ] Tests, on `writeNpy` output (`tools/parsers/npyWriter.ts`):
  - `reads dtype, shape and data offset from the header alone`: a `[2, 3, 4]` `<f4` file, passed
    only its first `dataOffset` bytes; `dataOffset` equals the file length minus 96 (an independent
    property) and is a multiple of 64.
  - `too few bytes for the header throws`.
- [ ] Implement; `readNpy` delegates. Its existing tests pin the rest.
- [ ] `npm test -- readNpyHeader npyReader npyWriter`.

**Commit:** `readNpyHeader: an .npy header without reading the data`

---

## Task 4.3: Brick facts — edge, ids, path, the zero block

**Files:**
- `src/data/volume/volumeBrickEdge.ts` (create)
- `src/utils/volume/brickId.ts`, `src/utils/volume/brickCoordsOf.ts` (create)
- `src/utils/volume/volumeBrickArchivePath.ts` (create)
- `src/@types/data/volume/VolumePyramidFormatRow.d.ts` (modify)
- `src/data/volume/volumePyramidFormats.ts` (modify)
- `tests/utils/volume/brickId.test.ts` (create)

**Contract.**

```ts
// src/data/volume/volumeBrickEdge.ts — a whole number of ASTC 6×6 and BC4 4×4 blocks.
export const VOLUME_BRICK_EDGE = 48;

// src/utils/volume/brickId.ts — the archive key: x fastest, then y, then z.
export function brickId(coords: Readonly<Vec3>, grid: Readonly<Vec3>): number;   // bx + nx·(by + ny·bz)
// src/utils/volume/brickCoordsOf.ts
export function brickCoordsOf(id: number, grid: Readonly<Vec3>): Vec3;

// src/utils/volume/volumeBrickArchivePath.ts — omit `part` for the index.
// `${VOLUME_PYRAMID_DATA_PREFIX}/${id}.${format}.L0.idx` or `….L0.p${part}.pack`
export function volumeBrickArchivePath(id: string, format: VolumePyramidFormat, part?: number): string;

// VolumePyramidFormatRow gains
/** One block that decodes to 0. An all-zero ASTC block is an error block, not zero. */
readonly zeroBlock: Uint8Array;
```

| `format` | `zeroBlock` (bytes) |
| --- | --- |
| `astc6` | `FC FD FF FF FF FF FF FF 00 00 00 00 00 00 FF FF` (void extent, value 0) |
| `bc4` | 8 × `00` |
| `r8` | `00` |

Bytes per brick, `bytesPerRow` and `rowsPerImage` are not new facts: `levelByteLength(48, 48, 48,
TEXTURE_BYTES_PER_TEXEL[gpuFormat])` and the loader's own expressions (`loadVolumePyramid.ts:75-76`)
give 49,152 / 128 / 8 (ASTC), 55,296 / 96 / 12 (BC4), 110,592 / 48 / 48 (r8).

Steps:

- [ ] Test `brick ids are x-fastest and round-trip`: MCPM's grid `[14, 24, 14]`, `(13, 23, 13)` →
      4703 and `(1, 2, 3)` → `1 + 14·(2 + 24·3)` = 1037, worked by hand; `brickCoordsOf` inverts
      both. The ids are keys in files on R2.
- [ ] No test for the path or the zero block: the path is one template both sides share; the zero
      block decodes only on a GPU (acceptance check 13).
- [ ] `npm run typecheck:fast`; `npm test -- brickId pickVolumePyramidFormat`.

**Commit:** `Volume brick facts: edge, ids, archive path and each format's zero block`

---

## Task 4.4: The brick builder

**review: yes** (binary output)

**Files:**
- `tools/volumes/buildVolumeBricks.ts` (create: the CLI)
- `tools/volumes/utils/readNpySlab.ts`, `npyPeak.ts`, `cutBrick.ts`, `brickEntryBytes.ts` (create)
- `tools/@types/volumes/BrickCutLayout.d.ts` (create)
- `package.json` (modify: two scripts)
- `tests/tools/volumes/utils/readNpySlab.test.ts`, `cutBrick.test.ts`, `brickEntryBytes.test.ts`
  (create)

**Contract.**

```ts
// tools/volumes/utils/readNpySlab.ts — x is slowest in C order, so rows [x0, x0 + count) are one
// contiguous span: one positioned read. f32 only (both d1 files); throws otherwise.
export function readNpySlab(fd: number, header: NpyHeader, x0: number, count: number): Float32Array;

// tools/volumes/utils/npyPeak.ts — the raw max over the whole file, read in bounded slabs.
export function npyPeak(fd: number, header: NpyHeader): number;

// tools/@types/volumes/BrickCutLayout.d.ts
export type BrickCutLayout = {
  /** Bytes of one z-slice of the encoded slab. */
  readonly sliceBytes: number;
  /** Bytes of one brick's block rows in one slice: bytesPerRow · rowsPerImage of the format. */
  readonly brickSliceBytes: number;
};

// tools/volumes/utils/cutBrick.ts — brick (by, bz) of an encoded slab one brick wide: per z-slice
// of the brick, the contiguous run at slice · sliceBytes + by · brickSliceBytes.
export function cutBrick(slab: Uint8Array, layout: BrickCutLayout, by: number, bz: number): Uint8Array;

// tools/volumes/utils/brickEntryBytes.ts — what the pack stores for one brick: nothing when every r8
// code is 0, else one gzip member (level 9) of the format's bytes.
export function brickEntryBytes(r8Brick: Uint8Array, formatBrick: Uint8Array): Uint8Array;
```

```jsonc
// package.json — two scripts: npm appends `-- <args>` after the manifest tail (decision 2)
"build-mcpm-bricks": "tsx tools/volumes/buildVolumeBricks.ts mcpm && npm run build-data-manifest",
"build-2mrs-bricks": "tsx tools/volumes/buildVolumeBricks.ts polyphorm-2mrs && npm run build-data-manifest",
```

**The run** (spec §5), per field from its `VOLUME_PYRAMID_FIELDS` row; `buildVolumePyramid.ts` is
untouched:

1. Read the file's leading bytes and `readNpyHeader`; the shape must equal `gridDims` and the dtype
   `<f4`, or throw. The dataBox's x and y dims must be multiples of 48 (MCPM 672 × 1152, 2MRS
   480 × 480), or throw.
2. `npyPeak` must equal the row's `nativePeak` exactly, or throw: the encoding scale would be wrong
   (decision 3).
3. Grid: `ceil(dims / 48)` per axis (MCPM 14 × 24 × 14 = 4704, 2MRS 10 × 10 × 10 = 1000). For each
   `bx`: `readNpySlab(fd, header, originVox[0] + 48·bx, 48)` (MCPM 167.7 MB, 2MRS 138.6 MB);
   `encodeVolumeLevel(slab, [48, gridY, gridZ], { originVox: [0, oy, oz], dims: [48, dy, dz] },
   nativePeak, zeroBelowRaw)`; pad z with zero slices to `nz · 48` (MCPM 648 → 672, 2MRS 464 → 480).
4. Per format: `basisuEncodeLevel(paddedR8, [48, dy, nz·48], format)` for `astc6` and `bc4`, the padded
   r8 itself for `r8`; its length must equal `levelByteLength(48, dy, nz·48, bytesPerTexel)`.
5. Per brick `(by, bz)`: `cutBrick` with `sliceBytes = levelByteLength(48, dy, 1, bpt)` and
   `brickSliceBytes = levelByteLength(48, 48, 1, bpt)`; its length must equal `levelByteLength(48, 48,
   48, bpt)`; key `brickId([bx, by, bz], grid)`; bytes `brickEntryBytes(r8Brick, formatBrick)`.
6. After the last slab, per format: sort by key, `planArchiveParts(…, ARCHIVE_MAX_PART_BYTES)`, write
   each part (concatenated entries) and the index (`encodeArchiveIndex`) to
   `public/data/${volumeBrickArchivePath(id, format[, part])}`. The index lists every brick.
7. Print one table: per format, bricks, occupied, packed bytes, parts, seconds.

Steps:

- [ ] Tests (no basisu, no GPU):
  - `readNpySlab reads x-rows [x0, x0 + count) of a C-order file`: a `[5, 3, 2]` `<f4` file written
    by `writeNpy` into a temp folder, slab `x0 = 2, count = 2`, equals values `2·6 … 4·6 − 1`.
  - `cutBrick takes each slice's run of the brick's block rows`: a slab whose every byte names its
    (slice, row) by value, ASTC shape (`brickSliceBytes` 1024, two bricks tall), brick `(1, 1)` holds
    exactly the bytes of slices 48–95, rows 8–15.
  - `an all-zero brick stores nothing; any other is one gzip member`: zero r8 → length 0;
    a brick with one code 1 → `gunzipSync` gives the format bytes back.
- [ ] Implement.
- [ ] `npm test -- readNpySlab cutBrick brickEntryBytes encodeVolumeLevel`.

**Commit:** `buildVolumeBricks: level-0 bricks from the native grid, read in slabs`

**Done when:** a dry read of the fixture path works in tests; the real run is Task 4.6.

---

## Task 4.5: Deploy rows

**Files:**
- `tools/deploy/r2/dataFamilies.ts` (modify: the `volume-pyramid` row `:43-49`, a new row after it)
- `tests/tools/deploy/r2/dataFamilyOf.test.ts` (modify)

**Contract.**

```ts
// The volume-pyramid row: the index is small, a GET, gzip on the wire as before.
fileName: /^[a-z0-9-]+\.(?:json|(?:astc6|bc4|r8)\.(?:L[1-3]\.bin|L0\.idx))$/,

// New row, right after it:
{
  label: 'volume-bricks',
  dir: 'volume-pyramid/v1',
  fileName: /^[a-z0-9-]+\.(?:astc6|bc4|r8)\.L0\.p\d+\.pack$/,
  transport: 'wrangler',
  // Range-read: Content-Encoding would break the byte offsets, and each brick is already a gzip member.
  gzipOnWire: false,
}
```

The regexes are disjoint, so `dataFamilyOf`'s first match cannot misfile. The content hash the
manifest pass adds makes the packs immutable by name.

Steps:

- [ ] Tests: `a hashed .L0.idx is a volume-pyramid file` (`mcpm.astc6.L0.1a2b3c4d.idx`) and `a hashed
      .L0.p0.pack is a volume-bricks file, not gzipped on the wire` (`polyphorm-2mrs.r8.L0.p0.1a2b3c4d.pack`).
- [ ] `npm test -- dataFamilyOf allowDataFile`.

**Commit:** `Deploy: volume brick packs ride raw, their index with the pyramid`

---

## Task 4.6 (owner): build the bricks for development

No commit: every output is gitignored. Runs while D4 works. **On a missing tool or input, stop and
report; never fake or substitute data.** Never use the newer export
`/Users/rulkens/Polyphorm/export/2026-11-25_16-14-57/` (a different stochastic run).

| Need | Where | Check |
| --- | --- | --- |
| Python venv with pyslime, numpy, scikit-image, astropy | main checkout `.venv/` (`data/raw/mcpm/README.md`, step 1) | `.venv/bin/python -c "import pyslime, skimage"` |
| MCPM trace | main checkout `data/raw/mcpm/trace.bin` (or `.bz2`) | present |
| 2MRS native export | `/Users/rulkens/Development/vendor/cpp/Polyphorm/bin/export/2026-08-13_13-33-58/` | `trace.bin` 1,732,608,000 B and `export_metadata.txt` (1200 × 752 × 960) |
| basisu v2.50.0 | Homebrew `basis_universal` | `basisu -version` |
| RAM and disk | | MCPM ≈ 10 GB peak (its README), 2MRS ≈ 7 GB; 6 GB of new d1 files |

Commands, with `FEATURE` the feature worktree's absolute path:

```bash
caffeinate -dims &                        # stop it with `kill %1` at the end
cd /Users/rulkens/Development/js/skymap   # the main checkout: the trace, the venv, data/raw
shasum data/raw/mcpm/mcpm_sdss_d{2,4,8}.npy > /tmp/mcpm-tiers.sha
.venv/bin/python "$FEATURE/tools/volumes/extractMcpmCube.py"
shasum -c /tmp/mcpm-tiers.sha             # d2/d4/d8 rewritten byte-identical, else stop
python3 "$FEATURE/tools/volumes/extractPolyphormExport.py" \
  /Users/rulkens/Development/vendor/cpp/Polyphorm/bin/export/2026-08-13_13-33-58 \
  data/raw/polyphorm/polyphorm_2mrs       # prints native max=11272, else stop
ls -l data/raw/mcpm/mcpm_sdss_d1.npy data/raw/polyphorm/polyphorm_2mrs_d1.npy   # ≈ 2.49 GB, 3.47 GB
cd "$FEATURE"
mkdir -p data/raw/polyphorm
ln -s /Users/rulkens/Development/js/skymap/data/raw/mcpm/mcpm_sdss_d1.npy data/raw/mcpm/
ln -s /Users/rulkens/Development/js/skymap/data/raw/polyphorm/polyphorm_2mrs_d1.npy data/raw/polyphorm/
npm run build-mcpm-bricks
npm run build-2mrs-bricks
```

- Per-file symlinks, never a directory symlink (DATA.md): the raw READMEs stay committable.
- The feature worktree's `public/data` is linked to main's, so the files land in main's
  `public/data/volume-pyramid/v1/` under logical names; the worktree's manifest pass skips a linked
  folder, and the dev server serves the logical names through the manifest's identity fallback.
  Main's code does not track them (`allowDataFile`), so main's own builds and syncs ignore them.
- The controller records the printed tables in the ledger: 4704 and 1000 index entries per format,
  the occupied counts (MCPM about 2420, an estimate) and the packed sizes (spec §4.4, estimates, not
  a bar).

**Done when:** main's `public/data/volume-pyramid/v1/` holds `mcpm.<fmt>.L0.idx`,
`polyphorm-2mrs.<fmt>.L0.idx` and their parts for all three formats.

---

## Task 5.1: `planDetailRegion`

**review: yes** (the box, reach and fade logic)

**Files:**
- `src/layers/cosmicWebDensity/detailRegion/@types/BrickBox.d.ts`, `DetailRegionFade.d.ts`,
  `DetailRegionState.d.ts`, `DetailRegionPlanInput.d.ts`, `DetailRegionPlan.d.ts` (create)
- `src/layers/cosmicWebDensity/detailRegion/plan/planDetailRegion.ts` (create)
- `tests/layers/cosmicWebDensity/detailRegion/plan/planDetailRegion.test.ts` (create)

**Contract.**

```ts
/** A box of whole bricks, brick coordinates; `hi` exclusive. */
export type BrickBox = { readonly lo: Vec3; readonly hi: Vec3 };

/** The fade (spec §8): `into` and `out` both contain the settled box and meet only in it. */
export type DetailRegionFade = { readonly into: BrickBox; readonly out: BrickBox; readonly w: number };

export type DetailRegionState = {
  /** K bricks per axis around the centre's brick, inside the grid; null before the first frame in reach. */
  readonly target: BrickBox | null;
  /** Every brick inside is in the texture; drawn at weight 1. */
  readonly settled: BrickBox | null;
  readonly fade: DetailRegionFade | null;
  /** False while the eye is beyond the gate distance: the draw value is null, the bricks stay. */
  readonly inReach: boolean;
};

export type DetailRegionPlanInput = {
  readonly grid: Vec3;                          // bricks per axis
  readonly dims: Vec3;                          // the dataBox, native voxels
  readonly bricksPerAxis: number;               // K, from the tier
  /** The eye in native voxels from the dataBox origin, inside the box or not. The region centre
   *  is this point clamped into [0, dims]: the eye itself inside, the nearest point outside. */
  readonly eyeVox: Vec3;
  /** The gate distance in native voxels: the largest target pxPerRad of the frame's views. */
  readonly gateVox: number;
  readonly held: (brick: number) => boolean;    // the stream's isLoaded
  readonly failed: (brick: number) => boolean;  // the stream's isFailed
  /** This frame's fade advance: max(dt / 200 ms, eye travel / half a brick). */
  readonly rampStep: number;
};

export type DetailRegionPlan = {
  readonly state: DetailRegionState;
  /** Target bricks neither held nor failed, nearest first: Chebyshev shell, then Euclidean, from the
   *  centre's brick. */
  readonly wanted: readonly number[];
  /** Boxes drawn this frame (settled, or settled + into + out while fading): their slots stay locked. */
  readonly shown: readonly BrickBox[];
  /** Bricks wanted or a fade running. */
  readonly busy: boolean;
};

export function planDetailRegion(prev: DetailRegionState, input: DetailRegionPlanInput): DetailRegionPlan;
```

**Rules, in order** (spec §6.2):

1. **Centre and target.** `centre = clamp(eyeVox, 0, dims)`; its brick is `floor(centre / 48)`
   clamped to `grid − 1`; the target is K bricks per axis around it, shifted to lie inside the grid.
   From outside it sits against the nearest face, K bricks deep, and slides along that face.
2. **Reach.** `|eyeVox − centre| ≥ gateVox`: out of reach. A ray marches only inside the stored box,
   and the target's part there contains the centre, the box's nearest point to the eye, so no region
   sample could pass the per-ray gate. The target and settled box stay, nothing is wanted, no fade
   advances, `inReach` is false.
3. **Settled.** Last frame's settled box clipped to the new target (the spike's flicker fix), then
   grown by one whole brick layer per face, only by a layer whose every brick is held and none
   failed. Before anything is held, it starts as the centre's brick.
4. **Fade.** A change of the settled box becomes a fade (`into` the grown side at `w`, `out` the
   clipped side at `1 − w`), `w` advanced by `rampStep`; the new box settles when `w` reaches 1. One
   fade at a time.
5. **Wanted.** Target bricks neither held nor failed, nearest first.

Steps:

- [ ] Tests, MCPM's grid `[14, 24, 14]`, dims `[672, 1152, 648]`, K = 5, gate 340 voxels:
  - `the target is K bricks around the centre's brick, shifted inside the grid at both corners`:
    eye at voxel (10, 10, 10) → lo (0, 0, 0), hi (5, 5, 5); eye at (670, 1150, 640) → lo
    (9, 19, 9), hi (14, 24, 14).
  - `an eye outside the box but in reach gets a target against the nearest face`: eye (−100, 600,
    300) → lo.x 0, hi.x 5, y and z around bricks 12 and 6; `inReach` true.
  - `moving parallel to the face slides the target; moving straight away does not`: eye y +96
    voxels → target y +2 bricks; eye x −100 → −200 → same target.
  - `an eye out of reach wants nothing, keeps its target and settled box, and is not in reach`: eye
    (−400, 600, 300), 400 voxels from the face.
  - `settled grows one whole layer per face, only when every brick of the layer is held`.
  - `a failed brick blocks its layer`.
  - `a shift clips settled to the new target and keeps the rest`: the regression the spike measured
    (regrowing from the centre collapsed the region to 36–50% for 3–6 frames).
  - `a change of settled becomes a fade; the new box settles when w reaches 1; shown holds settled,
    into and out meanwhile`.
  - `wanted is nearest first from the centre's brick`: shell order, then Euclidean within a shell.
- [ ] Implement.
- [ ] `npm test -- planDetailRegion`.

**Commit:** `planDetailRegion: the detail region's box, reach, growth and fade, as a pure step`

---

## Task 5.2: `detailRegionDraw` and the tier table

**Files:**
- `src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionGeometry.d.ts` (create)
- `src/layers/cosmicWebDensity/detailRegion/plan/detailRegionDraw.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/data/densityRegionBricksByTier.ts` (create)
- `tests/layers/cosmicWebDensity/detailRegion/plan/detailRegionDraw.test.ts` (create)

**Contract.**

```ts
export type DetailRegionGeometry = {
  readonly dims: Vec3;            // the dataBox, native voxels
  readonly bricksPerAxis: number; // K
  readonly voxelMpc: number;      // the sidecar's
};

/** null out of reach or before anything settled. Boxes to the stored box's local [0,1]³; the
 *  settled box inset half a native voxel so the linear filter never reads past it. */
export function detailRegionDraw(state: DetailRegionState, geometry: DetailRegionGeometry): DetailRegionDraw | null;

export const DENSITY_REGION_BRICKS_BY_TIER = { small: 5, medium: 5, large: 8 } as const satisfies Record<Tier, number>;
```

Steps:

- [ ] Tests:
  - `boxes map to local [0,1]³ with the settled box inset half a native voxel`: settled bricks
    (1, 1, 1)–(3, 3, 3) on MCPM dims → lo.x = (48 + 0.5) / 672, hi.x = (144 − 0.5) / 672.
  - `texScale is the dims over K bricks of 48`: MCPM at K = 5 → (2.8, 4.8, 2.7).
  - `out of reach or with nothing settled draws null`.
- [ ] `npm test -- detailRegionDraw`.

**Commit:** `detailRegionDraw: the planner's state as the draw value; K by tier`

---

## Task 5.3: The toroidal brick store

**Files:**
- `src/layers/cosmicWebDensity/detailRegion/@types/BrickTextureStore.d.ts` (create)
- `src/layers/cosmicWebDensity/detailRegion/load/createBrickTextureStore.ts` (create)
- `tests/layers/cosmicWebDensity/detailRegion/load/createBrickTextureStore.test.ts` (create)

**Contract.**

```ts
export type BrickTextureStore = SlotStore & {
  readonly texture: GPUTexture;
  /** One brick (spec §4.3 layout) into its slot's 48³ box: one writeTexture at origin 48 · slot. */
  write(slot: number, bytes: Uint8Array): void;
};

/** One 3D texture of (K · 48)³ texels, label `density-region-<binBaseName>`, in `format`. Brick
 *  key `String(brickId)`; its slot is fixed by its coordinates, (bx mod K, by mod K, bz mod K), so a
 *  world voxel never moves inside the texture and a shift rewrites only the entering slab. */
export function createBrickTextureStore(
  device: GPUDevice,
  binBaseName: string,
  format: VolumePyramidFormatRow,
  grid: Vec3,
  bricksPerAxis: number,
): BrickTextureStore;
```

| `SlotStore` member | Meaning here |
| --- | --- |
| `allocate(key, frame, liveSince)` | The brick's slot. Free, or held by the same brick: claim it. Held by another brick touched at or after `liveSince`: null, try next frame. Otherwise evict the occupant (the handler runs) and claim. |
| evict handler | The tile stream clears its loaded and failed marks (`tileStreamSubsystem.ts:48-53`); nothing more is needed. |
| `touch`, `slotOf`, `occupiedCount` | As in `src/utils/cache/slotPool.ts`. |
| `destroy` | Destroys the texture (the stream calls it on its own `destroy`). |

`TextureAtlas` (2D bitmaps) and `SlotPool` (LRU picks the slot) do not fit.

Steps:

- [ ] Tests, a mock device, K = 5:
  - `a brick's slot is its coordinates mod K`: bricks (6, 0, 0) and (1, 0, 0) on `[14, 24, 14]` share
    slot (1, 0, 0).
  - `allocate refuses while the occupant was touched at or after liveSince, else evicts once`: the
    handler runs exactly once, with the old key.
  - `write places a brick at 48 · slot with the format's layout`: slot (1, 2, 3), ASTC → origin
    (48, 96, 144), `bytesPerRow` 128, `rowsPerImage` 8, size 48³; r8 → 48 and 48.
- [ ] `npm test -- createBrickTextureStore`.

**Commit:** `Brick texture store: a toroidal SlotStore over one 3D texture`

---

## Task 5.4: The brick fetcher

**Files:**
- `src/layers/cosmicWebDensity/detailRegion/load/fetchVolumeBrick.ts` (create)
- `tests/layers/cosmicWebDensity/detailRegion/load/fetchVolumeBrick.test.ts` (create)

**Contract.**

```ts
/** One brick: `readArchiveRange` (HTTP cache, ruling 10), `DecompressionStream('gzip')` (precedent
 *  `src/data/starCatalog/starBinCodec.ts`), then a length check. null = failed; 'no-range' is
 *  reported once per field by the caller. Never called for a zero-length entry. */
export function fetchVolumeBrick(
  url: string,
  entry: Pick<ArchiveEntry, 'offset' | 'length'>,
  brickBytes: number,
): Promise<Uint8Array | 'no-range' | null>;
```

Steps:

- [ ] Tests, a stubbed `fetch`:
  - `a 206 gzip member yields the brick's bytes`.
  - `a 200 reads no-range`.
  - `a wrong inflated length or a corrupt member fails`.
- [ ] `npm test -- fetchVolumeBrick`.

**Commit:** `fetchVolumeBrick: one Range read, gunzipped and length-checked`

---

## Task 5.5: Region, host, runtime, teardown

**review: yes** (GPU ownership and lifecycle)

**Files:**
- `src/services/loading/volume/fetchVolumePyramidSidecar.ts` (create, from
  `loadVolumePyramid.ts:31-34`)
- `src/services/loading/volume/loadVolumePyramid.ts` (modify: uses it)
- `src/layers/cosmicWebDensity/detailRegion/@types/DetailRegion.d.ts`, `DetailRegionDeps.d.ts`,
  `DetailRegionHost.d.ts`, `DetailRegionHostDeps.d.ts`, `DetailRegionFrame.d.ts` (create)
- `src/layers/cosmicWebDensity/detailRegion/data/detailRegionZeroBricksPerFrame.ts`,
  `detailRegionFetchConcurrency.ts`, `detailRegionFadeMs.ts` (create: 4, 8, 200)
- `src/layers/cosmicWebDensity/detailRegion/load/createDetailRegion.ts`,
  `createDetailRegionHost.ts` (create)
- `src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime.d.ts` (modify: `regions`)
- `src/layers/cosmicWebDensity/create.ts`, `destroy.ts` (modify)
- `tests/layers/cosmicWebDensity/detailRegion/load/createDetailRegion.test.ts`,
  `createDetailRegionHost.test.ts` (create); `tests/layers/cosmicWebDensity/destroy.test.ts` (modify)

**Contract.**

```ts
// src/services/loading/volume/fetchVolumePyramidSidecar.ts
export function fetchVolumePyramidSidecar(binBaseName: string, signal: AbortSignal): Promise<VolumePyramidSidecar>;

export type DetailRegionDeps = {
  readonly device: GPUDevice;
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly requestRender: () => void;
  readonly id: CosmicWebDensityFieldId;
  readonly binBaseName: string;
  readonly bricksPerAxis: number;
};

/** One field's region: sidecar, index, store, stream and plan state; the only writer of that state. */
export type DetailRegion = {
  frame(eye: Readonly<Vec3>, gatePxPerRad: number, frameIndex: number, nowMs: number):
    { readonly draw: DetailRegionDraw | null; readonly busy: boolean };
  /** attachRegion(id, null), then the stream's destroy (which destroys the store and texture). */
  destroy(): void;
};
export function createDetailRegion(deps: DetailRegionDeps): DetailRegion;

export type DetailRegionHostDeps = Omit<DetailRegionDeps, 'id' | 'binBaseName' | 'bricksPerAxis'>;

export type DetailRegionHost = {
  /** Create, keep or tear down each field's region against `wanted` (field id → K), then run each. */
  frame(
    wanted: ReadonlyMap<CosmicWebDensityFieldId, number>,
    eye: Readonly<Vec3>,
    /** The largest target pxPerRad of the frame's views: each region's `gateVox`. */
    gatePxPerRad: number,
    frameIndex: number,
    nowMs: number,
  ): DetailRegionFrame;
  destroy(): void;
};
export function createDetailRegionHost(deps: DetailRegionHostDeps): DetailRegionHost;

export type DetailRegionFrame = {
  /** Every field id; null for a field with no region. */
  readonly draws: Readonly<Record<CosmicWebDensityFieldId, DetailRegionDraw | null>>;
  readonly busy: boolean;
};

// CosmicWebDensityRuntime gains
readonly regions: DetailRegionHost;
```

**A region's life.**

- **Load.** `fetchVolumePyramidSidecar` (an HTTP-cache hit after the base load), then the format's
  index (`pickVolumePyramidFormat(device.features)`, the base's own pick) through
  `decodeArchiveIndex`. An entry count other than the grid's brick count is a broken deploy: no
  region, one warning. A failed sidecar or index: no region until the region is rebuilt, one
  warning. While loading: `draw` null, `busy` true; landing calls `requestRender`.
- **Eye.** Into native voxels through the inverse of `buildCubeModelMatrix(volumePyramidPlacement(sidecar, 1).placement)`
  (the stored box's local [0,1]³) times `dataBox.dims`, inverted once per region.
- **Each frame.** `rampStep = max(dt / DETAIL_REGION_FADE_MS, eye travel in voxels / 24)`;
  `planDetailRegion`; touch every brick inside `shown` at `frameIndex`; for each wanted brick,
  `allocate(key, frameIndex, frameIndex)` (so a slab still drawn, fading out included, is never
  overwritten). A zero-length entry is written as the zero brick (the format's `zeroBlock` repeated,
  built once) through `stream.upload`, at most `DETAIL_REGION_ZERO_BRICKS_PER_FRAME` per frame; any
  other is enqueued with `fetchVolumeBrick`, priority `wanted.length − rank`. A `'no-range'` warns
  once per field and fails the brick. Then `detailRegionDraw`.
- **Stream.** `createTileStreamSubsystem` and `PriorityQueue`, unchanged: this store, `concurrency:
  DETAIL_REGION_FETCH_CONCURRENCY`, `upload: (store, slot, bytes) => store.write(slot, bytes)`, a
  no-op `release`.
- **Attach.** Once the store exists, `renderer.attachRegion(id, store.texture)`; the host's regions
  are the renderer's only `attachRegion` callers.
- **Host.** Builds a region for a new id, destroys one whose id left `wanted` or whose K changed
  (medium ↔ large), keeps it for small ↔ medium.
- **Layer.** `create.ts` builds `regions`; `destroy.ts` destroys them after the slots and before the
  renderer.

Steps:

- [ ] Tests, mock device and stubbed `fetch`:
  - `an index whose entry count is not the grid's leaves the region empty with one warning`.
  - `an empty brick is written as the zero brick without a fetch, at most 4 per frame`.
  - `teardown detaches the texture before destroying it`: `attachRegion(id, null)` precedes
    `texture.destroy`.
  - Host: `a tier switch that changes K rebuilds the region; small ↔ medium keeps it`.
  - `destroy.test.ts`: `the regions are destroyed before the renderer`.
- [ ] Implement; `loadVolumePyramid` uses the extracted sidecar fetch.
- [ ] `npm run typecheck:fast`; `npm test -- detailRegion cosmicWebDensity loadVolumePyramid`.

**Commit:** `Detail regions: the host, one region per pyramid field, streaming bricks into a borrowed texture`

---

## Task 5.6: The once planner and its wiring

**Files:**
- `src/layers/cosmicWebDensity/detailRegion/plan/detailRegionPlanner.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/present/densityFadeOpacityOf.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/data/cosmicWebDensityTargetScale.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/present/deriveCosmicWebDensityLiveness.ts` (modify: the
  opacity through `densityFadeOpacityOf`; `regionOf` reads the planner's value)
- `src/layers/cosmicWebDensity/layer.ts` (modify: `:36` reads the constant; `:44` the planners)
- `src/data/rendering/frameSections.ts` (modify: PRELUDE, after `surface-tiles` `:25`)
- `tests/layers/cosmicWebDensity/detailRegion/plan/detailRegionPlanner.test.ts` (create)

**Contract.**

```ts
export function detailRegionPlanner(
  runtime: CosmicWebDensityRuntime,
): Extract<FrameContentPlanner<DetailRegionFrame, 'cosmicWebDensity'>, { scope: 'once' }>;
// name 'cosmic-web-density-region', fade 'cosmicWebDensity'

/** Each field's handed fade times the Layer's focus emphasis: one reading for the planner and the
 *  liveness, so the planner never builds a bundle whose regionOf reads its own unpublished value. */
export function densityFadeOpacityOf(
  snapshot: ReadyFrameContext,
  fade: Readonly<Record<CosmicWebDensityFieldId, number>>,
): (id: CosmicWebDensityFieldId) => number;

export const COSMIC_WEB_DENSITY_TARGET_SCALE = 3;
```

```ts
// layer.ts:44
planners: (runtime) => [cosmicWebDensityAccumulationPlanner(runtime), detailRegionPlanner(runtime)],

// frameSections.ts, PRELUDE, after `surface-tiles`:
// Once for every view: a dome's faces share one detail region, keyed by the anchor eye.
{ kind: 'plan', name: 'cosmic-web-density-region' },
```

- **Wanted.** Each source row with `storage: 'pyramid'` whose opacity and clamped intensity are
  above 0 and whose slot has committed, at `DENSITY_REGION_BRICKS_BY_TIER[state.tier]`.
- **Eye** `views[0].drawCamPos`; **gate** the largest `view.drawPxPerRad /
  COSMIC_WEB_DENSITY_TARGET_SCALE` over `views` (decision 6); `state.frameIndex`, `snapshot.nowMs`.
- **Votes.** `awake: busy`; `loading: busy && views[0].stillFrames > 0` (as
  `planVolumeAccumulation`): motion never holds `settled()`, a shot at rest waits for the region.
- **Value** `DetailRegionFrame`. `deriveCosmicWebDensityLiveness` builds
  `regionOf = (id) => ctx.snapshot.plans.get(<the planner>).draws[id]`; PRELUDE runs before SCENE,
  so the per-view accumulation row (`frameSections.ts:104`) always finds this frame's value.
- The renderer still ignores `regionOf` (Task 6.1 reads it): bricks stream, pixels do not change.

Steps:

- [ ] Test `a busy region holds loading only at rest`: `stillFrames` 0 → `loading` false, `awake`
      true; `stillFrames` 3 → both true. Guards a shot or `settled()` hanging while the camera moves.
- [ ] Implement and wire.
- [ ] `npm run typecheck:fast`; `npm test -- cosmicWebDensity frameSections`.

**Commit:** `Detail-region planner: once per frame in PRELUDE, its value read by the key and the march`

**Done when** (controller, MCPM inside at large on the feature server): the network shows
`.L0.idx` and `.L0.p*.pack` reads for both fields, the Memory panel shows `density-region-mcpm` and
`density-region-polyphorm-2mrs` at spec §9's bytes, no WebGPU validation error, and the image still
matches main (RMS ≤ 0.1 of 255).

---

## Task 6.1: Renderer — group 2, three pipelines, the region block

**review: yes** (TS↔WGSL layout)

**Files:**
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify: the sampler `:91-98`
  stays the base's; the layouts `:109-139`; the pipeline `:142`; `draw` `:329`, the per-field loop
  `:423-424`; `destroy` `:428`)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify: declarations only; the march reads
  nothing new until Task 6.2)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modify)
- `tests/services/gpu/renderers/volumeField/volumeUniformsLayout.parity.test.ts` (modify)

**WGSL.**

```wgsl
struct RegionUniforms {
  settledLo: vec3<f32>, voxelMpc: f32,
  settledHi: vec3<f32>, fadeW: f32,
  texScale: vec3<f32>,
  intoLo: vec3<f32>,
  intoHi: vec3<f32>,
  outLo: vec3<f32>,
  outHi: vec3<f32>,
};
@group(2) @binding(0) var<uniform> region: RegionUniforms;
@group(2) @binding(1) var regionTex: texture_3d<f32>;
@group(2) @binding(2) var regionSampler: sampler;
override REGION: u32 = 0u;   // 0 base only, 1 steady, 2 fading
```

| Offset | Member | Type | From `DetailRegionDraw` |
| --- | --- | --- | --- |
| 0 | `settledLo` | vec3<f32> | `settledLo` |
| 12 | `voxelMpc` | f32 | `voxelMpc` |
| 16 | `settledHi` | vec3<f32> | `settledHi` |
| 28 | `fadeW` | f32 | `fade.w` (0 when steady) |
| 32 | `texScale` | vec3<f32> | `texScale` |
| 48 | `intoLo` | vec3<f32> | `fade.intoLo` (0 when steady) |
| 64 | `intoHi` | vec3<f32> | `fade.intoHi` |
| 80 | `outLo` | vec3<f32> | `fade.outLo` |
| 96 | `outHi` | vec3<f32> | `fade.outHi` |
| 108 | (implicit pad to 112) | | |

No explicit pad members (decision 7). Groups 0 and 1 and the 304 B block are unchanged.

- **Pipelines.** Three from one module and one layout `[group0Bgl, fadeBgl, group2Bgl]`, `REGION`
  set through `fragment.constants`; WGSL counts a binding as used whatever an override's value, so
  all three share the layout. The decay pipeline is untouched.
- **Region sampler.** `addressModeU/V/W: 'repeat'`, linear, no mip filter.
- **Placeholder group 2.** Renderer-owned: a 1³ `r8unorm` texture (label
  `density-region-placeholder`) and a zeroed 112 B buffer, bound for every field without a region;
  freed in `destroy`.
- **Per field.** A 112 B region buffer and, while a texture is attached, a group 2 of it, the
  attached texture's view and the region sampler, rebuilt on `attachRegion`.
- **`draw`.** Per field: `r = regionOf(id)`; pipeline 0 when `r` is null or no texture is attached,
  1 when `r.fade` is null, else 2; write the block when > 0; `setPipeline`, then `setBindGroup(2,
  …)`. Pipeline 0 is today's march exactly: the spike measured an empty region branch at +0.1 ms,
  which is why it is compiled out.

Steps:

- [ ] Renderer tests (spec §12):
  - `a field with no region draws the base pipeline with the placeholder group 2`.
  - `a region without a fade picks the steady pipeline; with a fade, the fading one`.
  - `a region value with no attached texture draws the base pipeline`.
  - `attachRegion(id, null) drops the binding; a base re-upload keeps it; destroy never destroys a
    region texture`.
- [ ] Parity test, a second block: `every RegionUniforms field lands at its offset`, a fake
      `DetailRegionDraw` with a distinct sentinel per member, read back from the region buffer's
      `writeBuffer`; `struct.size` is 112.
- [ ] `npm run typecheck:fast`; `npm test -- volumeField volumeUniformsLayout`.

**Commit:** `Volume renderer: a region bind group and three pipelines picked per field`

**Done when:** with every region value forced null (scratch), MCPM inside matches main (RMS ≤ 0.1),
and no WGSL compile error is logged for any of the three pipelines.

---

## Task 6.2: The steady march

**review: yes** (shader)

**Files:** `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify: `fs_main` `:188-326`)

**Per ray** (`REGION != 0u`, after `intersectUnitAabb` `:196`): one ray–box intersection with
`[settledLo, settledHi]`, its far end capped at `tGate = pxPerRad · voxelMpc / |M · dir|`, the
length `fragment.wesl:227-228` already computes for the LOD. Beyond `tGate` a pixel spans more than
one native voxel, so the base serves it. Task 2's faster test form replaces this if it won.

**Per step:** one interval test on `rayDistance`; inside, `textureSampleLevel(regionTex,
regionSampler, samplePos * region.texScale, 0.0).r` at gain 1, no clamp; outside, today's base read
(`:239-240`). Exactly one volume read either way. The comments this touches come under budget.

Steps:

- [ ] Implement. No new test: the image checks are the controller's (no GPU in CI).
- [ ] `npm test -- volumeUniformsLayout volumeField`.
- [ ] Controller, after the commit: MCPM inside and 2MRS inside at large, converged, visibly sharper
      than main inside the box and identical outside it (one look, no bar yet); at the just-outside
      pose `a,-239.45,-16.5,201.3,0.5,0.3,350,0` the box shows against the near face; no WGSL error.

**Commit:** `Volume march reads the detail region at native resolution inside its box`

---

## Task 6.3: The fading march

**review: yes** (shader)

**Files:** `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify)

- **Per ray** (`REGION == 2u`): the settled intersection, plus the same for `into` and `out`, each
  capped at `tGate`.
- **Per step:** inside settled, the region read; inside `into` but not settled, `mix(base, region,
  fadeW)`; inside `out` but not settled, `mix(base, region, 1 − fadeW)`; elsewhere the base read.
  `into` and `out` meet only in settled, so no sample is in both shells.
- The fade's state and boxes already come from Task 5.1; at rest a fade is pixel-identical to none.

Steps:

- [ ] Implement. No new test.
- [ ] Controller: one shift at the MCPM knot pose fades out, then in, about 0.45 s in all; the pops
      metric is acceptance check 8.

**Commit:** `Detail-region fade: three boxes, one weight`

---

## Task 6.4 (controller): count the reads in the final WGSL

No commit except the ledger. Fetch the linked module from the feature dev server, `curl -s
'<server>/src/services/gpu/shaders/scalarVolume/fragment.wesl?static'`, and count, per `REGION`
value and per branch of the step loop, every `textureSampleLevel`, `textureSample` and
`textureLoad` reachable per step and per ray. The counts must equal the "Shader price" table above;
any extra read sends the change back to D6 before acceptance.

---

## Task 7.1: Docs

**Files:** `docs/DATA.md`, `docs/RENDERER.md`, `docs/DEPLOY.md`, `data/raw/mcpm/README.md`. No test.

- **DATA.md:** the `volume-pyramid/v1/` layout line (`:48`) gains `<id>.<fmt>.L0.idx` and
  `<id>.<fmt>.L0.p<N>.pack`; "Cosmic-web volumes" (`:195`) gains the brick grid (48³, from the
  dataBox origin, z zero-padded), the d1 inputs, `build-mcpm-bricks` / `build-2mrs-bricks`, and that
  both run only on the owner's machine (backlogged); the refresh-orders rows (`:309-310`) gain the
  brick builds.
- **RENDERER.md:** the density-volume bullet (`:53`) gains the detail region (a once planner in
  PRELUDE, a borrowed texture through `attachRegion`, group 2, the gate distance, the box clamped
  against the nearest face from outside); landmines beside `:101`: the ASTC zero block is a
  void-extent block (all-zero is an error block); the placeholder group 2 (WGSL counts a binding as
  used whatever an override's value); region samples are at gain 1; the repeat sampler and the
  half-voxel inset.
- **DEPLOY.md:** beside "Edge caching" (`:171`): volume bricks are Range-read raw (`gzipOnWire:
  false`) and immutable by content hash.
- **`data/raw/mcpm/README.md`:** already carries d1 from Task 4.1; check the wording only.
- Plain sentences, the files' own density.

**Commit:** `Docs: the detail region, its bricks and its landmines`

---

## Task 7.2 (owner): data to R2

Before acceptance (check 6 reads production, decision 10) and so before the merge: a merge to main is
the app deploy (Workers Assets builds on push). Re-run if the fix round (Task 7.4) changes what the
builder writes; the new packs get new hashed names, the old ones stay on R2 unreferenced and are
listed in the PR body for a later prune.

In the main checkout, whose tree must be clean (`git status --short` shows nothing tracked):

```bash
cd /Users/rulkens/Development/js/skymap
git fetch origin
git checkout --detach origin/feat/volume-detail-region
git diff --quiet main -- package-lock.json && echo "no dependency change: no npm ci"
caffeinate -dims &
npm run build-mcpm-bricks      # each ends in build-data-manifest, which hashes the L0 files
npm run build-2mrs-bricks
npm run sync-r2-secure
git checkout main
```

- The manifest pass only runs in a checkout whose `public/data` is real, which is why this is the
  main checkout (spec §14). The sync must run clean: on 2026-11-26 it aborted at the Mars tiles, and
  #1180 re-baked them to v3 for that; if any group aborts, the data manifest is not up and the merge
  waits.
- The syncing machine must have built the bricks, or the offline inventory throws for an empty
  `volume-bricks` group (DEPLOY.md:49).
- **Check:** `curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-15'
  https://skymap-data.rulkens.com/data/<a hashed .L0.p0.pack path from manifest.json>` prints 206.
- Back on `main`, the checkout's `manifest.json` names files main's code does not request; that is
  harmless until the merge.

---

## Task 7.3 (controller): acceptance checks 1–14

No commit except the ledger. Scratch patches carry `// delete when Task 7.3 is done`, never
committed.

**Servers** (every tool call passes `--url` for its server):

| Server | What |
| --- | --- |
| Main | a scratch `git worktree add --detach … origin/main`, `node_modules` and `public/data` symlinked, its own port |
| Feature | the feature worktree, its own `npm run dev` port |
| Production data | the feature worktree, `VITE_DATA_BASE_URL=https://skymap-data.rulkens.com npm run dev -- --port <p>` (check 6) |

**Poses** (spec §13), with
`layers=-survey,-structureRing,-cosmicWebFilaments,-zoneOfAvoidance,-starCatalog,-milkyWayDisk,-label`:
MCPM inside `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0`, knot `a,-132.82,18.99,67.28,0.5,0.3,20,0`;
2MRS inside `a,21.27,21.07,36.88,0.5,0.3,30,0`, dense `a,43.3,38.2,44.2,0.5,0.3,60,0`; just outside
the inside poses' targets at `…,350,0` (40–60 Mpc outside the MCPM box, 60–75 Mpc outside 2MRS's);
outside `…,600,0` (2MRS in reach, MCPM at its edge); far `…,2000,0`. Each shot asserts its fetched
files: the base level file, and `.L0.p*.pack` reads where a region is expected. Timing uses Task 1's
rig; Task 1's numbers are "step 1".

| # | Check | Bar |
| --- | --- | --- |
| 1 | Memory: the ledger rows per region texture at each tier, per format seen | spec §9 to the byte: per field K = 5 ASTC 6,144,000 / BC4 6,912,000 / r8 13,824,000; K = 8 25,165,824 / 28,311,552 / 56,623,104; the placeholder 1 B |
| 2 | Per-draw cost, Mac | MCPM large inside and knot ≤ 0.55 ms; 2MRS large inside ≤ 0.59 ms; medium ≤ the large bar at the same pose; just outside and 600 Mpc (each run records whether the region drew) ≤ that field's inside bar; far ≤ 1.02 × step 1; fading ≤ 1.04 × steady (MCPM), ≤ 1.13 × (2MRS); 120 fps (8.33 ms) held everywhere. Re-based only with the owner's OK if Task 2 moved the spike rows |
| 3 | Phone, small | moving at MCPM inside on the OnePlus ≤ 1.10 × step 1's small; the picked format recorded |
| 4 | Sharper | converged, region vs main at the same tier, MCPM inside and knot, 2MRS inside and dense: mean Sobel gradient of luminance in the region's footprint ≥ 1.25 × main's |
| 5 | Never dimmer | same footprint: mean luminance ≥ main's − 0.5 of 255 |
| 6 | Fill time | Production data server, cold HTTP cache, arrival at MCPM inside to `busy` false: K = 5 ≤ 2 s, K = 8 ≤ 4 s on the Mac, through the HTTP cache (shipped) and with `no-store` (a scratch patch on `readArchiveRange`), each in ms; plus 12 concurrent Range reads into one part both ways (BACKLOG.md:179's case); K = 5 on the phone over Wi-Fi ≤ 5 s. First guesses: the numbers go to the owner, who rules on switching (ruling 10) |
| 7 | No seam at rest | knot pose, box edge in view, converged: in region-on minus region-off no pixel row along the projected edge is brighter or darker than both neighbours across it by more than 2 of 255 |
| 8 | Pops | the spike's metric (`tools/spike/flickerFade.ts:139-155` in the spike worktree, read only): 2MRS 90° orbit at 200 Mpc, no pop over 0.5, largest jump ≤ 0.5; the tour path, largest jump ≤ 0.3 |
| 9 | Failure paths | scratch `page.route`s, no file touched: index 404, one part 404, a part answering 200, a corrupt gzip member. Each: one warning, the base draws, the other field unaffected, no validation error, no lost frame, memory back to the base after teardown |
| 10 | Dome | `?dome`: the region in all five faces, no seam at the joins; the key equal across views every frame |
| 11 | Tier switching | small → medium → large → small: small ↔ medium fetches no brick and shows no flash; medium → large rebuilds at K = 8 and the old texture leaves the ledger; the ledger matches check 1 after each step |
| 12 | Teardown | a field switched off: after its fade-out tail its region row leaves the ledger and no upload follows; the Layer destroyed frees both regions and the placeholder |
| 13 | Zero block | a scratch readback of a slot written with the zero brick reads 0 in all three formats (ASTC, BC4 by the feature filter of Task 1, r8) |
| 14 | From just outside | each volume's just-outside pose at large, converged: pack reads asserted, check 5's bar in the footprint |

A breach halts and goes to the owner. **Owner set** (one dash ask, one check per item, main LEFT and
branch RIGHT, one section or a 1:1 crop each, a deep link per pair): check 4's MCPM inside and 2MRS
dense, check 7's pair, check 14's two pairs (box outline in view), check 10, check 11, and check 6's
numbers with the switch question.

**Results** go into the ledger, a "Results" section at the end of this plan, and the PR body.

---

## Task 7.4: Whole-branch review and one fix round

One reviewer on the top tier, given the whole diff, this plan and the spec. Mandate: spec fidelity
and slop (surplus helpers, dead paths, tests that restate code, comments over budget). Every touched
file is held to its conventions **whole**, not just its changed lines: `.wesl` → the `wesl-shaders`
skill; `src/services/gpu/` → RENDERER.md and `docs/superpowers/conventions/renderers.md`; tests →
testing.md; comments → comments.md; spike-derived code included. One fix round by D6's implementer;
no re-review. If the fix touches the builder's output, Task 7.2 runs again.

---

## Task 7.5 (controller): landing

- `/comment-audit`, then `deletion-audit` (findings triaged per leanness.md), then `/feature-done`:
  plan, spec and ledger move to `completed/` in the PR (feature-done before merge).
- CI green (`gh pr checks`), watched in the background after every push.
- The merge ask, only once Task 7.2's sync is done and verified. Squash-merge on the owner's word.
- Scratch worktrees (`scratch-pre-1178`, `scratch-box-7pct`, acceptance's main) and their dev servers
  are removed in the same step. The spike worktree stays.

---

## Risks

- **The region now draws from outside, where the spike's cost was highest.** At the 600 Mpc pose the
  spike measured 0.66 ms per draw against the base's 0.45 with the region on; ruling 9 draws it there
  for 2MRS (and MCPM at its reach edge, both further on a 2× display). Task 2 times the better test
  form at that pose, and its gate halts the plan if it stays over 0.55 ms.
- **Small tier on the phone.** A region over a quarter-res base: cost, edge step and format unmeasured
  until check 3. A breach goes to the owner (options: K = 4 on small, or no region on small).
- **Cold fills queue in the HTTP cache** (ruling 10's cost): check 6 measures it against `no-store`.
- **Dawn's lazy clear.** The first partial write clears the whole level through one staging buffer
  (25.2–56.6 MB at K = 8); the hitch is unmeasured.
- **One-machine rebuild.** Until the inputs are mirrored (backlogged), only the owner can rebuild
  level 0.

## Landing and deploy notes (also in the PR body)

- Data first: Task 7.2's sync lands before the merge; the merge is the app deploy.
- Gap: none. The files are additive: an old app ignores the new manifest entries, and a new app
  without them (only if the merge ran first) draws the base with one warning per field.
- The kiosk mirrors the new packs (about 264 MB, estimate); its local server answers Range. No
  desktop build ships with this PR.
- Nothing leaves R2; packs from a superseded build (Task 7.2 re-run) are listed for a later prune.

## Definition of Done

**Deliverable inventory**
- Types: `DetailRegionDraw`; `VolumeFieldLiveness.regionOf`; `ArchiveEntry`, `ArchiveIndex`,
  `ArchiveRangeRead`; `BrickBox`, `DetailRegionFade`, `DetailRegionState` (with `inReach`),
  `DetailRegionPlanInput`, `DetailRegionPlan`, `DetailRegionGeometry`, `BrickTextureStore`,
  `DetailRegion`, `DetailRegionDeps`, `DetailRegionHost`, `DetailRegionHostDeps`,
  `DetailRegionFrame`; `NpyHeader`, `BrickCutLayout`; `VolumePyramidFormatRow.zeroBlock`;
  `CosmicWebDensityRuntime.regions`.
- Constants: `VOLUME_BRICK_EDGE`, `DENSITY_REGION_BRICKS_BY_TIER`,
  `DETAIL_REGION_ZERO_BRICKS_PER_FRAME`, `DETAIL_REGION_FETCH_CONCURRENCY`, `DETAIL_REGION_FADE_MS`,
  `COSMIC_WEB_DENSITY_TARGET_SCALE`, `ARCHIVE_*`, `ARCHIVE_FETCH_DEADLINE_MS`,
  `SURFACE_TILE_ARCHIVE_MAX_LEVEL` in its own file.
- Functions: `readArchiveRange`, `decodeArchiveIndex`, `findArchiveEntry`, `planArchiveParts`,
  `encodeArchiveIndex`, `brickId`, `brickCoordsOf`, `volumeBrickArchivePath`, `planDetailRegion`,
  `detailRegionDraw`, `createBrickTextureStore`, `fetchVolumeBrick`, `fetchVolumePyramidSidecar`,
  `createDetailRegion`, `createDetailRegionHost`, `detailRegionPlanner`, `densityFadeOpacityOf`,
  `readNpyHeader`, `readNpySlab`, `npyPeak`, `cutBrick`, `brickEntryBytes`.
- Renderer: `attachRegion`; group 2 with the 112 B `RegionUniforms`; three pipelines by `REGION`; the
  placeholder group 2; the steady and fading march in `fragment.wesl`.
- Build and deploy: `tools/volumes/buildVolumeBricks.ts`, `npm run build-mcpm-bricks` and
  `build-2mrs-bricks`; the extractors' d1 tier; the `volume-pyramid` regex with `L0.idx` and the
  `volume-bricks` row.
- Wiring: the `cosmic-web-density-region` row in PRELUDE; the planner in `layer.ts`.
- Docs (spec §15) and backlog: the dated prune line, the timing item deleted, the mirror item naming
  MCPM's d1.
- Task 1, Task 2 and Task 7.3 results in the ledger, the plan's Results section and the PR body.

**Smoke pass** (the owner's, through the dash; shots by `npm run shot -- '<link>' --url <feature server>`)
- MCPM inside and knot, 2MRS inside and dense, at large: sharper than main inside the box, the same
  outside it, never dimmer.
- Just outside each volume: the box shows against the near face; moving along the face slides it
  with a fade, no pop.
- Flying out past the gate distance: the region stops fetching; flying back is instant.
- A shift at rest: fade out, fade in, about 0.45 s, then convergence.
- Tier switch small → medium → large → small: no flash; small ↔ medium fetches no brick.
- Dome: the region in all five faces, no seam.
- One pack part missing: one warning, that field's base draws, the other field's region is intact.
- Memory panel: `density-region-mcpm` and `density-region-polyphorm-2mrs` at §9's bytes.

**Deferral boundary (out of scope).** Mips in the region; an app-side brick cache; target-centred or
frozen regions; debug panel rows; the dust volume and the workbench cube; a finer 2MRS export;
mirroring the d1 inputs to R2; aborting in-flight fetches; a volume-arrival milestone in
`tools/loadtime`; switching brick reads to `no-store` (the owner's call on check 6); deleting any
spike code.
