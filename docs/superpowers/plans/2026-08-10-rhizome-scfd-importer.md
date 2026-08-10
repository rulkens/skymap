# Rhizome SCFD Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --quick-look` turns a PolyPhy MCPM trace cube plus its `polyphy-trace` v1 sidecar into a decodable `.scfd` served over `public/data/mcpm-large.scfd`, under the same normalisation the VAC reference gets — and `npm run sync-r2` refuses to run until the real reference is rebuilt.

**Architecture:** One new builder (`tools/volumes/buildRhizomeVolume.ts`) sits on three new pure helpers — a sidecar parser (`tools/parsers/polyphyTraceSidecar.ts`), the value transform shared with the MCPM builder (`tools/utils/volume/packLogTraceVoxels.ts`, extracted from `buildMcpmVolume.ts` as ground prep), and a linear-space block-average for the later shell tiers (`tools/utils/volume/blockAverageCube.ts`). A three-file sentinel loop (write / delete / refuse) keeps a quick-look overwrite of `mcpm-large.scfd` out of R2.

**Tech Stack:** TypeScript (tools tsconfig), Vitest, Node `fs` — no runtime/src/WebGPU code is touched.

**Spec:** [`docs/superpowers/specs/2026-08-10-rhizome-scfd-importer-design.md`](../specs/2026-08-10-rhizome-scfd-importer-design.md)

**Ground preparation:** the spec's [Ground preparation](../specs/2026-08-10-rhizome-scfd-importer-design.md#ground-preparation) section names exactly one prep refactor — extracting `packLogTraceVoxels` out of `buildMcpmVolume.ts`. It is **Task 1**, behaviour-preserving, and lands as its own commit before any feature commit. Whether that commit rides this branch's PR or its own is an explicit ask at the checkpoint (per the refactor-the-ground convention) — do not assume.

## Global Constraints

- `type` aliases, never `interface`. One exported function per file in `tools/utils/`; deep relative imports, no barrels. `tools/parsers/` follows the `npyReader.ts` precedent instead: one exported type + one exported function per file.
- Error messages are prefixed with the name of the **throwing** function, matching `readNpy:` / `decodeScalarField:` / `buildMcpmVolume:`. Where this plan's message text and the spec's rules table disagree on a prefix, the throwing function's own name wins (see the Open questions section).
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. Comments record why, never what. The didactic blocks that move in Task 1 count against the destination file's budget — trim, don't re-inflate.
- Tests must be able to fail on a real bug no other test or compiler check catches. No constant restatements (in particular: **do not** test the tier-filename table or a `provenance` round-trip — the spec's "deliberately not tested" list is binding). Expected values are hand-computed, never re-derived with the code under test.
- No runtime/`src/` changes, no `SOURCE_REGISTRY` / `volumeFieldDefaults` / `cloudLoader` entries, no `allowDataFile` additions, no `docs/DATA.md` rebuild-order edits, no new `npm` script. All of that belongs to the later rhizome-shells plan.
- The full suite stays green at every commit.

---

### Task 1 (prep): extract `packLogTraceVoxels` from `buildMcpmVolume.ts`

Behaviour-preserving. Creates the joint that makes normalisation drift between the two builders structurally impossible (spec, Decision 1). The suite is the proof — no test file changes.

**Files:**

- Create: `tools/utils/volume/packLogTraceVoxels.ts` (new folder)
- Modify: `tools/volumes/buildMcpmVolume.ts:104-162` (the stats + log1p + transpose + f16-pack block), removing its now-unused `f32ToF16Bits` import if nothing else in the file uses it.

**Interfaces:**

```ts
export function packLogTraceVoxels(
  values: Float32Array | Float64Array,
  dims: Vec3,
): { voxels: Uint16Array; valueMin: number; valueMax: number };
```

`Vec3` is `src/@types/math/Vec3` (deep relative import, same style as `transpose3.ts:8`).

**`npm run refactor -- extract` does NOT apply here.** It moves an *existing exported symbol*; this is an inline statement block being promoted into a new function. Write the new file by hand. There is no file move, so `npm run move-files` is not involved either.

- [ ] Move the block verbatim into the new function: stats loop (`:105-111`), `safeMax`/`logMax`/`invLogMax` (`:139-141`), the triple loop with the axis-0↔2 transpose (`:151-162`). Return the three values instead of closing over locals.
- [ ] Carry the two load-bearing comments across — the heavy-tailed log-mapping derivation (`:113-138`) and the C-order→x-fastest transpose landmine (`:144-150`) — trimmed to the destination's ≤10-line header budget plus at most one inline note. **Drop the stale `(Task 3)` cross-reference** in the transpose comment; it points at a plan that shipped. Delete both blocks from `buildMcpmVolume.ts`; do not leave summaries behind (echoes don't earn their place).
- [ ] Call it from `buildMcpmVolume` between the dtype guard (`:98-101`) and the cube literal (`:165`).
- [ ] `npm run typecheck && npm test -- buildMcpmVolume` → GREEN, with **zero test-file edits**. If a test needed changing, the extraction was not behaviour-preserving — stop and find out why.
- [ ] Commit (own commit, prep-refactor).

