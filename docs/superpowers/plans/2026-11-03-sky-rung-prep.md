# Sky rung, prep (PR 1) — plan

> **Spec.** [`specs/2026-11-03-sky-rung-slice-design.md`](../specs/2026-11-03-sky-rung-slice-design.md)
> §3.3 (P1, P2). The slice itself (§4–§6) is PR 2, planned separately.
> **Branch.** `sky-rung-prep`, off main. Both tasks preserve behaviour; CI is the gate (lean SDD,
> `conventions/sdd-execution.md`).

## Contract

```ts
// P1 — src/@types/camera/RungRow.d.ts gains one cell
identity(frame: FrameOf[K]): string;   // absolute '' · body frame.body · site frame.site

// src/services/engine/camera/rungs/rungKindOf.ts — the tag's one key
rungKindOf(frame): RungKind            // 'absolute' for the bare string, else the object's only key

// src/services/engine/camera/rungs/frameKey.ts
frameKey(frame): string                // 'absolute' | `${kind}:${rowFor(frame).identity(frame)}`
// deleted: src/services/engine/camera/rungs/frameBodyId.ts (its one caller is frameKey)

// P2 — src/@types/engine/camera/DriverCtx.d.ts, src/@types/animation/ClipFrameOptions.d.ts
readonly terrainHeightAt: TerrainHeightAtLookup;    // DriverCtx, required
readonly terrainHeightAt?: TerrainHeightAtLookup;   // ClipFrameOptions; absent ⇒ datumOnlyTerrainHeight
```

## Tasks

### Task 1: One tag key, identity on the row (P1)

**review: yes** (camera rung table)

**Files:** `src/@types/camera/RungRow.d.ts`,
`src/services/engine/camera/rungs/{rungKindOf,frameKey,absoluteRung,bodyRung,siteRung}.ts`,
`src/services/engine/camera/rungs/frameBodyId.ts` (delete),
`tests/services/engine/camera/rungs/frameKey.test.ts` (only if a header comment names `frameBodyId`).

- `rungKindOf` returns `'absolute'` for the bare string, otherwise the frame object's one key, cast
  to `RungKind` once. Its doc comment says the rule: every non-absolute tag is `{ [kind]: value }`,
  and the value is the rung's identity. Delete the two-way ternary.
- Each row gets `identity`: `absoluteRung` returns `''`, `bodyRung` returns `frame.body`, `siteRung`
  returns `frame.site`.
- `frameKey` keeps its output byte-identical (`'absolute'`, `'body:earth'`, `'site:<id>'`) but reads
  the id through `rowFor(frame).identity(frame)`. Delete `frameBodyId.ts` and its
  `Record<RungKind, SceneBodyId>` cast; nothing else imports it (`grep -rn frameBodyId src tests tools`
  must come back empty).
- Import cycles: `frameKey` → `rowFor` → `cameraRungs` reaches the row modules, which import
  `refoldTo`, which imports `sameFrame` → `frameKey`. `cameraRungs.ts` uses getters for exactly
  this. If a test still sees an `undefined` row at load, read the cycle before restructuring, and
  report it.
- No new test: behaviour-preserving. `frameKey.test.ts`, `oneTagReader.test.ts` and
  `tests/services/engine/camera/rungs/*.test.ts` are the guard and must pass unchanged.
- [ ] Done: `npm run typecheck:fast` clean; `npx vitest run tests/services/engine/camera` green; commit
      `refactor(camera): frame tags are one key; each rung row names its frame's identity`.

### Task 2: Clip legs fold against the live ground (P2)

**Files:** `src/@types/engine/camera/DriverCtx.d.ts`, `src/@types/animation/ClipFrameOptions.d.ts`,
`src/services/engine/camera/stepCameraRuntime.ts` (the driver bag at ~`:255-270`),
`src/services/engine/camera/cameraDrivers.ts` (`framedClipArm` `:211-227`, the clip driver `:251`,
the focus-move driver `:329`), `src/services/engine/camera/evaluateClip.ts` (`convertChannels`
`:548-567`), `tests/helpers/camera/makeDriverCtx.ts`.

- `DriverCtx.terrainHeightAt` is required. `stepCameraRuntime` already holds `terrainHeightAt`
  (`:78`, `:154`), so it fills the bag from that.
- `ClipFrameOptions.terrainHeightAt` is optional, like its siblings. Both `evaluateFramedClip` calls
  in `cameraDrivers.ts` pass `ctx.terrainHeightAt`.
- `convertChannels` uses `opts.terrainHeightAt ?? datumOnlyTerrainHeight`. Thread it the way
  `bodies` already reaches `FrameDeps`.
- `framedClipArm` takes the lookup as a parameter and passes it to `decode`.
- Rewrite the comment at `evaluateClip.ts:557-559`. The lookup now reaches the evaluator; only a call
  that passes none (tests, golden traces) folds at datum.
- `makeDriverCtx` defaults `terrainHeightAt` to `datumOnlyTerrainHeight` and accepts an override.
- No new test: no row's conversion reads the lookup yet (only `bodyRung.host`'s floor closure, at
  input time), so this is plumbing. The slice PR's sky → body leg test guards it.
- [ ] Done: typecheck clean; `npx vitest run tests/services/engine tests/layers/missions` green; commit
      `refactor(camera): the clip evaluator gets the live terrain lookup`.

### Task 3: Backlog the adjacent findings

**Files:** `docs/BACKLOG.md`, two new `docs/backlog/2026-11-03-*.md` detail files.

- "**turnCameraArm reads the site tag by hand** `ready`: `tools/site/utils/turnCameraArm.ts:7` tests
  `'site' in arm.frame` outside `rungs/`; route it through `isSiteArm`."
- "**framedClipArm decodes with the current basis** `deferred`: `cameraDrivers.ts` passes the current
  basis where the clip pinned another. Harmless until a `decode` cell reads a basis."
- Follow the index-line format of `docs/BACKLOG.md` (title, readiness tag, one clause, `→ [details]`).
- [ ] Done: commit `docs(backlog): two camera findings from the sky-rung ground check`.

## Definition of Done

- [ ] `rungKindOf` has no per-kind branch; `frameBodyId.ts` is gone; every row has `identity`.
- [ ] `frameKey` output is byte-identical for absolute, body and site frames (existing tests unchanged).
- [ ] `DriverCtx` carries `terrainHeightAt`; `convertChannels` and `framedClipArm` no longer
      hard-code the datum.
- [ ] The two findings are backlogged.
- [ ] Out of scope: the sky rung itself (PR 2), any behaviour change.
