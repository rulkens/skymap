# wireSlots Refactor — Implementation Plan (INDEX)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `wireSlots` from a ~530-line eight-job bootstrap phase into a thin orchestrator that builds asset slots from a declarative registry, installs them once, wires the four non-loading subsystems via extracted modules, and runs a single demand-driven load evaluation.
**Architecture:** A new `services/engine/wiring/assetWiring.ts` declarative registry (`ASSET_WIRING`, keyed by `AssetKey`) carries each fetchable asset's pure factory, request builder, and `demand` predicate. A single `reevaluateDemand(state)` evaluator replaces the ~5 scattered load triggers. Four concerns (impostor subsystems, overlay fades, POI projection via keyed groups, synthetic fallback) move out of the phase as pure relocations. Factories stop self-installing; the orchestrator does the single install. Operates against the CURRENT `state.sources.*` / `state.assetSlots.*` shape — the Spec-2 store rename is mechanical and deferred.
**Spec:** docs/superpowers/specs/2026-06-01-wireslots-refactor-design.md
**ADR:** docs/adrs/0005-engine-data-layer-and-asset-loading.md

---

## How this plan is split

The refactor is large enough that one file would obscure the dependency order.
Three sequential parts, each independently committable and green:

1. **[Part 1 — Extracted modules](2026-06-01-wireslots-refactor-1-extracted-modules.md)**
   Pure relocation of the four non-loading concerns out of `wireSlots`, plus
   the `poiSubsystem` keyed-group API change. No behavior change, no demand
   model yet. Lands first because it shrinks `wireSlots` and is rework-proof.
   *Tasks 0–5.*

2. **[Part 2 — Asset-wiring registry & demand evaluator](2026-06-01-wireslots-refactor-2-asset-wiring-registry.md)**
   The new `assetWiring.ts` (`ASSET_WIRING`, `AssetKey`, `AssetWiringRow`,
   `DemandCtx`), the `reevaluateDemand(state)` evaluator, and the construction
   purity refactor of the seven slot factories (stop self-installing, stop
   self-`load()`ing). Includes the two behavior-change bug fixes (filaments +
   clusterCatalog load-when-disabled gating). *Tasks 6–14.*

3. **[Part 3 — Orchestrator rewire & event triggers](2026-06-01-wireslots-refactor-3-orchestrator.md)**
   Thin the `wireSlots` orchestrator to build-from-registry → single install →
   extracted wires → `reevaluateDemand`. Rewire the event-driven triggers
   (`setSourceVisible`, `setVolumeFieldEnabled`, `loadPgcAliases`) and the
   synthetic-fallback gate to flip state + re-evaluate. Bootstrap parity tests.
   *Tasks 15–20.*

**Execution order is strict:** Part 1 → Part 2 → Part 3. Part 3 deletes the
last of the in-`wireSlots` load loop, which only works once Parts 1 and 2 have
landed their replacements.

---

## Conventions every task in every part must follow

These override defaults; quoted once here, referenced by each task.

- **Comment cleanup pass on the WHOLE file, every file you touch.** Each task
  that creates or modifies a `.ts` file ends with a *whole-file* comment pass.
  The convention is **`feedback_comment_style`: timeless and terse** — remove
  history notes (dates, PR refs, "pre-X", "previously…", "used to"), strip
  stale/obsolete comments, keep explanations of current state; punchy over
  verbose.
  **CRITICAL NUANCE — strip without gutting.** This project *values* didactic,
  learning-oriented comments: multi-paragraph module headers explaining *why*
  and *what the rejected alternative was* (see CLAUDE.md). "Cleanup" means
  making those timeless and terse, **not** deleting them. A module header that
  explains the demand model's rationale stays; a comment saying "(was the boot
  loop, removed 2026-06-01)" goes.
  **The didactic comments themselves may be made more terse.** Preservation is
  not verbatim — keep the *why* and the rejected alternative, but tighten
  wordy prose. A four-paragraph header that says the same thing in six lines
  *should* be trimmed; punchy over verbose (`feedback_comment_style`). The bar
  is "a reader still learns the why in less time", not "every original sentence
  survives".
- **TDD, bite-sized, frequent commits.** Failing test first, then minimal
  implementation, then green, then commit. Each task lists exact Create/Modify/
  Test paths, test names + assertions as the contract, the exact `npm test` /
  `npm run typecheck` invocation with expected pass/fail, and a commit step.
- **Contract code only.** Reproduce type signatures, test names + assertions,
  and tiny before/after sketches. Do NOT paste full function bodies or
  copy existing code — cite `path/to/file.ts:123-145` and read current state.
- **Commits use the user's git identity.** Message body ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
  Stage specific paths only — never `git add -A` / `git add .`. Branch +
  commit only; this plan does not push or open a PR.
