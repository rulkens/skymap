# Flow-Field Integration — Phase D: Settings, Handle & UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`](../specs/2026-06-04-flow-field-integration-design.md) — the approved design. Source of truth.
> - [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) — contract code yes, implementation code no.
>
> **Depends on:** Phase B (the `FlowFieldStore` + `data.flow`; the `flow` demand row whose predicate the enable setter must re-evaluate) and Phase C (`flowFieldRenderer.maybeReseed()` the mode/count setters call; the renderer reading the store each frame).
>
> **Conventions** (from `CLAUDE.md` + memory):
> - No barrel exports for components — import `.tsx` directly; one component per file; own folder + `.module.css`; `function Name()` + `export default Name`; top-level `.root` class.
> - `type` aliases never `interface`; one type per file under `src/@types`; deep relative imports.
> - No sycophancy in comments; comments timeless + terse.
> - Background subagents can't run npm/git; the main thread runs tests/typecheck/commits. Never `git add -A`.
> - **Commits:** conventional-commits style (shown per task); use the user's git identity (never `--author=Claude…`); end every commit body with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Goal

`EngineFlowFieldsHandle` exposes the flow setters (each wrapping a store mutator +
`requestRender()`, and re-evaluating demand / reseeding where needed), wired onto
the engine handle. The SettingsPanel grows a user-facing Flow row (enable toggle,
mode switch, intensity slider). The DebugPanel grows a dev tuning subsection
(count, trail, flowSpeed, densityBias, wander).

## Architecture

Decision §8: there is **no separate `settings.flow` slice** — for a single layer,
"master enabled" and "layer enabled" are the same flag, owned by the store. So
the handle setters write `state.data.flow` directly (not a settings leaf via
`settingsTable`), then call `requestRender()` and — for `enabled` — `reevaluateDemand`
(so the first enable triggers the demand-driven load) plus a fade, and — for
`mode`/`count` — `flowFieldRenderer.maybeReseed()` (the shared buffers reseed on
switch). This mirrors the `volumes` handle, which also routes through
store-mutating closures rather than `settingsTable`. The SettingsPanel reads the
store via a snapshot callback (like the volume-fields snapshot) and the DebugPanel
adds a sibling section.

## Tech Stack

TypeScript + React (UI). Vitest (`node`) for the handle setter behaviour
(store mutation + render request + demand re-eval + reseed). React component tests
follow the existing SettingsPanel/DebugPanel test conventions (or are verified
visually via the dev server — the project leaves `npm run dev` running for HMR
checks).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/@types/engine/handles/EngineFlowFieldsHandle.d.ts` | The handle type — enable/mode/intensity + dev setters. |
| `src/components/SettingsPanel/FlowRow.tsx` | User-facing Flow row: toggle + mode switch + intensity slider. |
| `src/components/SettingsPanel/FlowRow.module.css` | Row styling (mirrors `VolumeFieldRow.module.css`). |
| `src/components/DebugPanel/FlowTuningSection.tsx` | Dev subsection: count / trail / flowSpeed / densityBias / wander sliders. |
| `tests/services/engine/flowFieldsHandle.test.ts` | Setter behaviour. |

**Modified:**

| File | Change |
|---|---|
| `src/@types/engine/Engine.d.ts` (or the handle bag type) | Add `readonly flow: EngineFlowFieldsHandle`. |
| `src/services/engine/engine.ts` | Build the `flow` handle; add a flow snapshot callback. |
| `src/components/SettingsPanel/SettingsPanel.tsx` | Mount `FlowRow`. |
| `src/components/DebugPanel/DebugPanel.tsx` | Mount `FlowTuningSection`. |

---

## Task 1: `EngineFlowFieldsHandle` type + engine wiring

**Files:** `src/@types/engine/handles/EngineFlowFieldsHandle.d.ts` (create), `src/@types/engine/Engine.d.ts` (modify), `src/services/engine/engine.ts` (modify), `tests/services/engine/flowFieldsHandle.test.ts` (create)

The handle setters wrap store mutators + `requestRender()`. `setEnabled`
additionally fades (the toggle-fade pattern the filaments/milkyWay handles use)
and calls `reevaluateDemand` so the first enable triggers the lazy load.
`setMode` and `setCount` additionally call `flowFieldRenderer?.maybeReseed()`
(shared buffers reseed on mode-switch / count-change — decision §3, §5).

```ts
// src/@types/engine/handles/EngineFlowFieldsHandle.d.ts
import type { FlowMode } from '../../data/FlowMode';

