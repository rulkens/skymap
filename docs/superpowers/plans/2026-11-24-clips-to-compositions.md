# Clips move to the composition (prep for body content out of core, PR D)

> **For agentic workers:** execute with `superpowers:subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax.

**Goal:** the clip registry is a static registry in `src/compositions/`, and `ClipId` is derived
from it. Core keeps no clip table and no hand-written id union. No behaviour change in the app.

**Authority:** [ADR 0013](../../adrs/0013-registries-built-from-layer-contributions.md) (closed
unions are derived from the composition; a clip that drives a Layer's content is composition
content in `clips/`). Precedent: `APP_TOUR_REGISTRY` / `TourId` (#1160). This closes the
`ClipId`, `clipRegistry` TODO row of `src/compositions/README.md` and leftover J4. No spec: the
ADR and the precedent fix the shape, and the owner chose "as prep PR" on 2026-11-24.

**Why now:** three clip files read `SCENE_EARTH` at module scope and the registry runs every
factory at import, so core's sagas throw at load in a composition with no Earth row
([body-content spec](../specs/2026-11-24-body-content-out-of-core-design.md) §7). Once the
registry is an `app*.ts` file, such a composition swaps it like `appTours` and `appHome`.

**Not in this PR:** a `clips?` Layer member (ruled out by the ADR), any change to a clip's
content, the galaxies-only composition, the empty-registry test (PR D).

## Global constraints

- Moves go through `npm run move-files` (`--dry` first), never `git mv` plus hand edits. Symbol
  renames go through `npm run refactor -- rename`. Read `.claude/skills/refactor/SKILL.md` first.
- Never stage `tools/reference-engine/`, `src/compositions/galaxiesOnly.ts`, `.payoff-dist*`,
  `src/services/engine/frame/checkFrameOrder.ts` or `src/services/engine/frame/runPlanSteps.ts`
  (the last two carry a local measuring patch). Never `git add -A`. Do not run `npm run format`;
  run `npx prettier --write` on the files you edited.
- One commit per task, no `Co-Authored-By` line. Git as plain single commands, never `git -C`.
- A Layer may not import `src/compositions/`. Files in `src/compositions/clips/` may import a
  Layer's `state/` modules only (`tests/conventions/layerImportBoundary.test.ts`).
- Clip ids, labels and timelines come out identical: ids are in shared links and the recorder.

## Rulings made at plan time

- **`makers/flyToPoseClip.ts` stays in core** at its current path. It names no body, and a Layer
  (`missions/timeline/sagas/missionHoldSaga.ts`), `exhibitBodySaga`, `takeover/selectors` and
  `utils/sky/clips/returnClip.ts` read it. It is a mechanism.
- **`grandTourBeats.ts` moves with the rest.** It only re-exports the grand tour's beats under
  clip ids, from `src/compositions/tours/grandTour/`.
- **One file, two exports:** `appClips.ts` holds `APP_CLIP_FACTORIES` (the source of truth) and
  `APP_CLIP_REGISTRY` (the same factories resolved at J2000), as `clipRegistry.ts` does today.
- **`ClipId` is `keyof typeof APP_CLIP_FACTORIES`**, in the same file as today
  (`src/@types/animation/ClipId.d.ts`), so its 25 importers do not change.

---

### Task 1: Clip files move to `src/compositions/clips/`

**Files:** move `src/data/animation/clips/{earthCosmicWebLoop,earthFlyout,earthUniverseLoop,famousFlythrough,flowOrbit,flyout,flyPathDemo,grandTourBeats,perseveranceToSondermarken,sondermarkenFlyout}.ts`
→ `src/compositions/clips/`, and `makers/makeEarthLoop.ts` → `src/compositions/clips/makers/`.
`clipRegistry.ts` and `makers/flyToPoseClip.ts` stay. The `tests/` mirror follows.

- [x] One `move-files` manifest, `--dry` first. Fix every finding it lists.
- [x] Grep for the old paths in non-import strings and repoint them:
      `packages/website/src/data/facts.ts:179`, `tools/record/README.md:203`, any comment.
- [x] `npm run typecheck`, `npm test`. Commit.

### Task 2: The registry is `appClips.ts`; `ClipId` follows from it

**review: yes** (closed union becomes derived; 11 readers repointed)

**Files:** `src/compositions/appClips.ts` (create, from `clipRegistry.ts`),
`src/data/animation/clips/clipRegistry.ts` (delete), `src/@types/animation/ClipId.d.ts`,
`tests/compositions/appClips.test.ts` (from `tests/data/animation/clips/clipRegistry.test.ts`);
readers: `src/state/navigation/navigateSaga.ts`, `src/state/camera/clipBodySaga.ts`,
`src/state/camera/watchClipPathInspectSaga.ts`, `src/state/remote/remoteCommands.ts`,
`src/state/remote/remoteMenu.ts`, `src/components/DebugPanel/ClipPathInspectorSection.tsx`,
`src/components/DebugPanel/ClipTriggersSection.tsx`, `tools/record/record.ts`,
`tools/site/utils/appViewProblem.ts`, and the tests that import the registry.

**Contract:**

```ts
// src/compositions/appClips.ts
export const APP_CLIP_FACTORIES = {
  cosmicFlows: () => cosmicFlows,
  earthFlyout,
  // ... every row of today's table, same keys, same order
} satisfies Record<string, (simDays: number) => Clip>;

