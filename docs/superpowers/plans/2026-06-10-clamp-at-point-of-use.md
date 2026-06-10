# Clamp at point of use — implementation plan

> **REQUIRED SUB-SKILL:** execute via `superpowers:subagent-driven-development`
> (fresh implementer per task, spec + quality review). The MAIN thread runs
> `npm test` / `npm run typecheck` and commits; implementers **edit files only**.

**Spec:** `docs/superpowers/specs/2026-06-10-clamp-at-point-of-use-design.md` (read first).

## Goal

Relocate the nine write-time clamps in `settingsTable.ts` to pure, unit-tested
helpers at each consuming renderer's uniform-upload site, so the settings store
holds raw intent and the renderer enforces its own GPU limits. Behaviour-
preserving: the GPU still receives clamped values; only the *home* of the clamp
moves.

## Architecture

Three pure clamp helpers co-located with their consumers — `clampFlowParams`
(flow renderer), `clampExposure` (post-process), `clampFilamentIntensity`
(filament renderer) — called at the per-frame upload sites. Each clamp-group's
slice adds the consumer clamp AND removes the matching `settingsTable` clamp in
one green commit. A final task strips the now-dead `clamp?` machinery from the
table.

## Tech Stack

Pure TS helpers (no GPU mock needed to test); existing WebGPU renderers
(`flowFieldRenderer`, `postProcess`, `filamentRenderer`) call them at upload.
**No WESL edits.**

## This is a /simplify un-braiding

The braid: a write-time clamp folds **GPU-safety constraint** × **UI bounds** ×
**stored value** into one line (simplicity.md #5 value/place, #8 single home —
`flow.trail` is clamped in two places today). Un-braid: store holds intent, the
slider owns UI bounds, the renderer owns the GPU constraint at point of use.

## Conventions reminder for every implementer

- MAIN thread runs `npm test`/`typecheck` + commits; implementers **edit only**;
  bash **sequential**; **Read/Grep**, not sed/awk/grep.
- **Escalate, don't hack.** If a consumer turns out to read a knob at a site this
  plan didn't list (so the clamp would be bypassed), STOP and report.
- `type` not `interface`; one type per `@types` file; `readonly` where neighbours
  use it; deep relative imports, no barrels; didactic comments (WHY + rejected
  alternative; no history notes); **re-verify every cited `file:line`** (they drift).
- Stage specific paths (NEVER `git add -A`/`.`); branch `clamp-at-point-of-use`;
  squash-merge; format only touched files; tick `- [ ]` → `- [x]` inline.

---

## Task 1: `clampFlowParams` + wire the flow renderer; drop flow clamps from the table

The riskiest slice — `flow.count` (buffer overflow) and `flow.trail` (compute-loop
hang). `flow.trail` is **already** floored at `flowFieldRenderer.ts:315`; this task
makes the helper the single home.

**Files:**
- Create `src/services/gpu/renderers/clampFlowParams.ts`
- Test `tests/services/gpu/renderers/clampFlowParams.test.ts`
- Modify `src/services/gpu/renderers/flowFieldRenderer.ts` (call the helper at the
  flow-knob read sites: `:297, :315, :316, :320, :321, :324, :371, :372, :377`)
- Modify `src/services/engine/wiring/settingsTable.ts` (remove the `clamp` entries
  on the seven flow rows: `setFlowIntensity`, `setFlowCount`, `setFlowTrail`,
  `setFlowSpeed`, `setFlowDensityBias`, `setFlowWander`, `setFlowBoundaryFadeWidth`)

**Signature:**
```ts
import type { FlowSettings } from '../../../@types/settings/FlowSettings';
// Returns a copy with the numeric knobs clamped to their GPU-safe bounds;
// `enabled` / `mode` pass through unchanged.
export function clampFlowParams(flow: FlowSettings): FlowSettings;
```
Bounds (reuse `MAX_PARTICLES` / `MIN_TRAIL_STEP` from `flowFieldConstants.ts`):
`count → Math.max(0, Math.min(MAX_PARTICLES, Math.round(v)))`,
`trail → Math.max(MIN_TRAIL_STEP, v)`, `speed → Math.max(0, v)`,
`intensity → [0,1]`, `densityBias → [0,1]`, `wander → Math.max(0, v)`,
`boundaryFadeWidth → [0, 0.5]`.

- [x] Tests: `clampFlowParams caps count at MAX_PARTICLES and rounds`,
  `…floors trail at MIN_TRAIL_STEP` (assert a 0 input → `MIN_TRAIL_STEP`, the
  GPU-hang guard), `…floors speed/wander at 0`, `…bounds intensity/densityBias to
  [0,1]`, `…bounds boundaryFadeWidth to [0,0.5]`, `…passes enabled/mode through`.