**Known coverage gap, deliberately accepted:** `tests/tools/buildMcpmVolume.smoke.test.ts` uses a symmetric 4×4×4 cube and asserts only dims / header fields / voxel count — it would **not** catch an axis swap or a changed normalisation curve. The real pin on this helper arrives in Task 7 (asymmetric transpose fixture through `buildRhizomeVolume`). Do not add mcpm-side tests here; Task 7 covers it once, through the shared code path.

---

### Task 2: `parsePolyphyTraceSidecar` — the cross-repo contract parse

Faithful parse of the `polyphy-trace` v1 schema (spec, Decision 2). Validation rules 2–5 only. It returns `voxelSizeMpc` **per-axis, verbatim** — the cubic-voxel collapse is SCFD's constraint and lives builder-side (Task 6).

**Files:**

- Create: `tools/parsers/polyphyTraceSidecar.ts`
- Test: `tests/tools/parsers/polyphyTraceSidecar.test.ts`

**Interfaces:**

```ts
export type PolyphyTraceSidecar = {
  readonly dims: Vec3;
  readonly originMpc: Vec3;
  /** Per-axis voxel edge length, Mpc. Not collapsed — see spec Decision 3. */
  readonly voxelSizeMpc: Vec3;
  readonly frame: ScalarFieldFrameKind;
  readonly valueUnits?: string;
  readonly provenance?: Record<string, unknown>;
};

export function parsePolyphyTraceSidecar(text: string): PolyphyTraceSidecar;
```

