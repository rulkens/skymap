# Layer M1: single-Layer files leave core, one PR per Layer

**Goal.** Move every core file whose only user is one Layer into that Layer, so `src/@types`, `src/utils`,
`src/data` and `src/services` hold only what core or two or more Layers share. This ships the leftovers
sweep's M1, the S2 format moves, M2 (the galaxy and star detail cards), M4 (the `TIPS` split) and M6 (the
galaxy provenance debug section). That clears four ledger rows and shrinks the two J16 type-reader rows.

**Source.** `docs/backlog/2026-10-29-layer-migration-leftovers.md` (M1, M2, M4, M6, S1–S7). An owner-set
check at main `03972d396` produced the per-Layer move manifests in
[`2026-11-02-layer-m1-moves/`](2026-11-02-layer-m1-moves/). The check walks the relative-import graph over
`src/`, `tools/`, `tests/` and the website, and walks back through core-only importers. A file may move
only when it has exactly one Layer owner, no `tools/` importer and no core root.

**Ground preparation.** None is needed, because M1 is itself the ground preparation for the per-kind ledger
work: it lands no feature, and its only design choices are the rulings below.

## Rulings this plan carries

| Date | Ruling |
|---|---|
| 2026-10-29 | One PR per Layer, carrying its M1, S2, extras and any M2/M4/M6 part. Ride-alongs are yes: delete the dead types `FocusState`, `WirePointSourceDeps` and `ComposedSources`, and accept the M6 DebugPanel reorder. |
| 2026-10-29 | `tools/` may import a Layer's format and registry files (S2). |
| 2026-10-29 | `volumeFieldRenderer` and `createScalarVolumePass` stay in core, for reuse by the Edenhofer dust Layer. |
| 2026-11-02 | #932 is not merging soon, so ignore it. The octree stack (S3) stays in core. |
| 2026-11-02 | Files that became single-Layer after the original list are sorted by the STAYS rules: generic helpers (S5) stay. Of the tools-shared files, only the S2 formats and registries move. |
| 2026-11-02 | A moved helper lands in a new Layer `utils/<area>/` folder that mirrors `src/utils/<area>/`. |
| 2026-11-02 | Cadence: the structure Layer goes first as the pilot, then the rest run three PRs at a time. |

The Layer contract does not change. Every M-item uses an existing member, such as `ui: { slot: 'detailCard' }`
or `ui: { slot: 'debug' }`. If a task seems to need a new or wider member, stop and report it.

## Where a file lands

The manifests already apply these rules. They are listed here so a reviewer can check a manifest line, and so
a file added by hand follows the same rules.

| From | To |
|---|---|
| `src/@types/**/T.d.ts` | `src/layers/<L>/@types/T.d.ts` (flat; Layer `@types/` has no subfolders) |
| `src/utils/<area>/f.ts` | `src/layers/<L>/utils/<area>/f.ts` (`src/utils/f.ts` goes to `src/layers/<L>/utils/f.ts`) |
| `src/data/**/x.ts` | `src/layers/<L>/data/x.ts` (flat, like the existing Layer `data/` folders) |
| `src/services/**`, `src/state/**` | the Layer folder its importers sit in (`render/`, `load/`, `present/`, `ui/`), mapped per file in the generator; a Layer's `state/` holds slice files only (`tests/conventions/layerStateShape.test.ts`) |
| `src/components/**/<Card>/` | `src/layers/<L>/ui/<Card>/` (M2 and M6) |

## Per-PR recipe

Every Layer task below runs this recipe. Its PR is a draft off `origin/main`, opened from an isolation worktree.

1. **Refresh.** Run `git merge origin/main`, then `npm run move-files -- --manifest docs/superpowers/plans/2026-11-02-layer-m1-moves/<L>.json --dry`.
   If a `from` path no longer exists, delete that entry from the manifest in this PR and say so in the PR body.
2. **Move: one commit, nothing but the move.** Run `npm run move-files -- --manifest docs/superpowers/plans/2026-11-02-layer-m1-moves/<L>.json`.
   Never use `git mv` with hand-edited imports, and never an ad-hoc ts-morph or sed import rewrite.
