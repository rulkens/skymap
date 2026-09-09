# Deletion audit — plan 1 (LiDAR end to end), PR #665, `d33744869..ef20eb0a9`

Greenfield method: the Phase-1 sketch was written from the spec alone before the
diff was opened (`§5` below records where it was naive and where it was right).
Baseline verified green: `npx vitest run tests/tools/scene-workbench
tests/tools/scene-recon tests/tools/utils/io` → 24 files, 64 tests, all passing.

Diff size: 4,801 insertions across 92 files. Realistic removable surplus:
**~220 LOC (4.6%)** excluding the cross-tool probe extraction, **~420 LOC** with
it. The surplus concentrates in **tests, not src** — 177 of the 220.

Honest headline: this is a lean diff. Most of what looked deletable on first
pass turned out to be documented landmine handling. Nothing here is a
correctness finding.

---

## 1. SAFE-NOW — pure deletions, no behaviour change

Ranked by LOC × confidence.

### S1. Delete `tests/tools/scene-workbench/state/viewSlice.test.ts` — 45 LOC (tests)

Two cases, both already covered or explicitly out of scope:

- `toggleAssetVisibility` (`:8-19`) — `tests/tools/scene-workbench/ui/LayerList.test.tsx:46-63`
  asserts the identical store outcome (`hiddenAssetIds` gains then loses the id)
  through the real component and the real store. Strictly stronger.
- `commitCameraPose` clamp (`:21-44`) — a clamp-boundary test, the exact class
  spec §9 lists under "Deliberately not tested". It is also a byte-copy of
  `tests/tools/mcpm-workbench/state/viewSlice.test.ts` with `PITCH_LIMIT`
  imported instead of hard-coded.

Verified safe: this is the only test consumer of `defaultViewSlice` and of
`PITCH_LIMIT`; both stay exported and used by `createSceneInput.ts:15,92`.
Risk: none. Confidence: high.

### S2. Trim `nextManifest.test.ts:68-84` — "keeps an untouched sibling asset by reference" — 17 LOC (tests)

`tests/tools/scene-recon/manifest/upsertAsset.test.ts:50-67` pins exactly this
contract (`result.assets[0]).toBe(a1)` etc.) on the function that actually
implements it. `nextManifest` is a 15-line wrapper that spreads `current?.assets`
and delegates; it cannot break sibling identity without `upsertAsset` breaking
first. The two cases above it (stale anchor/name refresh, null `current`) are
`nextManifest`'s own contract and stay.

Risk: none. Confidence: high.

### S3. Shrink `LasHeaderInfo` to `{ pointCount }` — 7 LOC (5 src, 2 tests)

`tools/scene-recon/lidar/validateLasHeader.ts:12-18` returns five fields.
Grepped every consumer: `fetchDhm.ts:134` and `:173` read `header.pointCount`
and nothing else. `minZ`/`maxZ`/`pointDataRecordLength`/`offsetToPointData` are
read by nobody — `minZ`/`maxZ` are asserted only by
`validateLasHeader.test.ts:44-45`, i.e. a test pinning fields no production code
consumes.

Delete `pointDataRecordLength`, `offsetToPointData`, `minZ`, `maxZ` from the type
and the `:63-66` return; the locals stay (the corrupt-Z guard at `:48` and the
byte-size formula at `:52` still need them). Drop the two test assertions.

Risk: none — the validation logic is untouched. Confidence: high.

### S4. Delete `writeJsonAtomic.test.ts:62-69` — "writes pretty JSON with a trailing newline" — 8 LOC (tests)

`expect(text).toBe(`${JSON.stringify({ value: 'pretty' }, null, 2)}\n`)` is the
implementation's own expression (`writeJsonAtomic.ts:27`) compared against
itself. A mirror test by construction. The other three cases (re-read at call
time, null on absent, no stranded temp) are the file's real contract.

Risk: none. Confidence: high.

### S5. Comment trims — ~18 LOC (src), no behaviour

All are what-restating headers, not landmines/units/contracts:

| File | Lines | Cut | Why |
| --- | --- | --- | --- |
| `src/main.tsx:1-5` | 5 cmt / 6 code | −4 | Restates the two statements below it ("imports global.css, then mounts App"). |
| `scene-recon/pack/pointCloudFormat.ts:1-6` | 6 / 4 | −3 | Re-spells the four constants it precedes and duplicates spec §5's table. |
| `utils/io/redactSecret.ts:1-6` | 6 / 4 | −3 | First sentence restates `split/join`; keep the "every URL-derived message must pass through this" clause, which is the contract. |
| `render/renderResources.ts:4-9` + `:24-29` | 12 / 22 | −4 | The module header and `disposeScene`'s header both state the epoch-staleness contract. Keep one. |
| `@types/SceneAsset.d.ts:3-8` | 6 / 2 | −4 | Keep "one-member union so plans 2–4 add cases" (it defends against a future "simplify to a bare alias"). Drop the `PhotoPose` paragraph — it documents a type that does not exist. |