/**
 * EngineFlowFieldsHandle — peculiar-velocity flow-layer controls.
 *
 * Default-off, opt-in. `setEnabled(true)` lazy-loads the velocity cube via the
 * demand model. `setMode` / `setCount` reseed the shared particle buffers.
 * Setters with no range note clamp inside the store.
 */
export type EngineFlowFieldsHandle = {
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: FlowMode) => void;
  setIntensity: (value: number) => void;     // [0, 1]
  // ── Dev tuning (DebugPanel) ──
  setCount: (value: number) => void;          // [0, MAX_PARTICLES]
  setTrail: (value: number) => void;
  setFlowSpeed: (value: number) => void;
  setDensityBias: (value: number) => void;    // [0, 1]
  setWander: (value: number) => void;
};
```

**Setter behaviour contract:**

- `setEnabled(v)` → `state.data.flow.setEnabled(v)`; `fades.fadeTo({kind:'flow'}, v?1:0, …)` (register a `'flow'` fade kind if the FadeRegistry needs one — otherwise skip the fade and document why); `reevaluateDemand(state)`; `requestRender()`.
- `setMode(m)` → `state.data.flow.setMode(m)`; `flowFieldRenderer?.maybeReseed()`; `requestRender()`.
- `setCount(n)` → `state.data.flow.setCount(n)`; `flowFieldRenderer?.maybeReseed()`; `requestRender()`.
- `setIntensity` / `setTrail` / `setFlowSpeed` / `setDensityBias` / `setWander` → store mutator + `requestRender()` only (no reseed — they take effect on the next steady frame).

- [ ] Create the handle type file.
- [ ] Add `readonly flow: EngineFlowFieldsHandle` to the engine handle bag type.
- [ ] In `engine.ts`, build the `flow` handle (near the `filaments` / `volumes` handle blocks) per the behaviour contract. Add a flow snapshot callback `cb.flow?.onChange?.(snapshot)` if the SettingsPanel needs reactive state (mirror `buildVolumeFieldsSnapshot`).
- [ ] Tests — `flowFieldsHandle.test.ts` (drive with a state stub exposing `data.flow`, `gpu.flowFieldRenderer` spy, `subsystems.scheduler` spy):
  - `setEnabled(true) sets the store, re-evaluates demand, requests render`.
  - `setEnabled(false) clears the store flag`.
  - `setMode reseeds and requests render`.
  - `setCount reseeds and requests render`.
  - `setIntensity sets the store and requests render without reseeding` — assert `maybeReseed` NOT called.
- [ ] `npm test -- flowFieldsHandle` → pass. `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): EngineFlowFieldsHandle + engine wiring`.

## Task 2: SettingsPanel Flow row

**Files:** `src/components/SettingsPanel/FlowRow.tsx` (create), `src/components/SettingsPanel/FlowRow.module.css` (create), `src/components/SettingsPanel/SettingsPanel.tsx` (modify)

User-facing controls only (decision §11): an enable checkbox, an advect/streamline
mode switch, and an intensity slider. Reuse the `VolumeFieldRow` layout idiom (top
line = checkbox + label + a compact mode toggle; one `LabelledSlider`-style row for
intensity). Component conventions: own folder is not required for a sibling of
`VolumeFieldRow` (they live flat in `SettingsPanel/`), but keep one component per
file, `function FlowRow()` + `export default FlowRow`, a top-level `.root`/`.row`
class, and a `.module.css`.

```ts
export type FlowRowProps = {
  enabled: boolean;
  mode: FlowMode;
  intensity: number;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: FlowMode) => void;
  onIntensityChange: (intensity: number) => void;
};
function FlowRow(props: FlowRowProps): ReactNode;
export default FlowRow;
```

- [ ] Create `FlowRow.tsx` + `FlowRow.module.css`. Mode switch is a two-button segmented control (advect / streamline) disabled when `!enabled`; intensity slider `[0,1]` step `0.01` disabled when `!enabled`.
- [ ] Mount `FlowRow` in `SettingsPanel.tsx` (a "Flow" section near the Volumes/Filaments sections), wiring its callbacks to `engine.flow.setEnabled` / `.setMode` / `.setIntensity` and reading current values from the flow snapshot (or the store via the panel's state plumbing).
- [ ] (Verification) Ask the user to confirm via the running dev server: the Flow row appears, the toggle enables the mode switch + slider, and enabling shows ribbons once the cube loads. No automated React test required if the panel follows the existing manual-verify convention; add one if SettingsPanel already has component tests.
- [ ] `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): SettingsPanel Flow row (toggle + mode + intensity)`.

## Task 3: DebugPanel dev tuning subsection

**Files:** `src/components/DebugPanel/FlowTuningSection.tsx` (create), `src/components/DebugPanel/DebugPanel.tsx` (modify)

A new collapsible `<details>` section (default-closed, like
`RenderTogglesSection`) with five sliders: count, trail, flowSpeed, densityBias,
wander. These are dev tuning knobs (decision §11), so they live in the DebugPanel,
not the user SettingsPanel. Slider ranges come from the spike's tuned defaults
(see `tools/cosmic-flow/src/state/slices/flowSlice.ts` for the advect/streamline
values — e.g. count up to `MAX_PARTICLES`, flowSpeed ~0..0.5, trail ~0..0.02,
densityBias 0..1, wander 0..0.3).

```ts
export type FlowTuningSectionProps = {
  count: number;
  trail: number;
  flowSpeed: number;
  densityBias: number;
  wander: number;
  onCountChange: (v: number) => void;
  onTrailChange: (v: number) => void;
  onFlowSpeedChange: (v: number) => void;
  onDensityBiasChange: (v: number) => void;
  onWanderChange: (v: number) => void;
};
function FlowTuningSection(props: FlowTuningSectionProps): ReactNode;
export default FlowTuningSection;
```

- [ ] Create `FlowTuningSection.tsx` — five labelled sliders in a default-closed `<details>` titled "Flow tuning". Cap `count` at `MAX_PARTICLES` (import from `flowFieldConstants`); pick perceptually-useful ranges per the spike defaults.
- [ ] Mount it in `DebugPanel.tsx` (add the props to `DebugPanelProps`, render the section, thread callbacks to `engine.flow.setCount` / `.setTrail` / `.setFlowSpeed` / `.setDensityBias` / `.setWander`).
- [ ] (Verification) Dev-server check: the section appears under the panel, sliders move the live flow look. Add a React test only if DebugPanel already has component tests.
- [ ] `npm run typecheck` → clean. `npm test` → full suite green.
- [ ] Commit: `feat(flow): DebugPanel flow-tuning section`.

---

## Spec coverage (Phase D)

- Decision §8 (`EngineFlowFieldsHandle` setters wrap store mutators + `requestRender()`; no separate settings.flow slice) → Task 1.
- Decision §11 (SettingsPanel Flow row — toggle + mode + intensity) → Task 2.
- Decision §11 (DebugPanel dev subsection — count, trail, flowSpeed, densityBias, wander) → Task 3.
- Decision §11 (no labels added) → honoured (no label work in any task).
- Decision §2 (default mode advect, layer default-off) → enforced by the Phase-B store seed; the UI reflects it.
- Decision §3/§5 (reseed on mode-switch / count-change) → Task 1 (`maybeReseed` in `setMode`/`setCount`).