3. **Blind spots: one commit.** `move-files` misses these:
   - `?worker`, `?url` and `?raw` import specifiers. A stale path still passes `tsc` and `vite build`, and breaks only at runtime.
   - String-literal paths: a generator's output path, `vi.mock(...)` paths, `new URL(...)`.
   - `.module.css` files beside a moved component (`move-files` is TS-only; `git mv` the CSS in the move commit), CSS `@import`, and `composes … from` paths in CSS modules. A stale CSS specifier passes `tsc`.
   - `.wesl` `package::` imports, and the website's `.astro`/`.mdx` imports.
   - Allow-lists that hold paths as strings, such as `tests/helpers/conventions/inlineTypeFiles.ts` and `CORE_ALLOWED`.

   Grep `src tools tests packages .claude docs/*.md` for every moved basename's old path and fix what is live. Leave history alone: completed plans, completed specs and grill transcripts.
4. **Owner drift.** A typecheck or `layerImportBoundary` failure saying a core file imports a moved file means that file
   gained a core user after `03972d396`. Move it back with `npm run move-files -- <to> <from>`, delete its manifest
   entry, and name it in the PR body. Don't add a `CORE_ALLOWED` row to keep it moved.
5. **Ratchet and ledger.**
   - Delete each `CORE_ALLOWED` entry (in `tests/conventions/layerImportBoundary.test.ts`) whose file left core, or lower its count.
   - In `src/compositions/README.md`, delete each ledger row whose core table is gone, and remove the moved files from the two "id-domain types (type-only core readers)" rows.
   - Recount the tally line from the table; never by arithmetic.
6. **Gates.**
   - `npm run typecheck`, the full `npm test` and `npm run format` all pass.
   - The lost-header grep `git diff origin/main...HEAD -U0 | grep -E '^@@ -1,[0-9]+ \+1(,[0-9]+)? @@'` comes back empty. A hit is a lost module header, unless the file never had one.
7. **PR body.** List the moved file count and lines, any dropped manifest entries, owner-drift reversions, ledger and `CORE_ALLOWED` changes, and the smoke links for the Layer.

Moves earn no new tests (see `testing.md`). Mirrored tests travel with their files through `move-files`, but faceted tests
(`foo.facet.test.ts`) don't. Add their manifest entries by hand when `--dry` leaves one behind.

## Tasks

### Task 1 (pilot): structure, 11 files, 374 lines, plus the `TIPS` split mechanism

**Files:**
- [`structure.json`](2026-11-02-layer-m1-moves/structure.json): 10 M1 files plus the S2 `structureCatalogFormat.ts`.
- `src/components/InfoCard/tooltips.tsx` (modify).
- New `src/@types/components/infoCard/TipContent.d.ts`.
- New `src/layers/structure/ui/structureTips.tsx`.
- `src/layers/structure/ui/StructureDetailCard/StructureDetailCard.tsx` (modify).
- `src/layers/README.md` (modify).
- The ledger and `CORE_ALLOWED` per recipe step 5.