Takes the raw file text (so "JSON parses" is genuinely this function's job); the builder owns `readFileSync` and rule 1.

**Validation rules** (message text per the spec's rules table; assert substrings, not full strings):

| # | Check                                                                             | Message substring to pin       |
| - | --------------------------------------------------------------------------------- | ------------------------------ |
| 2 | `format === 'polyphy-trace'`                                                      | `is not "polyphy-trace"`       |
| 3 | `version === 1`                                                                   | `unsupported version 2`        |
| 4 | `dims`/`origin_mpc`/`voxel_size_mpc` are 3 finite numbers; dims positive integers; voxel sizes positive | `must be 3 finite numbers` |
| 5 | `frame` ∈ `ScalarFieldFrameKind`                                                  | `unknown frame`                |

- [ ] Add `rejects a sidecar whose format is not polyphy-trace` — `{"format":"scfd-meta","version":1,…}`.
- [ ] Add `rejects an unsupported schema version` — `version: 2`, asserting the message carries the regenerate hint (same shape as `scalarFieldFormat.ts:201-204`).
- [ ] Add `rejects a non-3-element voxel_size_mpc` — `voxel_size_mpc: [1.8, 1.8]`.
- [ ] Add `rejects a non-finite origin` — `origin_mpc: [0, null, 0]` (this is the case a plain `Array.isArray` + length check lets through).
- [ ] Add `rejects an unknown frame` — `frame: "ecliptic"`.
- [ ] Add `parses the calibration sidecar into camelCase fields` — the spec's example JSON verbatim; assert `voxelSizeMpc` comes back as the **three** values `[1.8367, 1.8351, 1.8394]` (uncollapsed), `frame === 'equatorial-cartesian'`, and `provenance.polyphy_commit === '704d755'` (pass-through, not reshaped).
- [ ] `npm test -- polyphyTraceSidecar` → RED, then implement, then GREEN.
- [ ] Commit.

---

### Task 3: `blockAverageCube` — linear-space tier downsample

The skymap-side block-average the shell tiers need (spec, Decision 5). Operates on **linear values in C-order, before** any log normalisation — matching `extractMcpmCube.py:126-140`'s `downscale_local_mean`. Unwired by design: `--shell` stays inert this plan (Task 8).

**Files:**

- Create: `tools/utils/volume/blockAverageCube.ts`
- Test: `tests/tools/utils/volume/blockAverageCube.test.ts`

**Interfaces:**

```ts
export function blockAverageCube(args: {
  values: Float32Array | Float64Array;
  dims: Vec3;
  origin: Vec3;
  voxelSizeMpc: number;
  factor: number;
}): { values: Float32Array; dims: Vec3; origin: Vec3; voxelSizeMpc: number };
```

Geometry rule (spec, Decision 5): `dims / factor`, `voxelSizeMpc × factor`, **`origin` unchanged** — the lower corner of voxel (0,0,0) is the same point; only the cell size changes. Same invariant as `mcpmTierAnchors` (`buildMcpmVolume.ts:47-64`), where origin is tier-independent.

- [ ] Add `averages each 2×2×2 block in C-order` — 4×4×4 input with `values[n] = n` (so `n = i*16 + j*4 + k`), factor 2. Hand-computed: the first output cell averages indices {0,1,4,5,16,17,20,21} → sum 84 → **10.5**; the last averages {42,43,46,47,58,59,62,63} → sum 420 → **52.5**. Assert both, and `dims === [2,2,2]`.
- [ ] Add `halves the grid and doubles the voxel size, leaving the origin put` — `origin: [-100, -50, 25]`, `voxelSizeMpc: 1.5` → origin unchanged, `voxelSizeMpc === 3`.
- [ ] Add `rejects dims that do not divide by the factor` — dims `[4,4,3]`, factor 2; assert the substring `not divisible by 2`.
- [ ] `npm test -- blockAverageCube` → RED, then implement, then GREEN.
- [ ] Commit.

---

### Task 4: the quick-look sentinel loop (write path excluded)

`mcpm-large.scfd` matches the sync allow-list (`allowDataFile.ts:14`), so a quick-look overwrite plus one forgotten rebuild would ship the reproduced cube to production as the MCPM reference. The sentinel makes that structurally impossible. `allowDataFile` needs **no** change — its regexes are anchored, so `mcpm-large.scfd.quicklook` cannot match.

**Files:**

- Create: `tools/utils/volume/quickLookSentinelPath.ts`
- Create: `tools/deploy/r2/assertNoQuickLookSentinel.ts`
- Modify: `tools/deploy/syncR2.ts` — call the assert inside `main()`, in the "fail before the first byte moves" block (`:99-107`), before `readRcloneCredentials()`.
- Modify: `tools/volumes/buildMcpmVolume.ts` — `buildMcpmTier` deletes the sentinel when `factor === 2`.
- Test: `tests/tools/deploy/r2/assertNoQuickLookSentinel.test.ts`

**Interfaces:**

```ts
// tools/utils/volume/quickLookSentinelPath.ts
export function quickLookSentinelPath(dataDir: string): string; // `${dataDir}/${MCPM_TIER_FILENAME[2]}.quicklook`

// tools/deploy/r2/assertNoQuickLookSentinel.ts
export function assertNoQuickLookSentinel(dataDir: string): void; // throws while the sentinel exists
```

The `.quicklook` suffix and the `MCPM_TIER_FILENAME[2]` import have exactly one home — all three consumers (write, delete, refuse) call `quickLookSentinelPath`. Taking `dataDir` as a parameter is what makes the guard testable against a tmpdir; `syncR2.ts` passes its existing `DATA_DIR` const (`:24`).

The assert lives in its own file rather than inline in `syncR2.ts` because `syncR2.ts` reads `.env.production` at module scope (`:40`), so importing it from a test drags in deploy configuration the test has no business needing. `syncR2.ts` still owns the call site.

- [ ] Add `refuses to sync while the quick-look sentinel exists` — tmpdir containing `mcpm-large.scfd.quicklook`; assert the throw mentions `npm run build-mcpm`.
- [ ] Add `permits a sync when no sentinel is present` — same tmpdir without the file; assert no throw.
- [ ] `npm test -- assertNoQuickLookSentinel` → RED, then implement both new files, then GREEN.
- [ ] Wire the call into `syncR2.ts`'s `main()` pre-flight block. Note `main()` catches and prints `err.message` (`:155-158`), so a plain `Error` reads correctly at the CLI — no `process.exit` inside the assert.
- [ ] Delete the sentinel in `buildMcpmTier` when `factor === 2`, after `buildMcpmVolume` returns. Use `rmSync(path, { force: true })` — `force` is mandatory, the sentinel is absent on almost every run.
- [ ] `npm run typecheck && npm test` → GREEN.
- [ ] Commit.

---

### Task 5: `buildRhizomeVolume` core — `--out` passthrough

The builder proper: load the npy, squeeze a trailing singleton, validate shape/dtype against the sidecar, pack through the Task 1 helper, encode SCFD v3, write. Rules 1, 7, 8, 9. Rule 6 (voxel spread) lands in Task 6; it is fine for this task to use `voxelSizeMpc[0]` as a placeholder only if Task 6 follows immediately — prefer implementing the mean here and the *assert* in Task 6.

**Files:**

- Create: `tools/volumes/buildRhizomeVolume.ts`
- Test: `tests/tools/buildRhizomeVolume.smoke.test.ts`

**Interfaces:**

```ts
export async function buildRhizomeVolume(args: { npyPath: string; outPath: string }): Promise<void>;
```

The sidecar is discovered at the npy's basename with a `.json` extension. **No `--sidecar` override** — a mismatched cube/sidecar pair is a provenance bug the spec refuses to make expressible (Decision 2).

**Output mapping** (spec, "Output mapping"):

| `ScalarCube` field | Source                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `dims`             | npy shape (post-squeeze), equal to sidecar `dims`                             |
| `channels`         | `1`                                                                           |
| `voxels`           | `packLogTraceVoxels(values, dims).voxels`                                     |
| `frameKind`        | sidecar `frame`, verbatim                                                     |
| `origin`           | sidecar `origin_mpc`, verbatim (already the voxel-(0,0,0) lower corner)       |
| `voxelSize`        | mean of sidecar `voxel_size_mpc`                                              |
| `rotation`         | `[0, 0, 0, 1]` **always**                                                     |
| `valueMin/Max`     | raw pre-normalisation stats from `packLogTraceVoxels`                         |

`rotation` is identity even for a supergalactic cube: the renderer's `FRAME_TO_WORLD` already applies the frame rotation and this field composes **on top** of it. Writing `SG_TO_EQ` here places features at `SG_TO_EQ²·X` — the landmine documented at `buildCf4Density.ts:193-204`.

**Validation rules** implemented here:

| # | Check                              | Message substring to pin        |
| - | ---------------------------------- | ------------------------------- |
| 1 | sidecar exists at `<basename>.json` | `no sidecar at`                 |
| 7 | rank 3 after squeeze                | `expected 3D cube`              |
| 8 | npy shape equals sidecar `dims`     | `does not match sidecar dims`   |
| 9 | dtype `<f4` or `<f8` (reject `<f2`) | `export f32`                    |

- [ ] Copy the `writeF32Npy` tmpdir helper pattern from `tests/tools/buildMcpmVolume.smoke.test.ts:18-32` into the new test file (a local fixture writer per test file is the established shape here — do not extract a shared one).
- [ ] Add `writes a decodable SCFD carrying the sidecar's frame, origin and mean voxel size` — 4×4×4 f32 cube, sidecar `frame: 'supergalactic-cartesian'`, `origin_mpc: [-100,-50,25]`, `voxel_size_mpc: [1.8367, 1.8351, 1.8394]`. Decode with `decodeScalarField` and assert `frameKind`, origin to 3 dp, `voxelSize ≈ 1.83707` (the hand-computed mean of the three: `5.5112 / 3`), identity `rotation`, and raw `valueMin`/`valueMax` matching the input's range (not the normalised [0,1] range).
- [ ] Add `refuses to build without a sidecar` — npy alone in the tmpdir.
- [ ] Add `refuses a stale sidecar whose dims disagree with the npy` — 4×4×4 npy, sidecar `dims: [4,4,8]`.
- [ ] Add `refuses an f16 npy` — write an `<f2` fixture; assert the message tells the operator to export f32.
- [ ] `npm test -- buildRhizomeVolume` → RED, then implement, then GREEN.
- [ ] Commit.

---

### Task 6: voxel-size spread assert and mean collapse

Rule 6. SCFD stores **one** cubic `voxel_size` (`scalarFieldFormat.ts:40` header offset 36) and the renderer assumes cubic voxels; PolyPhy rounds grid dims per axis. The builder asserts relative spread `(max − min) / mean ≤ 0.005`, then collapses to the mean — and only the collapsed scalar flows onward, so no code past that point can half-adopt per-axis sizes.

**Files:**

- Modify: `tools/volumes/buildRhizomeVolume.ts`
- Test: `tests/tools/buildRhizomeVolume.smoke.test.ts` (extend)

- [ ] Add `refuses a cube whose per-axis voxel sizes disagree beyond 0.5%` — `voxel_size_mpc: [1.0, 1.0, 1.02]` (spread ≈ 1.99%); assert the substring `exceeds 0.5%` and that the message names all three sizes.
- [ ] Confirm the Task 5 happy-path case still passes: `[1.8367, 1.8351, 1.8394]` has spread ≈ 0.23%, roughly 2× headroom under the tolerance.
- [ ] `npm test -- buildRhizomeVolume` → RED on the new case, then implement, then GREEN.
- [ ] Commit.

**Do not "fix" a future spread failure by raising the tolerance.** The spec flags this explicitly: if a real PolyPhy run trips it, the fix is exporter-side (pad dims to equalise). A looser bar renders the cube subtly squashed instead of failing loudly.

---

### Task 7: transpose fixture and 4D-squeeze acceptance

The pin the MCPM builder has never had. `buildMcpmVolume.ts:144-150` states outright that only a visual smoke test would catch a transpose regression — its own fixture is symmetric 4×4×4, so an axis swap is invisible to it. Asymmetric dims make the swap observable, and because Task 1 made the transpose shared, this test guards **both** builders.

**Files:**

- Test: `tests/tools/buildRhizomeVolume.smoke.test.ts` (extend). Implementation changes expected only if the squeeze path is incomplete.

- [ ] Add `places a hot voxel at the x-fastest index after the C-order transpose` — dims **2×3×4**, all zeros except value `1.0` at C-order index **9**, i.e. `(i,j,k) = (0,2,1)`. Since `valueMax = 1`, that voxel normalises to `log(2)/log(2) = 1` and every other voxel to 0. Decode and assert `voxels[10]` is the f16 bit pattern for 1.0 (`0x3C00`) and every other entry is `0`. Hand-derived: the x-fastest index is `i + j·Nx + k·Nx·Ny = 0 + 2·2 + 1·2·3 = 10`; a straight no-transpose copy would leave it at index 9, so this assertion is genuinely distinguishing.
- [ ] Add `accepts a raw PolyPhy 4D cube with a trailing singleton` — npy shape `(2,3,4,1)`, sidecar `dims: [2,3,4]` (post-squeeze, per the schema); assert it builds and decodes to `dims === [2,3,4]`.
- [ ] Add `refuses a 4D cube whose last axis is not a singleton` — shape `(2,3,4,2)`; assert the rank error.
- [ ] `npm test -- buildRhizomeVolume` → GREEN (the transpose case is a characterization pin and may pass on the first run; the squeeze cases should drive real code if Task 5 left the path partial).
- [ ] Commit.

---

### Task 8: CLI surface — `--out` / `--quick-look` / `--shell`

**Files:**

- Modify: `tools/volumes/buildRhizomeVolume.ts` (CLI wrapper at the bottom, mirroring `buildMcpmVolume.ts:204-231`)

**Usage:**

```
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --out <path.scfd>
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --quick-look
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --shell inner|middle|outer
```

- [ ] Parse the positional npy path plus **exactly one** of the three modes; anything else is a usage error printed to stderr with `process.exit(1)`.
- [ ] `--quick-look`: compose the output path as `public/data/${MCPM_TIER_FILENAME[2]}` with `MCPM_TIER_FILENAME` **imported** from `buildMcpmVolume.ts` — never a restated `'mcpm-large.scfd'` literal. After the write, create the sentinel at `quickLookSentinelPath('public/data')` (Task 4).
- [ ] `--quick-look`: print the two operational notes the spec requires — the cube is only visible with the MCPM tier set to **large** (the viewer fetches per-tier, `src/data/sources/mcpm.ts:16`), and `npm run build-mcpm` restores the shipped reference and clears the sentinel.
- [ ] `--shell <name>`: validate the name against `inner|middle|outer`, then throw a not-yet-implemented error naming the rhizome-shells plan as the owner. The flag exists so the argument surface is stable; wiring it to `blockAverageCube` is out of scope here.
- [ ] Guard `main()` with the `invokedDirectly` check (`buildMcpmVolume.ts:219-231`) so importing the module from a test never runs the CLI.
- [ ] `npm run typecheck && npm test` → GREEN. No test for the CLI arg parsing — it is a thin dispatch over already-tested functions, and the spec's test list does not include it.
- [ ] Commit.

---

## Task DAG

Edges are `blocker → blocked`. Task 1 is the prep refactor and gates everything that touches `buildMcpmVolume.ts` or the shared pack path.

```
1 ──┬──► 4 ──► 8
    │
    └──► 5 ──┬──► 6
             ├──► 7
             └──► 8
2 ───────────► 5
3   (independent — no blockers, blocks nothing)
```

| Task | Blocked by | Why                                                                                     |
| ---- | ---------- | --------------------------------------------------------------------------------------- |
| 1    | —          | Prep refactor; first commit by convention.                                              |
| 2    | —          | Pure parser, no shared files.                                                           |
| 3    | —          | Pure helper, no shared files. Unwired until the shells plan.                            |
| 4    | 1          | Both edit `tools/volumes/buildMcpmVolume.ts`.                                           |
| 5    | 1, 2       | Imports `packLogTraceVoxels` and `parsePolyphyTraceSidecar`.                            |
| 6    | 5          | Extends `buildRhizomeVolume.ts` and its test file.                                      |
| 7    | 5          | Extends the same test file; pins the transpose through the built cube.                  |
| 8    | 4, 5       | Needs `quickLookSentinelPath` and the exported builder.                                 |

**Pipelining note** (per `sdd-execution.md` Rule 2): tasks 2 and 3 have file sets disjoint from everything else, so their reviews can run alongside any other implementer. Tasks 5, 6, 7 and 8 all touch `tools/volumes/buildRhizomeVolume.ts` and/or `tests/tools/buildRhizomeVolume.smoke.test.ts` — dispatch them strictly serially and do not start the next while an earlier one's review is open. Suggested dispatch order: **1, 2, 3, 4, 5, 6, 7, 8**.

---

## Open questions and spec/code divergences

Flagged rather than silently resolved. Each needs a call before or during the task that hits it.

1. **Rule 10's error prefix.** The spec's rules table writes rule 10 as `buildRhizomeVolume: dims <s> not divisible by <f> …`, but the spec's testing section exercises it "via its exported function", and the check naturally lives in `blockAverageCube`. This plan puts the throw in `blockAverageCube` with its own name as the prefix (house style: the throwing function names itself) and pins only the substring `not divisible by 2`. If the `buildRhizomeVolume:` prefix is load-bearing for cross-repo debugging, move the check up into the builder instead.
2. **Where the R2 refusal lives.** The spec says "refusal check in `syncR2.ts`". `syncR2.ts` reads `.env.production` at module scope (`:40`), so a test importing it would need deploy configuration present. This plan splits it: the *check* is `tools/deploy/r2/assertNoQuickLookSentinel.ts` (testable against a tmpdir), the *call site* is `syncR2.ts`. Functionally identical; structurally different from the spec's literal wording.
3. **The prep refactor's claimed pin is weaker than the spec states.** The spec says `packLogTraceVoxels` is "pinned by the existing `tests/tools/buildMcpmVolume.smoke.test.ts` (no new tests for the refactor)". Read the test: its cube is symmetric 4×4×4 and its assertions cover dims, header fields and voxel count — it cannot detect an axis swap, and its `valueMin`/`valueMax` assertions read the **raw** stats, so a changed normalisation curve also slips through. (Its comment at `:83-85` still describes CF-4's symmetric normalisation and is simply stale.) Task 1 therefore ships genuinely under-pinned; Task 7 is what actually pins the shared helper. If that ordering is unacceptable, Task 7's transpose fixture should move ahead of Task 1 as an mcpm-side test — at the cost of writing it twice.
4. **The DoD manual pass depends on the PolyPhy fork.** Everything in this plan is verifiable from synthetic fixtures, but the quick-look observable behaviour needs a real `sdss_reproduced.npy` **with a v1 sidecar**, and the fork's sidecar does not yet carry the geometry keys (spec, "Exporter-side changes required"). If the fork has not shipped them when this plan completes, the quick-look DoD line is blocked on the other repo — either hold `/feature-done` or hand-write a sidecar for the existing cube to unblock the visual check.
5. **`blockAverageCube` ships dead.** Task 3 is an explicitly-in-scope deliverable whose only future caller is `--shell`, which this plan leaves inert. That is the spec's decision (Decision 5 plus the `--shell` deferral), not an oversight — but it does mean one new tested helper with zero production call sites lands on `main`.

---

## Definition of Done

**Deliverable inventory**

- [ ] `tools/utils/volume/packLogTraceVoxels.ts` exports `packLogTraceVoxels`; `buildMcpmVolume.ts` no longer contains its own copy of the stats/log1p/transpose/pack block.
- [ ] `tools/parsers/polyphyTraceSidecar.ts` exports `PolyphyTraceSidecar` + `parsePolyphyTraceSidecar`.
- [ ] `tools/utils/volume/blockAverageCube.ts` exports `blockAverageCube`.
- [ ] `tools/utils/volume/quickLookSentinelPath.ts` and `tools/deploy/r2/assertNoQuickLookSentinel.ts` exist, and `syncR2.ts` calls the assert before any byte moves.
- [ ] `tools/volumes/buildRhizomeVolume.ts` exports `buildRhizomeVolume` and accepts all three CLI modes.

**Named observable behaviours** (manual pass, against a real PolyPhy cube + v1 sidecar — see Open question 4)

- [ ] `npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --quick-look` writes `public/data/mcpm-large.scfd` and `public/data/mcpm-large.scfd.quicklook`, and prints both operational notes (tier must be **large**; `npm run build-mcpm` to restore).
- [ ] With the dev server running and the MCPM tier set to **large**, the reproduced cube renders in place of the reference — inferno palette, filament structure visible at the default contrast 1.7, positioned in the frame its sidecar declares.
- [ ] `npm run sync-r2` **refuses** while the sentinel is present, naming `npm run build-mcpm` in the refusal.
- [ ] `npm run build-mcpm` restores the reference, removes the sentinel, and `npm run sync-r2` then proceeds normally.
- [ ] `npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --shell inner` exits with the not-yet-implemented error, not a stack trace or a silent no-op.

**Deferral boundary** — explicitly NOT in this plan, do not chase in review

- Rhizome field handles, `SOURCE_REGISTRY` / `volumeFieldDefaults` entries, AABB-fade compositing, settings UI/migration, `cloudLoader` wiring, `allowDataFile` additions.
- `--shell` tiering actually wired to `blockAverageCube`, the `rhizome-<shell>-{small,medium,large}.scfd` outputs, and an `npm run build-rhizome` script.
- `data/raw/rhizome/` registry keys and provenance README.
- Any change to `extractMcpmCube.py`, to `buildMcpmVolume.ts`'s CLI or geometry constants, or to `buildCf4Density.ts`'s own (different, symmetric) normalisation.
- The PolyPhy fork's exporter changes — they land in `rulkens/PolyPhy`, not here.