export const APP_CLIP_REGISTRY: Record<ClipId, Clip> = /* each factory at CONST_J2000 */;

// src/@types/animation/ClipId.d.ts
import type { APP_CLIP_FACTORIES } from '../../compositions/appClips';
export type ClipId = keyof typeof APP_CLIP_FACTORIES;
```

- [x] Move the file with `move-files`, rename the two exports with `refactor rename`
      (`clipFactories` → `APP_CLIP_FACTORIES`, `clipRegistry` → `APP_CLIP_REGISTRY`).
- [x] Derive `ClipId`; delete the hand-written union. The header keeps the "ids are in shared
      links, add rows, retire deliberately" note, as `TourId.d.ts` has it.
- [x] `Clip.id` is typed `ClipId`, so the type now refers back to the table. If `tsc` reports a
      circular reference, **stop and report**: do not widen `Clip.id` or add a cast.
- [x] The moved test keeps both cases (id equals key; label and timeline present). Its header
      loses the sentence about the `Record<ClipId, Clip>` typing.
- [x] Repoint `packages/website/src/data/docsReferenceFacts.ts:328` and
      `tools/record/README.md:173`.
- [x] `npm run typecheck` (the `tsc` 6 gate, not only `:fast`), `npm test`, `npm run build`.
      Commit.

### Task 3: Ledger and backlog say what is true

**Files:** `src/compositions/README.md`, `docs/backlog/2026-10-29-layer-migration-leftovers.md`,
`docs/BACKLOG.md`.

- [x] README row `ClipId`, `clipRegistry` → `ClipId`, `APP_CLIP_REGISTRY`: built in
      `src/compositions/appClips.ts` and `ClipId.d.ts`, "static, by import; `ClipId` is `keyof`
      the registry", core readers recounted with the README's own `git grep -l` recipe, DONE.
      Tally line: 30 DONE, 3 TODO. Line 4 already names `clips/`.
- [x] Leftovers: delete the J4 table row and its section; fix the NEEDS-JOINT total (minus ~480).
- [x] `docs/BACKLOG.md:295` names `src/data/animation/clips/cosmicFlows.ts`, which no longer
      exists: point it at `src/compositions/clips/cosmicFlows.ts`.
- [x] Commit.

## Definition of Done

- [ ] `git grep -n "data/animation/clips"` finds only `makers/flyToPoseClip` paths.
- [ ] No file under `src/` outside `src/compositions/` states a clip id list.
- [ ] `npm run typecheck`, `npm test`, `npm run build` green.
- [ ] `npm run perf` before and after at earth-surface, solar-system, full-survey: no regression
      (no per-frame code is touched; this is the standing gate on every prep PR).
- [ ] Smoke: [`#clip=earthFlyout`](http://localhost:5176/#clip=earthFlyout) and
      [`#tour=grandTour`](http://localhost:5176/#tour=grandTour) start without a console error.