- **`type` aliases never `interface`.** One type per file under `src/@types/`.
  Deep relative imports, no barrels.
- **Dev server stays running.** Do not kill `npm run dev`.

---

## Naming contract (consistent across all three parts)

| Symbol | Kind | Home |
|---|---|---|
| `AssetKey` | type | `src/@types/loading/AssetKey.d.ts` |
| `AssetWiringRow<T, R>` | type | `src/@types/loading/AssetWiringRow.d.ts` |
| `DemandCtx` | type | `src/@types/loading/DemandCtx.d.ts` |
| `RequestKey` | type | `src/@types/loading/RequestKey.d.ts` |
| `ASSET_WIRING` | `readonly AssetWiringRow[]` | `src/services/engine/wiring/assetWiring.ts` |
| `reevaluateDemand` | `(state) => void` | `src/services/engine/wiring/reevaluateDemand.ts` |
| `buildSlotsFromRegistry` | `(rows, deps) => Map<AssetKey, AssetSlot>` | `src/services/engine/wiring/buildSlotsFromRegistry.ts` |
| `installSlots` | `(state, slots) => void` | `src/services/engine/wiring/installSlots.ts` |
| `wireImpostorSubsystems` | `(state, deps) => void` | `src/services/engine/wiring/wireImpostorSubsystems.ts` |
| `registerOverlayFades` | `(state) => void` | `src/services/engine/wiring/registerOverlayFades.ts` |
| `wirePoiProjection` | `(state) => void` | `src/services/engine/wiring/wirePoiProjection.ts` |
| `createSyntheticFallback` | `(state) => SyntheticFallback` | `src/services/engine/wiring/createSyntheticFallback.ts` |
| `installLoadProgress` | `(state, deps) => void` | `src/services/engine/wiring/installLoadProgress.ts` |
| `poiSubsystem.setGroup` / `.clearGroup` | methods | `src/services/engine/subsystems/poiSubsystem.ts` |

If any name here disagrees with the spec, the spec wins — flag and stop.

---

## Spec-section → task coverage map

| Spec section | Covered by |
|---|---|
| What moves out §1 (impostor subsystems) | Part 1, Task 1 |
| What moves out §2 (overlay fades) | Part 1, Task 2 |
| What moves out §3 (POI keyed groups + `setGroup`/`clearGroup`) | Part 1, Tasks 3–4 |
| What moves out §4 (synthetic fallback) | Part 2, Task 13 |
| Asset-wiring registry (`ASSET_WIRING`, `AssetKey`, `AssetWiringRow`) | Part 2, Tasks 6–8, 10 |
| Demand model (`DemandCtx`, `reevaluateDemand`) | Part 2, Tasks 9, 11 |
| Demand table (per-asset predicates) | Part 2, Task 10 |
| Construction purity (factories return, single install) | Part 2, Task 12; Part 3, Task 15 |
| Bug fix: filaments load-when-disabled | Part 2, Task 10 (row) + Task 11 (test) |
| Bug fix: clusterCatalog unconditional boot load | Part 2, Task 10 (row) + Task 11 (test) |
| Thinned `wireSlots` orchestrator | Part 3, Task 15 |
| Event triggers re-evaluate (visibility / volume / palette) | Part 3, Tasks 16–18 |
| Error handling (guarded `demand` loop) | Part 2, Task 9 |
| Testing: extracted-module units | Part 1, Tasks 1–4 |
| Testing: data-driven demand table | Part 2, Task 11 |
| Testing: POI keyed-group out-of-order | Part 1, Task 4 |
| Testing: bootstrap parity | Part 3, Task 19 |

---

## Definition of Done (whole plan)

- [ ] All tasks across Parts 1–3 ticked.
- [ ] `npm test` green; test count increased by the per-part new tests.
- [ ] `npm run typecheck` green.
- [ ] `wireSlots.ts` is the thin orchestrator from the spec (§"Construction
  purity & single install"); no slot-load loop, no inline POI merge, no inline
  fade registration, no inline impostor construction.
- [ ] No factory writes `state.assetSlots.X = slot` or calls `slot.load()` at
  construction time.
- [ ] `reevaluateDemand` is the only place `slot.load(...)` is called for
  registry-managed assets; the only remaining explicit loads are the two
  event-driven re-evaluation triggers (palette request, synthetic gate), which
  flip state then call `reevaluateDemand`.
- [ ] Filaments and clusterCatalog no longer load when their settings flag is
  off (the two bug fixes), each pinned by a test.
- [ ] No `TODO` / `FIXME` introduced in touched files.
- [ ] Every touched file has had its whole-file comment-cleanup pass.
- [ ] Manual dev-server smoke shows bootstrap parity: Milky Way on frame 1,
  surveys fade in, structures/filaments/volumes respect their toggles.
