# Mesh bodies — prep: rotation gate and the one body pick table

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two behaviour-preserving refactors that open the joints `MeshBody`
needs: a scene body is oriented because it has a rotation row (not because it
is textured), and one table decides both how a body's pick id is packed and
how it is unpacked.

**Spec:** `docs/superpowers/specs/2026-09-10-mesh-bodies-design.md` — this plan
implements P1 and P2 of "Ground preparation" (spec lines 298–330). P3, P4 and
P5 ride the feature PR (`docs/superpowers/plans/2026-09-10-mesh-bodies-02-feature.md`).

**Lands as:** its own small PR off `origin/main`, merged **before** the feature
branch starts. Nothing in this plan mentions meshes; both tasks stand on their
own as simplifications.

> **Citations.** Every file path and line number below was verified against
> `origin/main` at **89d716438** (`docs(scene-workbench): plan 2 Gaussian-splats
design spec (#673)`), which already contains the ContentLayer → ContentPass
> rename (#674, `79f1f8063`) — so `src/services/engine/frame/passes/*Pass.ts`
> are the current names. Execute in a **fresh worktree off `origin/main`**, not
> off the plan-authoring worktree. Re-run `git log --oneline -5 origin/main`
> before Task 1: if the touched files have moved again, translate the paths the
> same mechanical way and proceed.

## Task dependency table

| #   | Task                                                     | Depends on | Parallelizable with |
| --- | -------------------------------------------------------- | ---------- | ------------------- |
| 1   | P1 — `orientationForBody` gates on rotation-row presence | —          | 2                   |
| 2   | P2 — one `BODY_PICK_ROWS` table for pack and unpack      | —          | 1                   |

The two tasks touch disjoint files, so both may run as independent worktrees
and be cherry-picked onto one branch. Task order in the PR is 1 then 2.

## Global Constraints

- **Behavioural no-op.** Neither task may change what any existing body
  renders, picks, or resolves to. Every existing test in the touched files
  must stay green **unchanged** except where a step below says otherwise; if a
  test needs its assertion (not just its imports or comments) edited to pass,
  stop — the refactor drifted.
- **Conventions:** `type` aliases never `interface`; one symbol per file in
  `src/@types/`; deep relative imports, no barrels; comment budget (module
  header ≤ 10 lines, comment lines ≤ half the code lines in the file).
  Comments are timeless — no "used to gate on the texture registry".
- **Testing (`docs/superpowers/conventions/testing.md`):** only the tests
  listed per task. No constant/registry restatements, no mirrors, no
  type-shape tests.
- **Symbol renames go through the refactor CLI**, not hand-edited imports:
  `npm run refactor -- rename <file> <oldName> <newName>` (see
  `.claude/skills/refactor/SKILL.md`).
- **`npm run typecheck:fast` is the inner-loop check; confirm the final state
  of each task with real `npx tsc --noEmit` before committing** (per CLAUDE.md,
  `tsgo` is an exact-pinned dev build, not the CI gate).
- Stage specific paths on commit; never `git add -A`.

---

### Task 1: P1 — `orientationForBody` gates on rotation-row presence

**Files:**

- Modify: `src/data/bodies/rotationElements.ts:1-17` (header + the lookup)
- Modify: `src/data/bodies/orientationForBody.ts:1-38` (header + the gate at `:33`)
- Modify: `src/services/engine/frame/deriveBodyStates.ts:86` (comment only)
- Modify: `tests/data/bodies/orientationForBody.test.ts`
- Modify: `tests/data/bodies/rotationElements.test.ts:9-24`
- Modify (call sites only): `tests/data/bodies/sceneEarth.test.ts:5,43`,
  `tests/data/bodies/scenePlanets.test.ts:5,75`,
  `tests/data/bodies/rotationElements.test.ts:33,64`

**Why:** `orientationForBody.ts:33` returns `IDENTITY_MAT3` unless
`bodyTextureSpec(id)` is truthy — texture-registry membership standing in for
"does this body have a modelled facing?". The two memberships coincide today
(both `BODY_TEXTURE_REGISTRY` and `ROTATION_ELEMENTS` hold exactly the same 15
ids), so the proxy is invisible; a body with a rotation row and no texture
would silently never turn, because `deriveBodyStates.ts:93,106` calls
`orientationForBody` for every anchor and element row unconditionally.

**Interfaces:**

- Produces: `rotationRowById(id: string): RotationElements | null` in
  `src/data/bodies/rotationElements.ts` — **replaces** the throwing
  `rotationById` (`rotationElements.ts:15-17`), which after this task would
  otherwise have no production caller. `orientationForBody(id, simDays): Mat3`
  keeps its signature.
- Contract: `orientationForBody` returns a fresh mutable copy of
  `IDENTITY_MAT3` when `rotationRowById(id)` is `null`, and
  `rotationFromIau(row, W)` otherwise. It no longer imports
  `bodyTextureRegistry` at all.

**Testability note:** `orientationForBody` must read `ROTATION_ELEMENTS`
through `rotationRowById` **exported from the same module**, so the new test
can replace the table wholesale with `vi.mock`. There is no real id today with
a rotation row but no texture entry — the mocked fixture row is the only way to
get a test that fails before the change.

- [x] **Step 1: Write the failing test** in
      `tests/data/bodies/orientationForBody.test.ts`. Hoisted at the top of the
      file, mock the rotation table with a superset of the real rows:

```ts
vi.mock('../../../src/data/bodies/rotationElements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/data/bodies/rotationElements')>();
  const rows = [
    ...actual.ROTATION_ELEMENTS,
    // A body with a rotation row and NO bodyTextureRegistry entry — the shape
    // a mesh body has, and the case the texture-membership gate got wrong.
    {
      id: 'test-untextured-spinner',
      poleRaDeg: 0,
      poleDecDeg: 90,
      primeMeridianDeg: 0,
      spinRateDegPerDay: 360,
    },
  ];
  return {
    ROTATION_ELEMENTS: rows,
    rotationRowById: (id: string) => rows.find((r) => r.id === id) ?? null,
  };
});
```

Then add the test `orients a body that has a rotation row but no texture
  entry`: assert `orientationForBody('test-untextured-spinner', CONST_J2000)`
is **not** equal to `[...IDENTITY_MAT3]`, and that a half-day later the
applied local `+x` direction has moved (reuse the file's existing `apply`
helper at `:11-15`, the same way the Earth test at `:23-37` does).

- [x] **Step 2: Run it and watch it fail.**
      `npx vitest run tests/data/bodies/orientationForBody.test.ts`
      Expected: FAIL — the id is not in `BODY_TEXTURE_REGISTRY`, so the current
      gate returns identity. (`rotationRowById` not existing is also a fail;
      either way it must be red before Step 3.)

- [x] **Step 3: Replace `rotationById` with `rotationRowById`.**
      `npm run refactor -- rename src/data/bodies/rotationElements.ts rotationById rotationRowById`,
      then change the body to a non-throwing `find` returning `null`, drop the
      now-unused `findByIdOrThrow` import (it stays in use elsewhere —
      `orbitalElements.ts`, `bodyTextureLoadRadius.ts`, `deriveSimDays.ts` —
      so do not delete the util), and add `!` at the four renamed test call
      sites (`sceneEarth.test.ts:43`, `scenePlanets.test.ts:75`,
      `rotationElements.test.ts:33,64`).

- [x] **Step 4: Flip the gate** in `orientationForBody.ts`: look the row up
      first, return the identity copy when it is `null`, and delete the
      `bodyTextureSpec` import. Rewrite the module header (`:1-21`, currently
      four paragraphs on why texture membership is the sole gate — over the ≤ 10
      line budget once it is no longer true): keep the prime-meridian derivation
      and the "identity is the honest 'no facing modelled' value" note, drop the
      texture-registry rationale.

- [x] **Step 5: Fix the two stale comments** the change falsifies:
      `deriveBodyStates.ts:86` ("the texture-keyed facing gate stays one gate
      for every body") and `rotationElements.ts:1-2` ("for the fifteen textured
      bodies" — a rotation row no longer implies a texture). Update the two
      existing test comments in `orientationForBody.test.ts:40-41` and `:48-50`,
      which explain the old gate by name; their assertions do not change (Titan
      and Sgr A\* have no rotation row either).

- [x] **Step 6: Delete the registry-count test.**
      `tests/data/bodies/rotationElements.test.ts:10-11` asserts
      `expect(ROTATION_ELEMENTS).toHaveLength(15)`. That is a constant/registry
      restatement (`testing.md` — "no constant / registry restatements"): it
      fails on every legitimate row addition and catches nothing a `git diff`
      would not show. Delete the assertion **and its comment**; keep the
      duplicate-id and pole-declination checks in the same `it` block — those
      are structural invariants and stay.

- [x] **Step 7: Verify.**
      `npx vitest run tests/data/bodies tests/services/engine/frame/deriveBodyStates.test.ts`
      → green, then `npm run typecheck:fast`, then `npx tsc --noEmit`.
      Every pre-existing assertion must pass unedited.

- [x] **Step 8: Commit** (stage the listed paths only).

```
refactor(bodies): gate orientationForBody on rotation-row presence

Texture-registry membership was a proxy for "has a modelled facing" that
holds only while the two tables carry the same ids.
```

---

### Task 2: P2 — one `BODY_PICK_ROWS` table for pack and unpack

**Files:**

- Create: `src/data/bodies/bodyPickRows.ts`
- Create: `tests/data/bodies/bodyPickRows.test.ts`
- Modify: `src/services/engine/frame/passes/sceneBodyPickId.ts:1-26` (whole file)
- Modify: `src/services/engine/helpers/resolvePickTable.ts:22-49,109-113`
- Modify: `tests/services/engine/frame/passes/sceneBodyPickId.test.ts` (one case added; existing cases untouched)

**Why:** the pack side is a hand-written if-chain (`sceneBodyPickId.ts:20-26`);
the unpack side is already a registry keyed on `BodyId`
(`resolvePickTable.ts:36-49`). Adding a body row to the unpack registry without
editing the pack chain yields a body whose caption pick can never resolve, and
nothing makes the two sides disagree loudly.

**Interfaces:**

- Produces `src/data/bodies/bodyPickRows.ts`:

```ts
export const BODY_PICK_ROWS: Readonly<Record<BodyId, readonly { readonly id: string }[]>>;
```

This is `PICK_SEEDS_BY_BODY_ID` (`resolvePickTable.ts:36-49`) moved verbatim —
same five rows (`earth`, `planet`, `sun`, `sgr-a-star`, `s-star`), same seed
arrays, same totality over `BodyId` so a new body row is a compile error until
its seeds are named. No new fields, no new type: the source code a row packs
with is **not** stored here, it is read off the row's own `SOURCE_REGISTRY`
entry at the pack site (below). Imports only the `SCENE_*` seed arrays from
its own directory plus the `BodyId` type, so no import cycle: `src/data/sources/*`
does not import `src/data/bodies/*`.

- `sceneBodyPickId(id: string): number | null` keeps its signature and its
  `null` contract, and becomes: scan the `type: 'body'` `SOURCE_ENTRIES` rows,
  look each one's seeds up in `BODY_PICK_ROWS`, and on the first
  `seedIndexOfBody` hit return `packSelection(entry.code, index +
PICK_SENTINEL_OFFSET)`. The entry carries both the `BodyId` key and the source
  code, so nothing restates a code. **`starPickId(id)` stays as the tail
  fallback**, unchanged, and `starPickId.ts` is not touched — it is still the
  direct pack path for `starPointsPass.ts:343` and `starSpheresPass.ts:163`.

- **The Sun's row is skipped by the scan**, with a comment saying why: its seeds
  are `SCENE_STARS`, which the STAR layers draw and stamp with
  `Source.FamousStar` (`starPickId.ts:26`), not with `Source.Sun` — the fact
  `src/data/sources.ts`'s header already records in prose. Scanning it would
  stamp `Source.Sun` for the Sun and every famous star, changing the packed
  bytes; the tail fallback is what packs them, exactly as today. Every other
  row's seeds are disjoint from both star tables (Step 1's test pins that), so
  the Sun is the only skip.

- `resolvePickTable.ts`'s `body` arm reads
  `BODY_PICK_ROWS[entry.id as BodyId][pick.localIdx]`; `PICK_SEEDS_BY_BODY_ID`
  and its doc comment leave the file. The comment moves with the table, trimmed
  to the ≤ 10-line header budget: what a row's array is, why the correspondence
  is data rather than a branch chain, and the one line about the Sun's row being
  addressed by no layer's stamp.

- [x] **Step 1: Write the failing test** `tests/data/bodies/bodyPickRows.test.ts`
      with one test, `no id appears in two rows' seed tables`: flatten every
      row's ids and assert no duplicates. This is the invariant that makes a
      first-match scan well-defined — the day two rows share an id, one of them
      silently stops being pickable. (Structural invariant, not a registry
      restatement: it names neither the rows nor their count.)

- [x] **Step 2: Run it and watch it fail.**
      `npx vitest run tests/data/bodies/bodyPickRows.test.ts`
      Expected: FAIL — module not found.

- [x] **Step 3: Create the table** per the Interfaces block and point
      `resolvePickTable.ts`'s `body` arm at it, deleting the local
      `PICK_SEEDS_BY_BODY_ID`.

- [x] **Step 4: Rewrite `sceneBodyPickId`** as the scan plus the `starPickId`
      tail, hoisting the `type: 'body'` entry list to a module const rather than
      filtering `SOURCE_ENTRIES` per call. Rewrite its module header (`:1-10`,
      which enumerates the if-chain by name) to describe the table lookup, the
      Sun skip, and the unchanged `null`-means-SKIP contract.

- [x] **Step 5: Add the pack/unpack consistency case** to
      `tests/services/engine/frame/passes/sceneBodyPickId.test.ts`:
      `a packed caption id resolves back to the body it was packed for` —
      for one id per row (`SCENE_EARTH.id`, `'moon'`, `SGR_A_STAR.id`, `'s2'`,
      `'sirius'`), assert `resolvePick(unpackPick(sceneBodyPickId(id)!)!, deps)`
      equals `{ type: 'body', id }`. `deps` is the stub structure store from
      `tests/services/engine/helpers/resolvePickTable.test.ts:20`. This is the
      test that fails the day pack and unpack read different tables — the whole
      point of P2 — and a round-trip, not a mirror.
      The file's existing cases (`:20-38` and `:40-44`), **including the Sun
      decoding as `Source.FamousStar` at `:35-37`**, must pass untouched: that
      line is the proof the Sun skip preserved behaviour.

- [x] **Step 6: Verify.**
      `npx vitest run tests/data/bodies/bodyPickRows.test.ts tests/services/engine/frame/passes tests/services/engine/helpers`
      → green, then `npm run typecheck:fast`, then `npx tsc --noEmit`. Finish
      with a full `npm test` — the pick path is read from the label and
      selection layers too (`sceneBodyLabels.ts:144`).

- [x] **Step 7: Commit** (stage the listed paths only).

```
refactor(pick): one body pick-row table for pack and unpack

sceneBodyPickId scans the same BodyId-keyed table resolvePickTable decodes
through, so a new body row cannot be added to one side alone.
```

---

## Definition of Done

**Deliverable inventory**

- `rotationRowById` is the only rotation lookup in `src/data/bodies/`;
  `orientationForBody.ts` imports nothing from `bodyTextureRegistry.ts`.
- `src/data/bodies/bodyPickRows.ts` exports `BODY_PICK_ROWS`, total over
  `BodyId`, and is the only place naming a body row's seed array;
  `PICK_SEEDS_BY_BODY_ID` no longer exists in `resolvePickTable.ts`.
- `sceneBodyPickId.ts` has no per-body id chain — its only branch is the
  documented Sun skip; `starPickId.ts`, `starPointsPass.ts` and
  `starSpheresPass.ts` are unchanged by this PR.
- `tests/data/bodies/rotationElements.test.ts` carries no row-count assertion.

**Named observable behaviours** (manual smoke, one dev-server session)

- Click Earth's disc, then a planet's disc, then a famous star's dot: each
  opens the InfoCard for the body actually clicked.
- Click a body's **caption text** (not its disc) for the same three: the same
  InfoCard opens — this is the pack path Task 2 rewrote.
- Fly in to a planet at a scale where the texture is legible and let the clock
  run: the surface still turns, and the terminator sits where it did before.

**Deferral boundary**

- P3 (`bodySlabRow` near-plane widening), P4 (`partitionBodiesByPresentation`
  widening) and P5 (`rotateByTranspose` extraction) are **not** in this PR —
  they ride the feature plan.
- No `MeshBody` type, source entry, seed row, asset, renderer or shader
  appears in this PR. If a task seems to need one, the refactor drifted.
- The other pack sites (`planetsPass.ts:160`, `earthPass.ts:292`,
  `bodyGlintsPass.ts:424,477`, and `starPickId.ts` itself) keep their inline
  `packSelection` calls; folding the drawn-geometry pack path into
  `BODY_PICK_ROWS` — which would also retire the Sun skip — is a separate
  question, out of scope here.