- [x] Run-fails (MAIN: `npm test -- clampFlowParams`).
- [x] Implement the helper. Implement the wiring: at the top of the flow
  renderer's compute-encode and draw paths, derive `const f = clampFlowParams(flow)`
  and read every knob from `f` (replacing the inline `Math.round(flow.count)` at
  `:297/:377`, the `Math.max(MIN_TRAIL_STEP, flow.trail)` at `:315`, the
  `flow.flowSpeed`/`densityBias`/`wander`/`intensity`/`boundaryFadeWidth` reads).
  Remove the seven `clamp` entries from the flow rows in `settingsTable.ts`.
- [x] Also: flip `tests/services/engine/flowFieldsHandle.test.ts`'s "clamps (via
  the real table rows)" block to **raw-passthrough** (the handle now stores intent;
  clamping moved to `clampFlowParams`). And remove the now-dead
  `MAX_PARTICLES`/`MIN_TRAIL_STEP` import from `settingsTable.ts` — the flow rows
  were their only consumers, so Task 4 no longer needs to.
- [x] Run-passes. MAIN: full `npm test` (2502 green) + `npm run typecheck` clean.
- [x] Commit the slice.

## Task 2: `clampExposure` + wire post-process; drop the exposure clamp

**Files:**
- Create `src/services/gpu/passes/clampExposure.ts`
- Test `tests/services/gpu/passes/clampExposure.test.ts`
- Modify `src/services/gpu/passes/postProcess.ts:261` (clamp before writing
  `uniformF32[0]`)
- Modify `src/services/engine/wiring/settingsTable.ts` (remove the `clamp` on
  `setExposure`, row ~`:268-272`)

**Signature:** `export function clampExposure(exposure: number): number;` → `[0.05, 16]`.

- [x] Tests: `clampExposure clamps the upper bound to 16` (float-buffer guard),
  `clampExposure clamps the lower bound to 0.05` (black-frame guard).
- [x] Run-fails → implement helper + wire at `postProcess.ts:261` (use
  `clampExposure(exposure)`) + remove the table clamp → run-passes (full suite;
  the post-process / tonemap visual tests green) → commit.

## Task 3: `clampFilamentIntensity` + wire the filament renderer; drop its clamp

**Files:**
- Create `src/services/gpu/renderers/clampFilamentIntensity.ts`
- Test `tests/services/gpu/renderers/clampFilamentIntensity.test.ts`
- Modify `src/services/gpu/renderers/filamentRenderer.ts:299` (clamp before
  writing `f32[21]`)
- Modify `src/services/engine/wiring/settingsTable.ts` (remove the `clamp` on
  `setFilamentIntensity`, row ~`:183-186`)

**Signature:** `export function clampFilamentIntensity(intensity: number): number;` → `[0, 1]`.

- [ ] Tests: `clampFilamentIntensity bounds to [0,1]` (assert a negative input →
  0, the undefined-blend guard; `>1` → 1).
- [ ] Run-fails → implement + wire at `filamentRenderer.ts:299` + remove the table
  clamp → run-passes (full suite) → commit.

## Task 4: strip the dead `clamp` machinery from `settingsTable`

By now no row carries a `clamp`. Remove the now-unused machinery.

**Files:**
- Modify `src/services/engine/wiring/settingsTable.ts` — delete the `clamp?` field
  from `SettingsDescriptor` (`:134-139`), the `clamp(value)` application in
  `buildSettersFromTable` (`:341-345`), and the now-unused `MAX_PARTICLES` /
  `MIN_TRAIL_STEP` imports (`:77`). Tidy the module docblock (`:128-133` describes
  `clamp`) to current state — timeless and terse.
- Modify the `settingsTable` test(s) — find them (`tests/services/engine/wiring/`
  or similar) and flip any clamp assertions to **raw-passthrough**: e.g.
  `setExposure(1e9)` leaves `settings.tonemap.exposure === 1e9` (the setter no
  longer clamps; intent is stored raw).

- [ ] Update the table + its tests (raw-passthrough assertions).
- [ ] Run-fails/passes as the tests flip. MAIN: full `npm test` + `npm run typecheck`.
- [ ] Commit.

## Task 5: entanglement-radar pass + behaviour-preservation gate

**Files:** none by default (review).

- [ ] MAIN runs the `entanglement-radar` skill over `git diff main...clamp-at-point-of-use`.
- [ ] Confirm + record: every clamp has exactly **one** home (the consumer
  helper); no write-time clamp survives in `settingsTable`; `flow.trail` is no
  longer clamped twice; the store-side value is raw intent; the GPU boundary is
  still protected (the three helpers are the single guards).
- [ ] Confirm no WESL was touched.
- [ ] MAIN: final full `npm test` + `npm run typecheck` green.
- [ ] Commit the radar note.

---

## Definition of done

- Nine clamps live in `clampFlowParams` / `clampExposure` / `clampFilamentIntensity`,
  called at the renderer upload sites; `settingsTable` has no `clamp` field.
- The setters store raw intent; the renderers clamp at the GPU boundary.
- `flow.count` (buffer) and `flow.trail` (loop-hang) guards are preserved at the
  consumer; full suite + parity/visual tests green at every commit.
- Opened as a PR off `clamp-at-point-of-use`, squash-merged. Then the
  engine-owned settings store PR rebases onto main and proceeds.