Ratio audit (comment lines vs code lines per file) flagged nothing else outside
the mirroring-mandate fence; `store/hooks.ts`, `store/types.ts`,
`sagaContextRegistered.ts` and `sagaContext.ts` are over-ratio but explicitly
accepted as MCPM parity.

### S6. Stale plan-task references in comments — 4 LOC (2 src, 2 tests)

The plan is now archived, so a bare task number names nothing:

- `src/scene/parsePoints.ts:3` — "task 14's GPU upload uses this layout verbatim"
- `src/render/uploadPointCloud.ts:6` — "the renderer (task 14) owns the pipeline"
- `tests/…/manifest/upsertGroup.test.ts:3` — "task 9 writes through it directly"

Ledger line 125 ruled the same class in `bakeLidar.ts` a comment-only fix folded
into the archive commit; these three were missed. **Do not** sweep the `plan 2` /
`plans 2–4` references (`rootReducer.ts:7`, `rootSaga.ts:7`, `SceneAsset.d.ts:4`)
— those record why a structure is deliberately empty, which is exactly what a
future reader would otherwise "fix".

### S7. `store/hooks.ts:15` — delete `useAppStore` — 3 LOC (src)

Zero callers anywhere under `tools/scene-workbench/`. Grepped `tools/` and
`src/`: `mcpm-workbench` uses it (`ControlsPanel.tsx:69`), `flow-workbench` and
`galaxy-renderer` use their own; this tool never does. The mirroring mandate is
file-for-file parity of `store/`, not export-for-export.

