# MCPM Workbench — relationship to the main app, and production readiness

Read-only review. Repo: `/Users/rulkens/Development/js/skymap/.claude/worktrees/polyphorm-webgpu-tool`
(branch `refactor/point-renderer-name-and-slot-placement`, but the MCPM code
under review is unrelated to that branch's own diff).

## The tool's own stated purpose (quoted)

From `docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md` §1:

> An interactive workbench for fitting **MCPM** (Monte Carlo Physarum
> Machine) — the agent-based cosmic-web reconstruction behind the SDSS
> Cosmic Slime VAC — to skymap's own galaxy catalogs, in a browser tab, with
> live parameter tuning and a live view of the trace field.
>
> Its "save" is a hard requirement, not a nicety (Q1): the workbench must
> emit volumes the existing rhizome importer eats, so the tool has to
> reproduce real results rather than plausible-looking ones. That constraint
> is what keeps it from becoming a toy.

And from `tools/mcpm-workbench/README.md`:

> A WebGPU dev tool that visualises the **MCPM cosmic-web simulation** —
> the constrained-realisation dark-matter density field skymap's volume
> renderers already consume, driven live rather than baked offline.

Non-goals explicitly named in the spec (§2): bit-parity with the fork
("unreachable... validation is statistical"), any write to `public/data` or
the manifest from the browser (exports are downloads only), mobile/touch/
non-Chromium support ("this is a maintainer instrument").

So "production ready" for this tool cannot mean "ships to users" — it is
explicitly maintainer-only tooling. The only meaningful bar is: **does it
produce trustworthy volumes**, i.e. does its own validation gate pass.

---

## 1. Duplication vs. the main tool

| Area | Verdict | Evidence |
|---|---|---|
| Volume pack/encode (`packLogTraceVoxels`, `encodeScalarField`) | **Clean reuse** | `tools/mcpm-workbench/src/export/exportScfd.ts:5,14` imports `encodeScalarField` from `src/data/volume/scalarFieldFormat.ts` directly, with a comment: "the SAME packing." This is the P2 ground-prep refactor from the spec (`packLogTraceVoxels`/`f32ToF16Bits` moved `tools/utils/` → `src/utils/volume/` and `src/utils/math/`) — confirmed executed: `src/utils/volume/packLogTraceVoxels.ts` exists and is imported by both `tools/volumes/buildRhizomeVolume.ts:21` and the workbench. |
| Palette LUT | **Clean reuse** | Spec §7 / `tools/mcpm-workbench/src/render/uploadPaletteLut.ts` uses the existing `buildPaletteLut` (`src/data/volume/scalarFieldPalettes.ts:63`), same named palettes as the runtime volume renderer. |
| MCPM compute/view shaders | **Clean reuse (by construction)** | All `.wesl` kernels live at `src/services/gpu/shaders/mcpm/*.wesl` (17 files: `propagate.wesl`, `decay.wesl`, `grid.wesl`, `volpath.wesl`, `fragment.wesl`, etc.) — the runtime family, not tool-local. `tools/mcpm-workbench/wesl.toml` points `root` at that same tree so `package::mcpm::…` resolves identically in both apps (mirrors `tools/flow-workbench/wesl.toml`). Currently zero consumers *inside* `src/` (by design — "architected for," not built) — confirmed via `grep -rln "package::mcpm" src/` matching only the `mcpm/*.wesl` files' own internal cross-imports, nothing outside the family. The tool keeps exactly one local shader (`src/render/shaders/blit.wesl`, an HDR→swapchain blit), as flow-workbench does. |
| f16 codec pair | **Known, backlogged duplication (not new)** | `src/utils/math/f16ToFloat.ts` and `tools/utils/math/f16BitsToFloat.ts` are the same full-range decoder written twice. The spec calls this out itself (§3 "Adjacent finding") as pre-existing and explicitly defers consolidation to `docs/BACKLOG.md` rather than folding it into this PR — an honest, not swept-under-rug, duplication. |
| Orbit camera / pointer-drag input | **Divergent fork — the expensive one, and it's now a THREE-way fork** | `tools/mcpm-workbench/src/ui/Viewport.tsx:900-965` hand-rolls its own yaw/pitch/distance orbit camera + pointer/wheel handling (`DRAG_SPEED`, `ZOOM_SPEED`, `PAN_SPEED` local constants), with a comment citing "galaxy-renderer's `createOrbitCameraInput`" as the feel it's matching. But it does **not** import that module (`tools/galaxy-renderer/src/engine/camera/createOrbitCameraInput.ts`) — it re-derives the same pointerdown/move/up + right/middle-drag-pan + exponential-wheel-zoom logic from scratch. `tools/flow-workbench/src/ui/Viewport/Viewport.tsx` has its own third independent copy (`DRAG_SPEED = 0.005; // radians per pixel (spike)`, its own constants). None of the three shares a module; none imports `src/services/camera/orbitControls.ts` (the main app's real orbit input, which is legitimately unreusable — it's wired to Redux intent state, `docs/superpowers/conventions/` notwithstanding). The result: the same ~60-line event-handling shape has been retyped three times with three different tuned constants and slightly different feature sets (galaxy-renderer has auto-rotate damping + lens shift; mcpm-workbench interleaves gizmo drag detection into the same handlers). This is real, already-drifted duplication — not a hypothetical. |
| Grid-box gizmo (drag handles, ray-picking) | **New, tool-local — not duplicated, but scope growth beyond the spec** | `tools/mcpm-workbench/src/gizmo/` (9 files: `pickGizmoHandle.ts`, `dragRotate.ts`, `applyTranslateDrag.ts`, `screenToRay.ts`, `rayPlaneIntersect.ts`, `closestPointOnRayToLine.ts`, `gizmoHandleGeometry.ts`, `applyResizeDrag.ts`, `encodeGizmoHandleId.ts`) plus `render/boxPreviewPass.ts` and `render/galaxyOverlayPass.ts`. **None of this appears anywhere in the spec's §4 architecture listing** — the spec names `sim/`, `field/`, `export/`, `render/`, `state/`, `ui/`, `validate/`; `gizmo/` is absent. The commit log (`git log --oneline -- tools/mcpm-workbench`) shows ~20 commits building a full Blender-style translate/rotate/resize gizmo for the grid box after the spec was written. It's well-factored internally (one function per file, ray-math primitives split cleanly) but it is unplanned scope: a UI subsystem the design doc never anticipated, added ad hoc. Not a duplication finding, but a **spec-drift** finding worth flagging alongside Q1. |
| Math primitives (`cross3`, `normalize3`, `rotateVec3ByQuat`) | **Clean reuse** | `tools/mcpm-workbench/src/render/cameraBasis.ts:1-6` imports these directly from `src/utils/math/`, deep relative import, no copy. |

**Worst divergent fork:** the orbit-camera/pointer-input logic, now independently reimplemented in three sibling tools (galaxy-renderer, flow-workbench, mcpm-workbench) with no shared module, each with its own tuned constants. It's not catastrophic (each tool is small and the logic is simple), but it's the textbook "second `if (source === X)`" signal from `simplicity.md` §"Refactoring this codebase" — the third copy is the one that should have triggered consolidation into a shared `tools/utils/` (or a `common` dev-tool package), and didn't.

---

## 2. The pipeline seam

**Verdict: a real, working seam exists, but it is explicitly a *preview* path, not a promotion path — and that gap is the tool's actual #1 production risk, compounded by an open, unresolved validation failure.**

The chain is:
1. Workbench readback → `exportNpy.ts` (`.npy`, f16, C-order via `xFastestToCOrder.ts`) + `emitTraceSidecar.ts` (`polyphy-trace` v1 JSON sidecar, snake_case, same basename).
2. `npx tsx tools/volumes/buildRhizomeVolume.ts <file>.npy --out <path>.scfd` — this is real, already-existing production code (`tools/volumes/buildRhizomeVolume.ts:1-274`), P3-relaxed (per the spec's ground prep) to accept `<f2` .npy by widening through `f16BitsToFloat` before packing. Confirmed executed: the guard at `buildRhizomeVolume.ts:96-102` explicitly accepts `Uint16Array` (f16) inputs.
3. A `--quick-look` mode (`buildRhizomeVolume.ts:228-244`) goes further: it writes straight to `public/data/scalar-field/v3/mcpm-large.scfd` — **the exact production filename the runtime volume renderer fetches** (via `MCPM_TIER_FILENAME[2]`, imported from `buildMcpmVolume.ts:45`) — and calls `buildDataManifest()` so the manifest repoints to it immediately.

So mechanically, "found good params → app renders them" is a one CLI-command hop, and the seam is real (verified working end-to-end per `tools/mcpm-workbench/README.md`'s "Phase 2 gate": leg 1/2/3 all PASS, byte-identical `.scfd` outputs).

**But it is deliberately ephemeral, not a promotion.** `buildRhizomeVolume.ts:146-150` writes a **sentinel file** at every quick-look call, whose message is: *"quick-look cube written by buildRhizomeVolume... run `npm run build-mcpm` to restore the shipped reference and clear this sentinel."* That is the load-bearing fact: the **real** production `mcpm-{small,medium,large}.scfd` comes from an entirely separate, unrelated pipeline — a one-time Python + pyslime extract of the official SDSS DR17 Cosmic Slime VAC (`docs/DATA.md` "MCPM Cosmic Web volume" section), run through `npm run build-mcpm` (`buildMcpmVolume.ts`), which has *nothing to do with* the workbench's live agent simulation. The workbench doesn't feed the VAC pipeline at all — it's a parallel, competing producer of the same filename slot, explicitly framed as a temporary local override that the next `npm run build-mcpm` (a teammate's machine, or any script that runs it) will silently clobber, with only a gitignored sentinel as the tripwire.

There is **no permanent adoption path**: nothing registers "this exported `.npy`+`.json` pair, tuned to these `McpmParams`, is now the canonical shipped cube." The sidecar's `provenance.params` (spec §8) captures full reproducibility per-export, but nothing commits that JSON anywhere — the spec says outright "No git commit rides the provenance... the browser cannot know it." If a maintainer wanted the workbench's fit to become the *actual*, durable production artifact (not a scratch quick-look), the missing joint is: a tracked pointer (e.g. a `data/raw/mcpm/workbench-preset.json` or a registry entry) saying "the shipped `mcpm-large.scfd` was last produced by workbench export X with these params," so a rebuild reproduces it instead of reverting to the VAC reference.

**On top of the missing promotion joint, the validation gate the tool's own spec requires is currently failing, openly.** `tools/mcpm-workbench/README.md`'s "Validation (Phase 3 gate)" section (last updated 2026-08-18) reports the workbench-vs-fork comparison missing its own derived acceptance band by **79×–7300× depending on the statistic** (`dataPointHistogram TV` misses by ~79×, `meanLogTraceAtPoints` relative difference misses by ~7300×), with a **9.28× total-trace-mass ratio** against the reference VAC anchor still open and explicitly flagged for a "T24 quirk-strip" investigation that hasn't run yet. This matches the user's own memory note ("MCPM ... mass ratio 9.28× open, awaiting T13 eyes + Phase 4 call"). Per the spec's own Purpose statement — "the workbench must emit volumes the existing rhizome importer eats, **so the tool has to reproduce real results rather than plausible-looking ones**" — the tool has not yet cleared the bar it set for itself. Exporting from it today and quick-looking that into production would ship a cube the tool's own comparator says disagrees with the reference by up to three orders of magnitude on one statistic.

---

## 3. Entry points & build

- **Launch:** `npm run mcpm-workbench` → `vite --config tools/mcpm-workbench/vite.config.ts` (port 5500, `publicDir` pointed at the shared `public/`, so it serves the same `public/data/galaxy-catalog/v9/*.bin` the runtime fetches). `npm run mcpm-workbench:probe` (headless GPU-error gate, Playwright-driven, follows `tools/galaxy-renderer/probeGpuErrors.ts`'s pattern) and `npm run mcpm-workbench:compare` (the Node comparator CLI) round out the three scripts (`package.json:61-63`).
- **Excluded from the main app build:** confirmed — no import from `src/` into `tools/mcpm-workbench` exists (`grep -rln "mcpm-workbench" src/` returns nothing), and the `.wesl` shaders it needs live in `src/services/gpu/shaders/mcpm/` with zero `src/` consumers currently, so `wesl-plugin`'s import-driven linking means those files are inert dead weight in the main build, not a liability.
- **`typecheck` coverage:** yes. `tsconfig.tools.json` (`include: ["tools", "src"]`) covers the whole `tools/` tree with no `mcpm-workbench`-specific exclusion, and CI (`.github/workflows/ci.yml:33`) runs `npm run typecheck` as a hard gate. A tool-local `tsconfig.json` exists only for editor resolution (extends the root, adds `../../src`, `../../tools/utils`), matching the sibling-tool pattern.
- **Test coverage:** `tests/tools/mcpm-workbench/` exists with 46 files, and `npm test` (vitest run, hard-gated in CI at `ci.yml:42`) covers it. The GPU probe (the only gate that reaches the actual compute kernels) is **not** in CI — consistent with the other GPU dev tools (no headless-GPU CI runner), and is run manually per the README's phase-gate log.
- **Live WIP artifacts on this checkout, not yet committed:** `tools/mcpm-workbench/diagVolpath.ts.tmp.ts` (94 lines, untracked) and an uncommitted diff to `Viewport.tsx` that adds a `window.__volpathResets` diagnostic array explicitly commented `// DIAGNOSTIC — temporary, removed before commit.` Neither is a structural problem — it's mid-session debugging residue — but it means the tool is actively, not just historically, in flux; nothing here should be read as a stable baseline.
- **Cross-dependency in the other direction:** none found — the main app does not import anything from `tools/mcpm-workbench`.

---

## 4. Convention fit (sampled, not exhaustive)

- **`type`, never `interface`:** clean. `grep -rn "^interface \|export interface " tools/mcpm-workbench/{src,@types,validate}` returns nothing.
- **One type per `@types` file:** clean on the two sampled (`GridBox.d.ts`, `AppState.d.ts` each export exactly one `export type`).
- **One function per file in the utils-shaped folders (`field/`, `gizmo/`, `sim/`, `export/`):** clean on the three sampled (`autoFitGridBox.ts`, `pickGizmoHandle.ts` each export exactly one `export function`/`export const`). State slice files (`gridSlice.ts`, 10 exports) are exempt by category — they mirror `src/state/slices` shape, not `src/utils/`.
- **Deep relative imports, no barrels:** consistent with what was sampled (`cameraBasis.ts`, `exportScfd.ts` import `../../../../src/...` directly).
- **Comment budget:** the one file sampled in depth (`autoFitGridBox.ts`, 42 lines) runs ~24% comment lines — well inside the ≤50% budget.
- **Component size:** `ui/Viewport.tsx` is 994 lines and `ui/ControlsPanel.tsx` is 764 lines — both far past the "~120 lines, split it" guidance the `create-component` skill applies to `src/components/`. That convention is scoped to the main app's component folder, but the same simplicity pressure applies: `Viewport.tsx` alone now hosts camera input, gizmo drag state machines, render-graph invocation, and volpath-reset-key diagnostics in one file. Worth a look even though it isn't a hard rule violation.

---

## Honest production-readiness verdict

"Production" for this tool cannot mean "shipped to end users" — the spec says so explicitly (non-goal: mobile/touch/non-Chromium, "this is a maintainer instrument"). The only sense that applies is **trustworthy internal tooling**: does running it and exporting produce a volume the maintainer can believe, and can that belief become the shipped asset without hand-waving.

On that bar: **not yet.** The export mechanics work end-to-end and are well-tested (Phase 2 gate: byte-identical `.scfd` round trip, real tests). But the tool's own Phase 3 validation — the thing that would let a maintainer trust an exported cube — is currently failing by 79×–7300× against its derived acceptance band, with the root cause (9.28× mass ratio) explicitly open and unassigned to a specific next step beyond "T24 quirk-strip." Today, the honest thing to do with an export is treat it as a debugging tool for the sim itself, not as a source of shipped data.

### Top improvements, ranked by leverage

1. **Close the validation gap (mass-ratio root cause) — L.** This is the actual blocker to calling the tool trustworthy. It requires the Phase 4 quirk-strip work the spec already scopes (`docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md` §13 Phase 4) — flip each quirk override individually and see which one moves the 9.28× ratio. Large because it's an open-ended numerics investigation with a slow (~500s/run) validation loop.

2. **Make "adopt this export as production" a real, tracked action instead of a self-clobbering quick-look — M.** Add a small registry entry or committed pointer (e.g. `data/raw/mcpm/PRODUCTION_SOURCE.json` noting `{ producer: 'workbench' | 'vac-extract', sourceExportStem, params }`) that `npm run build-mcpm` checks before silently overwriting a quick-look, and that `sync-r2`/docs can cite. Medium because it's mostly a small new file + a guard in two existing scripts, not new simulation work.

3. **Consolidate the orbit-camera/pointer-input logic — S/M.** Three independent copies now exist (galaxy-renderer, flow-workbench, mcpm-workbench). Extract one shared module (e.g. `tools/utils/render/createOrbitCameraInput.ts` or similar, parameterized for the small feature differences — auto-rotate damping is galaxy-renderer-only, gizmo interleaving is mcpm-workbench-only) and have the three tools compose it. Small-to-medium: the logic itself is short, but retrofitting three call sites with slightly different state shapes (yaw/pitch vs az/el, closure-state vs external store) needs care.

4. **Split `Viewport.tsx` (994 lines) — S.** Pull the gizmo-drag pointer-event wiring and the volpath-reset-key diagnostics into their own modules, leaving `Viewport.tsx` as render-loop orchestration only. Small, mechanical, no behavior change.

5. **Land or discard the in-progress WIP — S.** `diagVolpath.ts.tmp.ts` and the `Viewport.tsx` diagnostic-array diff are explicitly marked temporary; either finish the investigation and remove them, or commit them properly if they're staying. Trivial but should not be left dangling.