**Steps:**
- **Recipe.** Run steps 1–7. `projectMarkerCategoryVisibility` lands in `src/layers/structure/ui/`, beside its only user (a Layer's `state/` holds slices only, per `layerStateShape`).
- **`TIPS` split mechanism (M4).**
  - The inline `TipContent` type in `tooltips.tsx` becomes `src/@types/components/infoCard/TipContent.d.ts`, because core and Layers share it.
  - The keys only the structure card reads (`structureDistance`, `structureRadius` and the other structure-only keys; grep `TIPS.` under `src/layers/structure`) move to `src/layers/structure/ui/structureTips.tsx` as `export const STRUCTURE_TIPS = { … } as const satisfies Record<string, TipContent>;`.
  - The card reads `STRUCTURE_TIPS.<key>` with no `!`; the typed keys are the ruling.
  - A key stays in core `TIPS` only if a second card reads it (grep `TIPS.<key>` across `src/`). `memberCount` turned out structure-only.
  - Core `TIPS` keeps its `Record<string, TipContent>` shape until the last Layer split (Task 7) types it too.
- **README (`src/layers/README.md`).** Add a `utils/` row to "Where things go": the Layer's own helpers, `utils/<area>/<fn>.ts`, one function per file, mirroring `src/utils/`. Under the existing `@types/` bullet, note that the Layer's own settings and renderer types live there.

**Done:** none of the 11 manifest `from` paths exists, no structure-only key is left in core `TIPS`, and `StructureDetailCard` has no `TIPS.*!`.

**Smoke:**
- Open a galaxy cluster card: `#focus=galaxy-cluster-virgo-m87`.
- Check the Distance, Radius and Galaxies tooltips open; on `#focus=galaxy-cluster-coma-a1656`, the Abell tooltip too.
- Check the structure ring labels draw and the category toggles in the Structures section still hide rings.

### Task 2 (batch A, three PRs in parallel): blackHoles, cosmicWebFilaments, localBubble

- **blackHoles:** [`blackHoles.json`](2026-11-02-layer-m1-moves/blackHoles.json), 8 files, 325 lines, including the ride-along `packBlackHoleLensingUniforms`. Smoke: `#focus=body-sgr-a-star`, where the lensing ring still bends the backdrop.
- **cosmicWebFilaments:** [`cosmicWebFilaments.json`](2026-11-02-layer-m1-moves/cosmicWebFilaments.json), 8 files, 204 lines, including the S2 `filamentBinaryFormat` (imported by `tools/`). Smoke: Filaments toggle on, seen from 300 Mpc.
- **localBubble:** [`localBubble.json`](2026-11-02-layer-m1-moves/localBubble.json), 7 files, 231 lines, including the S2 `shellMeshFormat`. Smoke: Local Bubble shell visible from 1 kpc.

### Task 3 (batch B): flow, cosmicWebDensity, zoneOfAvoidance

- **flow:** [`flow.json`](2026-11-02-layer-m1-moves/flow.json), 14 files, 507 lines, including the ride-along `createReseedLatch` and the S2 `flowFieldConstants`. Smoke: the Cosmic Flows exhibit (`#exhibit=cosmicFlows`), where streamlines animate.
- **cosmicWebDensity:** [`cosmicWebDensity.json`](2026-11-02-layer-m1-moves/cosmicWebDensity.json), 14 files, 604 lines, including the S2 `scalarFieldPalettes`. `volumeFieldRenderer` and `createScalarVolumePass` stay, as ruled. Smoke: the Cosmic Web exhibit (`#exhibit=cosmicWeb`).
- **zoneOfAvoidance:** [`zoneOfAvoidance.json`](2026-11-02-layer-m1-moves/zoneOfAvoidance.json), 9 files, 223 lines. Smoke: the Zone of Avoidance exhibit (`#exhibit=zoneOfAvoidance`).

### Task 4 (batch C): constellations, lightTime, satellites

- **constellations:** [`constellations.json`](2026-11-02-layer-m1-moves/constellations.json), 5 files, 86 lines. Smoke: constellation lines and names on, at Earth home.
- **lightTime:** [`lightTime.json`](2026-11-02-layer-m1-moves/lightTime.json), 3 files, 39 lines. `lightTimeSpheres` moving deletes the "light-time spheres table" ledger row. Smoke: light-time spheres on.
- **satellites:** [`satellites.json`](2026-11-02-layer-m1-moves/satellites.json), 9 files, 85 lines: the satellite settings types and `src/data/satellites/*`. Smoke: `#focus=satellite-25544` (ISS), where the satellite sweep and class labels still draw.

### Task 5 (batch D): earthScenes, cosmicHorizon, milkyWay

- **earthScenes:** [`earthScenes.json`](2026-11-02-layer-m1-moves/earthScenes.json), 1 file. `earthSceneBodyIds` moving deletes the `EARTH_SCENE_BODY_IDS` ledger row. Smoke: one Earth scene deep link from `src/layers/earthScenes/bodies/`.
- **cosmicHorizon:** [`cosmicHorizon.json`](2026-11-02-layer-m1-moves/cosmicHorizon.json), 1 file (`CosmicHorizonSettings`). Smoke: `#exhibit=observableUniverse`.
- **milkyWay:** [`milkyWay.json`](2026-11-02-layer-m1-moves/milkyWay.json), 14 files, 550 lines: the v1 helpers go to `render/` and `present/`, and `milkyWayFacts` moving deletes the "Milky Way facts" ledger row. It also takes its M4 part: the 7 Milky Way-only keys (`sunToCentre`, `milkyWayStars`, `milkyWayMass`, `oldestStars`, `galacticYear`, `centralBlackHole`, `morphology`) move to `src/layers/milkyWay/ui/milkyWayTips.tsx` the way Task 1 did it. `diameter` stays in core `TIPS` (shared with `GalaxyDetailCard`), so `MilkyWayDetailCard` keeps `TIPS.diameter!` until Task 7. Blind spot: `src/services/engine/galaxyGenerator/v1/README.md` names the moved v1 helpers by bare name; repoint it. Smoke: the Milky Way card's tooltips.

### Task 6 (batch E): missions, body, starCatalog

**missions:**
- Manifest: [`missions.json`](2026-11-02-layer-m1-moves/missions.json), 64 files, 1,199 lines, including the ride-alongs `missionCameraFrame`, `missionOffsetsOfView`, `missionViewDirection`, `composeContactDecalMatrices` and `packContactShadowUniforms`.
- Blind spot: `tools/bodies/buildSpacecraftTracks.ts:36` writes `src/data/missions/missionEvents.generated.ts` by path, so repoint `EVENTS_PATH` and its header comment.
- Smoke: Voyager (`#exhibit=voyager-missions`), with the timeline and contact shadows.

**body:**
- Manifest: [`body.json`](2026-11-02-layer-m1-moves/body.json), 38 files, 1,165 lines: M1 plus the S2 body texture and surface-tile registries, the `SurfaceTile*` types and `src/utils/surfaceTiles/*`.
- Blind spot: `tools/textures/writeBodyAtlas.ts:93,201,204` writes `bodyAtlas.generated.ts` by path.
- Smoke: `#focus=body-mars`, where surface tiles stream, and the Earth slider fields.

**starCatalog:**
- Manifest: [`starCatalog.json`](2026-11-02-layer-m1-moves/starCatalog.json), 23 files, 1,371 lines, including the S2 `starCatalogFormat` and `starBinCodec`, and the ride-alongs `starTintFromBpRp` and `starOctreeFromSkst`.
- M2, star half:
  - `src/components/InfoCard/{StarDetailCard,CompactStarCard}/` move to `src/layers/starCatalog/ui/`. `git mv` each `.module.css` in the move commit, and repoint its `composes … from '../cardChrome.module.css'` / `'../compactChrome.module.css'` and the TSX's `import styles from '../cardChrome.module.css'` to `../../../../components/InfoCard/…`, as `src/layers/structure/ui/StructureDetailCard/` already does.
  - The star astro utils only the card reads move to `src/layers/starCatalog/utils/astro/`: `deriveStarProperties`, `starTeffK`, `starTeffCoefficients`, `starLuminositySolar`, `starRadiusSolar`, `isGiantStar` and `bolometricCorrectionG`. `starWikipediaTitle` goes to `utils/format/`.
  - Add a `{ slot: 'detailCard', content: { type: 'starCatalog', Detail, Compact } }` row to `src/layers/starCatalog/layer.ts`, and drop the `starCatalog` arm of `CORE_DETAIL_CARDS` (`src/components/InfoCard/detailCardTable.ts:25-28`). Change the line 2 header ("core's two FocusableTarget arms") and the line 19 comment ("The two kinds") to one kind.
  - Add a manifest file for these moves (`starCatalog-m2.json`) and run it as its own move commit.
- M4: the 13 star keys move to `src/layers/starCatalog/ui/starTips.tsx`.
- Smoke: a seeded star card (`#focus=star-sirius`) with its tooltips, and the star field at NEAR0.

### Task 7: galaxyCatalog, last and alone

- **Manifest:** [`galaxyCatalog.json`](2026-11-02-layer-m1-moves/galaxyCatalog.json), 92 files, 3,329 lines, including the S2 `galaxyCatalogFormat` and `tierTargets`.
- **Blind spot:** `buildPointInterleavedBuffer.worker.ts` is imported with a `?worker` suffix, so repoint it by hand and check that the bake runs in the dev server.
- **M2, galaxy half:**
  - `GalaxyDetailCard/` and `CompactCard/` move to `src/layers/galaxyCatalog/ui/`, their `.module.css` handled as in Task 6 (`git mv`, repoint `composes … from` and the TSX's chrome imports). `GalaxyProvenanceSection.module.css` likewise: `composes: muted from './debugSection.module.css'` needs repointing.
  - Add a `detailCard` row to `layer.ts`.
  - Delete `CORE_DETAIL_CARDS` and its spread in `detailCardTable`.
  - Fix the "two kinds no Layer claims" doc comment.
- **M6:**
  - `GalaxyProvenanceSection` (+ css), `GalaxyProvenanceSectionContainer`, `sumProvenanceCounts`, `provenanceFilter` and `GalaxyProvenanceSettings` move into the Layer, following the destination rules.
  - The section becomes a `{ slot: 'debug' }` `ui` row, and the DebugPanel reorder is accepted.
  - This deletes the `GalaxyProvenanceSectionContainer` ledger row.
- **M4:** the 12 galaxy-only keys (`distance`, `hubbleVelocity`, `lookback`, `earthEra`, `ra`, `dec`, `redshift`, `apparentMag`, `absoluteMag`, `colour`, `orientation`, `agnClass`) move to `src/layers/galaxyCatalog/ui/galaxyTips.tsx`; `diameter` stays core as the one shared key. Core `TIPS` then keeps only body and shared keys; type it `as const satisfies Record<string, TipContent>` and drop every remaining `TIPS.*!`.
- **Ride-along:** delete the dead types `FocusState`, `WirePointSourceDeps` and `ComposedSources` with `npm run refactor -- delete <file>#<symbol>`.
- **Backlog close-out, in this PR:**
  - Delete the M1, M2, M4 and M6 sections, their summary-table rows and the "Appendix: M1 files per Layer" from `docs/backlog/2026-10-29-layer-migration-leftovers.md`.
  - Update `docs/BACKLOG.md`'s line for it.
  - Move this plan and its manifests to `docs/superpowers/plans/completed/`.
- **Smoke:**
  - A famous galaxy card: M31 picked from the palette, then reload the `#focus=` link it writes, with its tooltips and thumbnail.
  - The debug panel's Galaxy provenance section.
  - A tier switch, where the galaxies re-anchor.
  - The full-survey view at 700 Mpc.

## Definition of Done

**What exists:**
- Every path in the 17 manifests (321 files, about 10,300 lines) and the M2/M6 extras lives under its Layer. No `from` path exists at HEAD, except entries dropped as owner drift and named in a PR body.
- `src/layers/<L>/utils/<area>/` exists where helpers moved, and `src/layers/README.md` has its row.
- `CORE_DETAIL_CARDS` is gone. The galaxy and star cards arrive through each Layer's `ui` `detailCard` row.
- `TIPS` is split. `structureTips`, `milkyWayTips`, `starTips` and `galaxyTips` live in their Layers with typed keys. Core `TIPS` holds body and shared keys only, and no `TIPS.*!` is left.
- The ledger rows `GalaxyProvenanceSectionContainer`, `EARTH_SCENE_BODY_IDS`, light-time spheres and Milky Way facts are deleted. The two id-domain type-reader rows list only the files still in core. `CORE_ALLOWED` shrank and has no new row.

**Observable behaviours (smoke, per PR, listed in its task):**
- Galaxy, star, structure and Milky Way cards with their tooltips.
- The provenance debug section.
- The Cosmic Flows, Cosmic Web, Zone of Avoidance, Voyager and Observable Universe exhibits.
- Mars surface tiles, satellites and lensing.
- A tier switch.
- The galaxy bake worker runs.

**Deferred:**
- J1–J14, and M8 (the palette arms).
- S1 (the v2 field), S3 (octree), S4–S7, and any tools-shared file that is not S2.
- The kind-B per-kind ledger rows (selection-kind facts, captions, sky captures and the rest).
- The Layer→Layer `initialState` imports noted in the DAG backlog item.