Also drops `useStore` from the `react-redux` import and `SceneStore` from the
types import. Precedent: the ledger already deleted `fps`/`setFps` and
`reloadRegistryRequested` on this exact reasoning ("plan 2 re-adds them with the
HUD that reads them").

Risk: low — plan 2's HUD may want it back, at a cost of 2 lines. Confidence: high.

### S8. `store/sagaContext.ts:9` — drop `canvas` from `SceneSagaContext` — 3 LOC (src)

Grepped for `getContext(…'canvas')` across the tool: no hits. `watchGroupSaga`
reads only `resources`. mcpm's `watchSceneSaga.ts:118` does read it, which is why
the shape was copied. `Viewport.tsx:136`'s call becomes
`registerSagaContext({ resources })`; `canvas` stays as a local there (the input
rig and `resizeCanvasToDisplay` need it).

Risk: none — nothing reads the field. Confidence: high.

### S9. `readPdalCsv.ts:28-30` — inline `csvContext` — 3 LOC (src)

A named helper wrapping a one-line template literal, used twice in the same file.
The indirection is larger than the thing it hides.

Risk: none. Confidence: high. (Lowest value on the list; listed for completeness.)

**SAFE-NOW total: ~32 src, ~76 tests = 108 LOC.**

---

## 2. NEEDS-RULING — behaviour, debug surface, or cross-tool reach

### N1. `upsertGroup.ts` + `upsertGroup.test.ts` collapse into `upsertAsset`'s shape — ~49 LOC (14 src, 35 tests)

`tools/scene-recon/manifest/upsertAsset.ts` and `manifest/upsertGroup.ts` are the
same nine lines twice: `findIndex` on `id`, `map`-replace or append, spread the
container. `upsertGroup.test.ts`'s own header is the tell —

> "a same-type bug (e.g. comparing the wrong field) needs its own catch here
> rather than riding on upsertAsset's coverage"

— which is the duplication being noticed and rationalized rather than removed.

Two shapes, smallest first:

- **(a)** One `tools/utils/collection/upsertById.ts` (one-symbol-per-file, ~10
  LOC) with one test; `upsertAsset`/`upsertGroup` disappear into their two call
  sites (`nextManifest.ts:18`, `bakeLidar.ts:134`). Net ≈ −16 src, −85 tests +
  ~25 new test = **−76**.
- **(b)** Keep `upsertAsset` (plan 3's nudge endpoint wants it by name), delete
  `upsertGroup.ts` and its test, and inline the two-line list upsert at
  `bakeLidar.ts:133-139`. Net ≈ **−49**.

This is not a braid: both call sites want "replace-or-append by id in an
immutable list, preserving sibling identity" — one concern, one shape.
**Ruling needed** on (a) vs (b) vs neither.

### N2. Delete `tests/tools/scene-workbench/viteConfig.smoke.test.ts` — 39 LOC (tests)

`expect(resolved.server?.port).toBe(5600)` restates `DEV_PORTS.sceneWorkbench` —
and prep-P2 made that table the SSoT precisely so the number stops being copied.
The plugin-name sniff has a real target (no wesl plugin ⇒ `?static` imports do
not resolve), but `npm run scene-workbench:probe` imports *this exact config
file* (`probeGpuErrors.ts:82`), boots a real page, compiles the real shader and
fails loudly — so the smoke test's failure mode is already covered by a gate that
also proves the shader links. 15 of the 39 lines are a comment explaining a
`typeof === 'function'` cast.

**Ruling needed**: it mirrors `tests/tools/mcpm-workbench/viteConfig.smoke.test.ts`,
so deleting it breaks a cross-tool convention rather than just a file.

### N3. Trim `lidarPipelineStages.test.ts` to 3 of 6 cases — ~22 LOC (tests)

Delete `names the source CRS on every reader` (`:54-58`),
`crops in the ortho's degree frame` (`:71-76`), `colorizes with scale 1`
(`:78-84`). Each asserts a literal string back at the builder that produced it —
they can only catch an accidental edit, never a wrong design.

Keep: `orders crop and colorization before the metre reprojection` (order is the
load-bearing property and the module header says so),
`drops every listed classification with AND semantics` (the ledger's own
`filters.expression` ruling), and `writes the anchor into the topocentric
coordinate-operation pipeline` (real interpolation logic, not a constant).

**Ruling needed**: the file's stated premise — "PDAL isn't installed in CI so pin
the option strings byte-for-byte" — is a defensible if weak stance, and it was
accepted at task-review time.

### N4. Extract the probe harness — ~200 LOC removable from this PR (separate follow-up PR)

`parseArgs`, `findFreePort`, `startDevServer`, `launchChromium`,
`installGpuProbe`, `drainGpuErrors`, `settleFrames`, `formatConsole`, `summarize`
and `main`'s report block are near-verbatim across three files:

| File | LOC |
| --- | --- |
| `tools/galaxy-renderer/probeGpuErrors.ts` | 2,618 |
| `tools/mcpm-workbench/probeGpuErrors.ts` | 823 |
| `tools/scene-workbench/probeGpuErrors.ts` (new) | 407 |

`diff -u` between the two smaller ones is 628 lines, and almost all of it is the
tool-specific `buildSteps` queue — the infra is a copy. Extracting
`tools/utils/probe/` is precisely the move prep-P1 made for `tools/utils/http/`
(the second special case of plumbing that was never generic).

Net: **−200 in this PR, ≈ −400 across the repo**, at the cost of one new ~200-LOC
shared module and touching two shipped tools.

**Ruling needed**: this is a follow-up PR, not a deletion inside #665. Flagged
because it is by far the largest single item in the audit.

### N5. `probeGpuErrors.ts:40-61` — the `--url` / `--headed` flags — ~22 LOC (src)

`--url`'s own doc-comment reads *"Escape hatch only. Empty = self-host, which is
the point"*. Nothing in the repo passes either flag; `package.json`'s
`scene-workbench:probe` passes none. Knobs with no callers.

**Ruling needed**: sibling parity is the only argument for keeping them, and if
N4 lands they die there instead. Low priority on its own.

### N6. `renderResources.test.ts:39-49` — fold "idempotent second dispose" into case 1 — 9 LOC (tests)

After the first `disposeScene` the map is empty and `depthTexture` is null, so
"destroys nothing twice" is structurally guaranteed by the code the first case
already exercises. The surviving claim — *epoch bumps even over an empty scene* —
is a real documented contract (it is `acceptLoadedAsset`'s staleness token) and
deserves one assertion, not its own `it` with its own fixture.

**Ruling needed**: this shaves a test that guards a trap listed in §4 below.

### N7. `tests/…/scene/resolveAssetUrl.test.ts:16-19` — 5 LOC (tests)

`expect(resolveAssetUrl(path)).toBe(dataUrl(path))` calls the same function the
implementation calls; it can only fail if the `ABSOLUTE_URL` regex starts
matching plain paths. The blob-passthrough case above it is the real one and
stays. (The ledger fenced `resolveAssetUrl` itself — this is about the test.)

### N8. `sceneCamera.parity.test.ts:117-118` — 2 LOC (tests)

`expect(at('viewProj')).toBe(0)` and `expect(at('rightM')).toBe(16)` restate the
layout the same test parsed four lines earlier. The finite/non-zero block check
at `:121-123` is the real assertion in that case and stays.

### N9. Delete `tests/tools/utils/io/redactSecret.test.ts` — 18 LOC (tests)

Both assertions contain exactly one occurrence of the secret, so the test cannot
catch the one plausible regression (a `replace` that only replaces the first
occurrence). It restates `split(secret).join('<redacted>')` against a literal.

**Ruling needed explicitly**: it guards a secret-leakage property. Deleting a
security-shaped test on a leanness argument should be a conscious yes, not a
default. My read is that the *call sites* in `fetchDhm.ts` are what matter and
they are not tested either way — but that is the user's call.

**NEEDS-RULING total (excluding N4): ~14 src, ~102 tests = 116 LOC.**

---

## 3. Ranked summary

| # | Item | LOC | Confidence | Bucket |
| --- | --- | ---: | --- | --- |
| N4 | probe harness extraction (follow-up PR) | 200 | high | ruling |
| N1 | `upsertGroup`/`upsertAsset` dedup | 49 | med-high | ruling |
| S1 | delete `viewSlice.test.ts` | 45 | high | safe |
| N2 | delete `viteConfig.smoke.test.ts` | 39 | med | ruling |
| N3 | trim `lidarPipelineStages.test.ts` | 22 | med | ruling |
| N5 | probe `--url`/`--headed` | 22 | med | ruling |
| S5 | comment trims ×5 | 18 | high | safe |
| N9 | delete `redactSecret.test.ts` | 18 | med | ruling |
| S2 | trim `nextManifest.test.ts` case 3 | 17 | high | safe |
| N6 | fold `renderResources.test.ts` case 2 | 9 | med | ruling |
| S4 | `writeJsonAtomic.test.ts` newline case | 8 | high | safe |
| S3 | shrink `LasHeaderInfo` | 7 | high | safe |
| N7 | `resolveAssetUrl.test.ts` case 2 | 5 | med | ruling |
| S6 | stale `task N` comment refs | 4 | high | safe |
| S7 | `useAppStore` | 3 | high | safe |
| S8 | `SceneSagaContext.canvas` | 3 | high | safe |
| S9 | inline `csvContext` | 3 | high | safe |
| N8 | parity-test offset restatements | 2 | med | ruling |

**Net removable — src / tests split:**

- SAFE-NOW: **32 src + 76 tests = 108**
- NEEDS-RULING, excl. N4: **14 src + 102 tests = 116**
- Combined, excl. N4: **~224 LOC of 4,801 (4.7%)** — 46 src, 178 tests.
- With N4: **~424 LOC**, but spanning two shipped tools and a new shared module.

The shape of the finding: **the src is close to minimal; the tests carry ~4× the
surplus per line.** That is consistent with the spec's own §9, which named the
three test anti-patterns (clamp boundaries, constant restatements, mocked
subprocess plumbing) and then shipped two of the three.

---

## 4. Do-NOT-remove traps

Things a leanness pass would plausibly delete and must not:

1. **`disposeScene`'s unconditional `resources.epoch += 1`**
   (`renderResources.ts:37`). Over an empty scene it looks like a no-op; it is
   the staleness token `acceptLoadedAsset` compares against, and the only guard
   for a dispose that happens *without* saga cancellation (Viewport unmount).
2. **`watchGroupSaga.ts:64`'s `cancellation` object declared outside the `try`.**
   Moving it inside is the obvious tidy and silently breaks cancellation: the
   `finally` is a separate block scope, and the promise continuation reads the
   flag live after the generator has unwound.
3. **`resolveAssetUrl`'s regex bypass** (`scene/resolveAssetUrl.ts:9`). Deleting
   it and calling `dataUrl` directly kills only `?probe` — and no vitest test
   exercises that path, so the suite stays green while
   `npm run scene-workbench:probe` dies.
4. **`watchRegistrySaga.ts:37`'s `content-type` sniff.** Reads as belt-and-braces
   beside the 404 check; under `vite dev` an absent `scenes.json` returns 200 +
   `index.html`, so removing it turns "no bake yet" into a JSON parse error
   instead of the empty state.
5. **`writeSceneCamera.ts:40` (`viewportH`) and `:41` (`eyeM`).** Fenced as
   documented-dead-in-v1. Note the trap shape: the parity test asserts them, so
   deleting them fails a test rather than a frame, which reads as "the test was
   wrong".
6. **`lidarPointRenderer.ts:94-97`'s `loadOp: 'clear'` + `clearValue`.** Looks
   like a misplaced concern inside a point pass; it is the frame's only pass, so
   a zero-asset scene presents garbage without it (documented at `:6-8`).
7. **`tools/scene-workbench/tsconfig.json:5`'s `"exclude": []`.** An empty array
   that looks like a no-op; it overrides the base config's excludes.
8. **`quote_header: false`** (`lidarPipelineStages.ts:75`). PDAL quotes the CSV
   header by default and `readPdalCsv:44` compares it byte-for-byte.
9. **`bakeLidar.ts:101-103`'s `finally { rm(csvPath) }`.** Removing the CSV in a
   `finally` (not after the loop) is the fix from task 9's review round — a
   throwing read used to strand a multi-hundred-MB file.

---

## 5. Where my Phase-1 sketch was naive (and where it was right)

Sketch at
`/private/tmp/…/scratchpad/phase1-sketch.md`, written from the spec alone:
~1,900 src / ~270 tests. Actual: ~2,400 src (excluding the 407-line probe and the
READMEs) / ~1,100 tests.

**Naive — the actual is right and my sketch would have shipped a bug:**

- **Ortho colorization.** I budgeted "one GeoTIFF path argument". The GeoDanmark
  harvest is bare `<x>/<y>.jpg` on skymap's equirect grid with no georeferencing
  at all, so `orthoVrtXml.ts` (70 LOC) is mandatory — including the
  `existsSync` gate, whose absence paints black over ground PDAL never saw. My
  sketch had no equivalent and no way to discover the need short of a bad bake.
- **`filters.reprojection → EPSG:4326` before the crop.** I had no such stage. I
  would have cropped UTM coordinates against WGS84 degree bounds and got an empty
  or wrong extent, silently.
- **`filters.range` for the class drop.** My sketch named the obvious PDAL stage;
  the OR-semantics trap the ledger records is exactly what it would have hit.
- **Resume/verification in `fetchDhm`.** My "file exists && pointCount > 0" is
  strictly weaker than the offset + count × recordLength byte formula. And the
  "header Z bounds are garbage on every real Punktsky tile" regression case is
  live-evidence knowledge my sketch could not have contained.
- **Empty state.** I sized it at 30 LOC of copy and never considered that Vite's
  SPA fallback answers 200 + `index.html` for an absent `scenes.json`. My version
  would have shown "Failed to load the scene registry" on a fresh checkout — the
  wrong message at exactly the moment the tool most needs the right one.
- **`?probe` without baked data.** I assumed the probe would need a real bake,
  which would have made `scene-workbench:probe` unrunnable in CI. The
  `syntheticProbeScene` + blob-URL + `resolveAssetUrl` trio is a better design
  than mine, and `resolveAssetUrl` exists only because of it.
- **`metresPerPx = 2·tan(fovY/2)/height` scaled by clip `w`.** I would have sized
  point quads in world units and got edge-of-screen points visibly wrong.
- **`ENU_UP_BASIS` as a determinant-+1 axis cycle.** My sketch said "rotate the
  Y-up decode into Z-up" without noticing that the cheap y/z swap is a mirror.
  The ledger shows the implementation hit that exact defect and fixed it; my
  sketch would have hit it too and not known.

**Right — the actual carries surplus my sketch did not:**

- I had no `useAppStore`, no `SceneSagaContext.canvas`, and `LasHeaderInfo`
  returning only what the caller reads. All three are surplus in the actual
  (S3, S7, S8).
- My sketch's test section said, in advance: *"I would NOT test slice reducers,
  the clamp, registry rows, the PDAL argv, or the config."* The diff carries
  `viewSlice.test.ts` (a clamp test), `viteConfig.smoke.test.ts` (a port-constant
  restatement) and three PDAL-argv literal cases. Those are three of my four
  highest-confidence findings, and they landed exactly where the sketch
  predicted — which is the strongest signal in this audit that they are real
  surplus and not hindsight.
- My sketch listed one manifest-mutation helper; the actual has two near-identical
  upserts (N1).
- On totals: my src estimate was 20% low (justified, per the naivety list above);
  my test estimate was 75% low, and roughly a quarter of that gap is surplus
  rather than coverage I failed to imagine.
