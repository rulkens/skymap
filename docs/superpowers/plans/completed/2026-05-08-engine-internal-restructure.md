# Engine Internal Restructure (Spec B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each phase below produces one independent PR. Run implementer subagents in background (`run_in_background:true`) per user preference.

**Goal:** Reduce `engine.ts` from 2377 lines to ~1500 by extracting the giant async bootstrap IIFE, the per-frame body, the per-source slot wiring, the duplicated tween-to-galaxy logic, and the table-shaped settings dispatch — without changing observable behaviour.

**Architecture:** Five new modules under `src/services/engine/`: `settingsTable.ts`, `tweenToGalaxy.ts`, `runFrame.ts`, `pointSourceRegistry.ts`, and `phases/{initGpu,wireSlots,wireInput,startLoop,bootstrap}.ts`. Bespoke setters and sidecar slots stay inline.

**Tech Stack:** TypeScript, Vite, Vitest, the existing `AssetSlot` machinery from Spec A's asset-loading work.

**Spec:** `docs/superpowers/specs/2026-05-08-engine-internal-restructure-design.md`

**Commit hygiene:** every commit uses `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer; never `--author=Claude...`. Every phase ships on its own feature branch; open a PR via `gh pr create`. Don't push to main directly.

---

## Phase 1 — Settings setter table

Branch: `chore/engine-settings-table` off `main`.

### Task 1.1: Create `settingsTable.ts` with the descriptor type and table

**Files:**
- Create: `src/services/engine/settingsTable.ts`
- Test: `tests/services/engine/settingsTable.test.ts`

**Steps:**

- [ ] **Step 1: Survey current setters in `engine.ts`** (read-only)

  Read `src/services/engine/engine.ts` lines 1782–2225 — every method matching `set[A-Z]\w+` in the public-handle object literal. For each, record:
  - The state field it mutates (often nested: `state.settings.x`, `state.bias.x`).
  - The callback it fires (`cb.onXChange?.(...)`).
  - Whether it does anything else (subsystem call, async work, mask math).

  Setters that do **only** `state.x = v; cb.onXChange?.(v); requestRender()` are table candidates. The list per the spec: `setPointSize`, `setBrightness`, `setAutoRotate`, `setGalaxyTexturesEnabled`, `setMilkyWayEnabled`, `setFilamentsEnabled`, `setFilamentIntensity`, `setHighlightFallback`, `setRealOnlyMode`, `setDepthFadeEnabled`, `setAbsMagLimit`, `setExposure`, `setToneMapCurve` (13 total).

  Bespoke setters that stay inline: `setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`, `setSpaceMouseSensitivity`.

- [ ] **Step 2: Write the failing test**

  ```ts
  // tests/services/engine/settingsTable.test.ts
  import { describe, expect, it, vi } from 'vitest';
  import { buildSettersFromTable, SETTINGS_TABLE } from '../../../src/services/engine/settingsTable';

  describe('buildSettersFromTable', () => {
    it('produces a setter for every entry that mutates state, fires callback, and requests render', () => {
      const state = {
        settings: { pointSizePx: 2.5, brightness: 0.5 },
        bias: { absMagLimit: -19 },
      };
      const cb = {
        onPointSizeChange: vi.fn(),
        onBrightnessChange: vi.fn(),
        onAbsMagLimitChange: vi.fn(),
      };
      const requestRender = vi.fn();

      const setters = buildSettersFromTable(state as any, cb as any, requestRender);

      setters.setPointSize(5);
      expect(state.settings.pointSizePx).toBe(5);
      expect(cb.onPointSizeChange).toHaveBeenCalledWith(5);
      expect(requestRender).toHaveBeenCalledTimes(1);

      setters.setAbsMagLimit(-20);
      expect(state.bias.absMagLimit).toBe(-20);
      expect(cb.onAbsMagLimitChange).toHaveBeenCalledWith(-20);
      expect(requestRender).toHaveBeenCalledTimes(2);
    });

    it('returns one method per table entry; no extras', () => {
      const setters = buildSettersFromTable({} as any, {} as any, () => {});
      expect(Object.keys(setters).sort()).toEqual(Object.keys(SETTINGS_TABLE).sort());
    });

    it('omits the callback call when the callback is undefined (optional callbacks)', () => {
      const state = { settings: { pointSizePx: 1 } };
      const requestRender = vi.fn();
      const setters = buildSettersFromTable(state as any, {} as any, requestRender);
      expect(() => setters.setPointSize(7)).not.toThrow();
      expect(state.settings.pointSizePx).toBe(7);
      expect(requestRender).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  Run: `npx vitest run tests/services/engine/settingsTable.test.ts`
  Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `settingsTable.ts`**

  ```ts
  // src/services/engine/settingsTable.ts
  /**
   * Settings setter table — collapses the 13 boring "mutate one field +
   * fire one callback + requestRender" setters in the public handle
   * into a declarative descriptor table.
   *
   * ### Why a table
   *
   * The 13 setters listed in SETTINGS_TABLE all share the same body
   * shape: `state[path] = v; cb[name]?.(v); requestRender();`.  Inlining
   * them as 13 near-identical method literals in `engine.ts` is the
   * canonical "more lines than necessary" smell — every new setting
   * required four lines of copy-paste plus a re-read pass to verify
   * nothing slipped (wrong callback name, missing requestRender, etc.).
   *
   * ### Why bespoke setters stay inline
   *
   * Setters with non-trivial side effects (`setBiasMode` triggers a
   * worker bake and chains a render after the promise resolves;
   * `setTier` reloads slots; `setLodMode` couples to camera state;
   * `setSourceVisible` does mask math; `setSpaceMouseSensitivity`
   * forwards to a subsystem) don't fit the dispatch shape.  Forcing
   * them through a richer descriptor would expand the type to a union
   * of "kinds" and hide the actual logic behind an indirection — a
   * pure refactoring loss.  They keep their custom code in the public
   * handle object literal alongside the spread of table-built methods.
   *
   * ### Nested state paths
   *
   * Some settings live under `state.bias.*` rather than `state.settings.*`
   * (e.g. `absMagLimit`).  The descriptor's `path` is a string tuple so
   * the builder can navigate nested objects via a small `setByPath`
   * helper.  Two-segment paths cover every current case; deeper nesting
   * isn't needed.
   */
  import type { EngineState, EngineCallbacks, EngineHandle } from '../../@types';

  type SettingPath = readonly [string, string];

  type SettingDescriptor = {
    /** Path into `state` to write the new value. */
    path: SettingPath;
    /** Name of the optional callback in `EngineCallbacks` to fire after writing. */
    callbackKey: keyof EngineCallbacks;
  };

  /**
   * The 13 boring "field write + callback + render-request" setters.
   *
   * Order matches today's order in engine.ts for diff-friendliness; it
   * has no semantic significance.
   */
  export const SETTINGS_TABLE = {
    setPointSize:             { path: ['settings', 'pointSizePx'],          callbackKey: 'onPointSizeChange' },
    setBrightness:            { path: ['settings', 'brightness'],           callbackKey: 'onBrightnessChange' },
    setAutoRotate:            { path: ['settings', 'autoRotate'],           callbackKey: 'onAutoRotateChange' },
    setGalaxyTexturesEnabled: { path: ['settings', 'galaxyTexturesEnabled'],callbackKey: 'onGalaxyTexturesChange' },
    setMilkyWayEnabled:       { path: ['settings', 'milkyWayEnabled'],      callbackKey: 'onMilkyWayEnabledChange' },
    setFilamentsEnabled:      { path: ['settings', 'filamentsEnabled'],     callbackKey: 'onFilamentsEnabledChange' },
    setFilamentIntensity:     { path: ['settings', 'filamentIntensity'],    callbackKey: 'onFilamentIntensityChange' },
    setHighlightFallback:     { path: ['settings', 'highlightFallback'],    callbackKey: 'onHighlightFallbackChange' },
    setRealOnlyMode:          { path: ['settings', 'realOnlyMode'],         callbackKey: 'onRealOnlyModeChange' },
    setDepthFadeEnabled:      { path: ['settings', 'depthFadeEnabled'],     callbackKey: 'onDepthFadeEnabledChange' },
    setAbsMagLimit:           { path: ['bias',     'absMagLimit'],          callbackKey: 'onAbsMagLimitChange' },
    setExposure:              { path: ['settings', 'exposure'],             callbackKey: 'onExposureChange' },
    setToneMapCurve:          { path: ['settings', 'toneMapCurve'],         callbackKey: 'onToneMapCurveChange' },
  } as const satisfies Record<string, SettingDescriptor>;

  type TableKey = keyof typeof SETTINGS_TABLE;

  /**
   * Public-handle methods produced by `buildSettersFromTable`.  The exact
   * value-types are inferred from EngineSettings/EngineBias at call time
   * by the implementer; we expose `(value: any) => void` here because
   * the table is a single map and TypeScript would otherwise need 13
   * conditional types to keep them narrow.  Production callers go
   * through `EngineHandle`'s declared signatures, so the loss of
   * narrowness inside the builder is invisible at the API edge.
   */
  type BuiltSetters = Record<TableKey, (value: unknown) => void>;

  function setByPath(state: Record<string, unknown>, path: SettingPath, value: unknown): void {
    const [a, b] = path;
    const sub = state[a] as Record<string, unknown>;
    sub[b] = value;
  }

  /**
   * Build the table-shaped setters as a Pick of the public EngineHandle.
   * Spread into the handle's object literal:
   *
   *   const handle: EngineHandle = {
   *     clearSelection() { ... },
   *     destroy() { ... },
   *     ...buildSettersFromTable(state, cb, requestRender),
   *     setBiasMode(mode) { /* bespoke *\/ },
   *     // ...
   *   };
   */
  export function buildSettersFromTable(
    state: EngineState,
    cb: EngineCallbacks,
    requestRender: () => void,
  ): BuiltSetters {
    const out = {} as BuiltSetters;
    for (const key of Object.keys(SETTINGS_TABLE) as TableKey[]) {
      const desc = SETTINGS_TABLE[key];
      out[key] = (value: unknown) => {
        setByPath(state as unknown as Record<string, unknown>, desc.path, value);
        const cbFn = cb[desc.callbackKey] as ((v: unknown) => void) | undefined;
        cbFn?.(value);
        requestRender();
      };
    }
    return out;
  }
  ```

- [ ] **Step 5: Run test to verify it passes**

  Run: `npx vitest run tests/services/engine/settingsTable.test.ts`
  Expected: PASS (3/3).

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/engine/settingsTable.ts tests/services/engine/settingsTable.test.ts
  git commit -m "$(cat <<'EOF'
  feat(engine): settingsTable + buildSettersFromTable

  Declarative descriptor table for the 13 boring "write field + fire
  callback + requestRender" setters in the public handle.  Bespoke
  setters with side-effects stay inline.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 1.2: Replace the inline setters in `engine.ts`

**Files:**
- Modify: `src/services/engine/engine.ts:1788–~1948` (table setters) — delete the 13 inline methods
- Modify: `src/services/engine/engine.ts:~1726` (handle object literal) — spread `buildSettersFromTable(...)`

**Steps:**

- [ ] **Step 1: Add the import**

  At the top of `engine.ts`, alongside the other engine-internal imports:
  ```ts
  import { buildSettersFromTable } from './settingsTable';
  ```

- [ ] **Step 2: Spread the built setters into the handle**

  Find the public-handle object literal (`const handle: EngineHandle = {`).  Add the spread early (after `clearSelection` and `destroy` but before the bespoke setters):

  ```ts
  const handle: EngineHandle = {
    clearSelection() { ... },
    destroy() { ... },
    ...buildSettersFromTable(state, cb, () => state.subsystems.scheduler.requestRender()),
    setBiasMode(mode) { /* keep — bespoke */ },
    setTier(tier) { /* keep — bespoke */ },
    setLodMode(mode) { /* keep — bespoke */ },
    setSourceVisible(source, visible) { /* keep — bespoke */ },
    setSpaceMouseSensitivity(value) { /* keep — bespoke */ },
    // …selection methods, focusOn, loadPgcAliases stay
  };
  ```

- [ ] **Step 3: Delete the 13 inline setters**

  Identify the 13 listed in Task 1.1 step 1 and remove their entire method bodies from the handle literal.  The bespoke 5 stay.

- [ ] **Step 4: Typecheck**

  Run: `npx tsc --noEmit`
  Expected: clean.  If `EngineHandle`'s declared method signatures don't match the `(value: unknown) => void` inside the builder, narrow the table return type via a `satisfies` clause or per-method assertion.  Discover-and-fix is the right move — don't pre-engineer.

- [ ] **Step 5: Run full test suite**

  Run: `npx vitest run`
  Expected: 895+ pass.  No behavioural change so every existing test should stay green.

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/engine/engine.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): consume settingsTable in public handle

  Replace 13 inline setters with `...buildSettersFromTable(...)` spread.
  Bespoke setters (setBiasMode, setTier, setLodMode, setSourceVisible,
  setSpaceMouseSensitivity) stay inline.

  engine.ts -~110 lines.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 7: Open PR**

  ```bash
  git push -u origin chore/engine-settings-table
  gh pr create --title "refactor(engine): collapse 13 dispatch-shaped setters into a table" --body "$(cat <<'EOF'
  ## Summary
  - New `settingsTable.ts` declares the 13 "field write + callback + render-request" setters as a typed descriptor table.
  - `engine.ts` public handle spreads `buildSettersFromTable(...)`; bespoke setters stay inline.
  - engine.ts -~110 lines; net diff small.

  ## Test plan
  - [x] `settingsTable.test.ts` passes (3/3 unit tests for the builder)
  - [x] `npm run typecheck` clean
  - [x] full suite (895+ tests) green
  - [ ] manual smoke: every Settings panel slider/toggle still updates the renderer (visual)

  Spec: `docs/superpowers/specs/2026-05-08-engine-internal-restructure-design.md`
  EOF
  )"
  ```

---

## Phase 2 — Tween-to-galaxy helper

Branch: `chore/tween-to-galaxy-helper` off `main`.

### Task 2.1: Create `tweenToGalaxy.ts` helper

**Files:**
- Create: `src/services/engine/tweenToGalaxy.ts`
- Test: `tests/services/engine/tweenToGalaxy.test.ts`

**Steps:**

- [ ] **Step 1: Survey the three duplicated implementations**

  Read `engine.ts`:
  - `selectFamous` body (~line 2077)
  - `selectByAlias` body (~line 2163)
  - The dblclick → `handle.focusOn(lastClickedInfo)` path
  - `handle.focusOn(info)` body itself

  Confirm each does: extract `cloud.x[localIdx]/.y[.]/.z[.]/.diameterKpc[.]`, call `state.subsystems.tweens.tweenTo(cam, target, diameterKpc, performance.now())`, and `requestRender()`.

- [ ] **Step 2: Write the failing test**

  ```ts
  // tests/services/engine/tweenToGalaxy.test.ts
  import { describe, expect, it, vi } from 'vitest';
  import { tweenToGalaxy } from '../../../src/services/engine/tweenToGalaxy';

  describe('tweenToGalaxy', () => {
    it('reads cloud x/y/z + diameterKpc, calls tweens.tweenTo, requests render', () => {
      const cam = { /* placeholder */ } as any;
      const tweenTo = vi.fn();
      const requestRender = vi.fn();

      const cloud = {
        x: new Float32Array([0, 0, 100]),
        y: new Float32Array([0, 0, 200]),
        z: new Float32Array([0, 0, 300]),
        diameterKpc: new Float32Array([0, 0, 25]),
      } as any;

      const state = {
        cam,
        subsystems: { tweens: { tweenTo }, scheduler: { requestRender } },
      } as any;

      tweenToGalaxy(state, { source: 1 as any, localIdx: 2, cloud });

      expect(tweenTo).toHaveBeenCalledOnce();
      const [calledCam, target, diameterKpc] = tweenTo.mock.calls[0]!;
      expect(calledCam).toBe(cam);
      expect(target).toEqual({ x: 100, y: 200, z: 300 });
      expect(diameterKpc).toBe(25);
      expect(requestRender).toHaveBeenCalledOnce();
    });

    it('is a no-op when state.cam is null (race window during destroy)', () => {
      const tweenTo = vi.fn();
      const requestRender = vi.fn();
      const state = {
        cam: null,
        subsystems: { tweens: { tweenTo }, scheduler: { requestRender } },
      } as any;
      const cloud = { x: new Float32Array(1), y: new Float32Array(1), z: new Float32Array(1), diameterKpc: new Float32Array(1) } as any;

      tweenToGalaxy(state, { source: 1 as any, localIdx: 0, cloud });

      expect(tweenTo).not.toHaveBeenCalled();
      expect(requestRender).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  Run: `npx vitest run tests/services/engine/tweenToGalaxy.test.ts`
  Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `tweenToGalaxy.ts`**

  ```ts
  // src/services/engine/tweenToGalaxy.ts
  /**
   * tweenToGalaxy — start a camera tween toward a galaxy at (source, localIdx).
   *
   * ### Why a helper
   *
   * Three call sites in `engine.ts` (selectFamous, selectByAlias, dblclick →
   * focusOn) each open-coded "extract cloud.{x,y,z,diameterKpc}[localIdx],
   * call tweens.tweenTo, requestRender()" — three near-identical bodies.
   * One helper, three call sites collapse to a single line each.
   *
   * ### Cam-null guard
   *
   * `state.cam` is `null` during the post-`destroy()` window (engine
   * teardown sets it to null after detaching controls).  A late-arriving
   * promise from a click → focus path could fire after destroy; the
   * guard makes the helper safe to call unconditionally.  Without it,
   * the destroy path would race against in-flight `focusOn` and the
   * resulting null deref would be a noisy console error in HMR /
   * StrictMode test runs.
   */
  import type { EngineState } from '../../@types';
  import type { PointCloud } from '../../@types';
  import type { Source } from '../../data/sources';

  export type TweenTarget = {
    source: Source;
    localIdx: number;
    cloud: PointCloud;
  };

  export function tweenToGalaxy(state: EngineState, target: TweenTarget): void {
    if (state.cam === null) return;
    const i = target.localIdx;
    const x = target.cloud.x[i]!;
    const y = target.cloud.y[i]!;
    const z = target.cloud.z[i]!;
    const diameterKpc = target.cloud.diameterKpc[i]!;
    state.subsystems.tweens.tweenTo(state.cam, { x, y, z }, diameterKpc, performance.now());
    state.subsystems.scheduler.requestRender();
  }
  ```

- [ ] **Step 5: Run test to verify it passes**

  Run: `npx vitest run tests/services/engine/tweenToGalaxy.test.ts`
  Expected: PASS (2/2).

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/engine/tweenToGalaxy.ts tests/services/engine/tweenToGalaxy.test.ts
  git commit -m "$(cat <<'EOF'
  feat(engine): tweenToGalaxy helper

  Extracted the cloud-row → tween dispatch shared by selectFamous,
  selectByAlias, and dblclick → focusOn into one helper.  Cam-null
  guard added defensively for the destroy race.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 2.2: Replace the three inline implementations

**Files:**
- Modify: `src/services/engine/engine.ts` — `selectFamous` (~2077), `selectByAlias` (~2163), `handle.focusOn` (find via grep).

**Steps:**

- [ ] **Step 1: Add import + replace `selectFamous` body**

  Use `tweenToGalaxy(state, { source: Source.Famous, localIdx, cloud })` after the existing `setSelected` call.

- [ ] **Step 2: Replace `selectByAlias` body** — same shape with `source` resolved from the alias.

- [ ] **Step 3: Replace `handle.focusOn(info)` body** to look up the cloud and delegate to `tweenToGalaxy`.

- [ ] **Step 4: Run full test suite**

  Run: `npx vitest run`
  Expected: 897+ pass (existing + 2 new).

- [ ] **Step 5: Commit**

  ```bash
  git add src/services/engine/engine.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): consume tweenToGalaxy in selectFamous/selectByAlias/focusOn

  Three duplicated cloud-row → tween dispatches collapse to one helper
  call each.  ~40 lines deleted from engine.ts.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 6: Open PR**

  ```bash
  git push -u origin chore/tween-to-galaxy-helper
  gh pr create --title "refactor(engine): tween-to-galaxy helper dedup" --body "$(cat <<'EOF'
  ## Summary
  - New `tweenToGalaxy.ts` collapses three near-identical "build target Vec3 + start tween + requestRender" implementations into one helper.
  - selectFamous, selectByAlias, focusOn each become a one-liner.

  ## Test plan
  - [x] `tweenToGalaxy.test.ts` (2/2)
  - [x] `npm run typecheck`
  - [x] full suite green
  - [ ] manual smoke: clicking a famous galaxy in the panel, Cmd+K → alias select, dblclick on canvas all still tween correctly

  Spec: `docs/superpowers/specs/2026-05-08-engine-internal-restructure-design.md`
  EOF
  )"
  ```

---

## Phase 3 — Frame body to `runFrame.ts`

Branch: `chore/extract-runFrame` off `main`.

### Task 3.1: Survey the frame body's closure captures

**Files (read-only):**
- Read: `src/services/engine/engine.ts:1405–1717` — the `frame = () => { ... }` body.

**Steps:**

- [ ] **Step 1: List every identifier the frame body references that isn't a member of `state`**

  Walk lines 1405–1717.  For each free reference (not declared inside the closure), record name + source.  Expected set per the spec:
  - `canvas` (engine() arg)
  - `cb` (engine() arg)
  - `fpsCounter` (createEngine local — created near line 269)
  - `lastReportedFps` (createEngine `let`)
  - `lastScaleSig` (createEngine `let`)
  - `cssToTexPx` (createEngine local function)
  - `pointInfoForSelection` (createEngine local function)
  - `updateScaleBar` (createEngine local function)
  - `setHovered` (createEngine local function)
  - Plus any others the survey turns up.

  Output the list as a comment block at the top of `runFrame.ts` before drafting types — the implementer should USE the survey, not skip it.

### Task 3.2: Create `runFrame.ts` and the `RunFrameDeps` type

**Files:**
- Create: `src/services/engine/runFrame.ts`
- Test: `tests/services/engine/runFrame.test.ts`

**Steps:**

- [ ] **Step 1: Define `RunFrameDeps`**

  Mutable closure values (`lastReportedFps`, `lastScaleSig`) wrap as `{ current: T }` refs so they round-trip.  Pure functions and read-only locals are passed by value.

  ```ts
  // runFrame.ts (skeleton)
  export type RunFrameDeps = {
    canvas: HTMLCanvasElement;
    cb: EngineCallbacks;
    fpsCounter: FpsCounter;
    lastReportedFps: { current: number | null };
    lastScaleSig: { current: string };
    cssToTexPx: (cssPx: number) => number;
    pointInfoForSelection: (sel: { source: Source; localIdx: number }) => PointInfo | null;
    updateScaleBar: () => void;
    setHovered: (sel: { source: Source; localIdx: number } | null) => void;
    // …discovered in Task 3.1
  };

  export function runFrame(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
    // body lifted verbatim from engine.ts:1405–1717, with closure references
    // rewritten as deps.* / deps.lastReportedFps.current
  }
  ```

- [ ] **Step 2: Write a focused integration test**

  ```ts
  // tests/services/engine/runFrame.test.ts
  // Verifies the FPS-counter wiring round-trips through deps.
  // Doesn't try to test the whole frame body — that's covered by the
  // existing renderFrame.test.ts integration suite.
  it('updates lastReportedFps and fires onFpsChange when the counter rolls over to a new integer', () => {
    const onFpsChange = vi.fn();
    const lastReportedFps = { current: null as number | null };
    const fpsCounter = { sample: vi.fn().mockReturnValue(60) };

    const state = makeStubEngineState();   // helper from existing tests
    const deps = { ...stubDeps, fpsCounter, lastReportedFps, cb: { onFpsChange } };

    runFrame(state, deps, 1000);

    expect(lastReportedFps.current).toBe(60);
    expect(onFpsChange).toHaveBeenCalledWith(60);

    // Same sample again → no callback fire.
    runFrame(state, deps, 1016);
    expect(onFpsChange).toHaveBeenCalledOnce();
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  `npx vitest run tests/services/engine/runFrame.test.ts` → FAIL (module missing).

- [ ] **Step 4: Lift the frame body**

  Move lines 1405–1717 of `engine.ts` into `runFrame.ts`'s function body.  Rewrite each closure reference per the deps map from Task 3.1.  Module-level imports follow the original references — read engine.ts's import list and copy what's used.

  **Don't rename anything inside the body.**  This is a relocation, not a rewrite.

  Add a didactic module-header docstring (≥30 lines) explaining what the frame body does and why it now lives in its own file (per project convention — see CLAUDE.md).

- [ ] **Step 5: Run test to verify it passes**

  `npx vitest run tests/services/engine/runFrame.test.ts` → PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/engine/runFrame.ts tests/services/engine/runFrame.test.ts
  git commit -m "$(cat <<'EOF'
  feat(engine): runFrame extracted to its own module

  Per-frame body lifted verbatim from engine.ts:1405–1717 into
  runFrame.ts.  Closure-captured locals threaded through RunFrameDeps;
  mutable `let`s (lastReportedFps, lastScaleSig) become {current}
  refs so they round-trip into engine.ts.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 3.3: Wire `runFrame` from `engine.ts`

**Files:**
- Modify: `src/services/engine/engine.ts:1405–1717` — replace the body with `runFrame(state, frameDeps, performance.now())`.

**Steps:**

- [ ] **Step 1: Build the deps object** in `createEngine`'s scope, just before assigning `frame`.

  Mutable refs:
  ```ts
  const lastReportedFpsRef = { current: null as number | null };
  const lastScaleSigRef = { current: '' };
  ```

  Replace earlier `let lastReportedFps: number | null = null;` and `let lastScaleSig = '';` with the refs.  Update any other site that read/wrote those locals to go through `.current`.

- [ ] **Step 2: Construct `frameDeps`** as a single object literal mirroring `RunFrameDeps`.

- [ ] **Step 3: Replace the body**

  ```ts
  frame = () => {
    runFrame(state, frameDeps, performance.now());
    scheduleFrameTail();    // existing keep-rendering predicate
  };
  ```

- [ ] **Step 4: Typecheck + full suite**

  `npx tsc --noEmit && npx vitest run` → clean + all green.

- [ ] **Step 5: Commit + push + open PR**

  ```bash
  git add src/services/engine/engine.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): consume runFrame in the per-frame loop

  Frame body collapses to a single runFrame(state, frameDeps, now) call
  plus the existing scheduleFrameTail predicate.  ~310 lines moved out
  of engine.ts.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  git push -u origin chore/extract-runFrame
  gh pr create --title "refactor(engine): extract per-frame body to runFrame.ts" --body "$(cat <<'EOF'
  ## Summary
  - Per-frame body relocated from engine.ts:1405–1717 to runFrame.ts.
  - Closure-captured locals threaded via RunFrameDeps; mutable `let`s become {current} refs.
  - engine.ts -~310 lines.

  ## Test plan
  - [x] `runFrame.test.ts` integration test for FPS wiring
  - [x] `npm run typecheck`
  - [x] full suite green
  - [ ] manual smoke: render loop visibly steady; FPS readout updates; scale bar refreshes; hover/select work

  Spec: `docs/superpowers/specs/2026-05-08-engine-internal-restructure-design.md`
  EOF
  )"
  ```

---

## Phase 4 — Point-source slot wiring registry

Branch: `chore/point-source-registry` off `main`.

### Task 4.1: Survey the per-source slot blocks

**Files (read-only):**
- Read: `src/services/engine/engine.ts:619–~920` — find each per-source slot construction (SDSS, 2MRS, GLADE, Famous, Synthetic).  Confirm they share the same skeleton (slot name, `pointCloudFetcher` or `syntheticPointFetcher`, commit fn, `subscribe`, register with aggregateRegistry).

  Differences to preserve in the registry config:
  - `Source` enum
  - Initial `tier` (per spec table)
  - Fetcher (`pointCloudFetcher` for the four real, `syntheticPointFetcher` for synthetic)

### Task 4.2: Create `pointSourceRegistry.ts` + `wirePointSourceSlot` helper

**Files:**
- Create: `src/services/engine/pointSourceRegistry.ts`
- Test: `tests/services/engine/pointSourceRegistry.test.ts`

**Steps:**

- [ ] **Step 1: Write failing test**

  ```ts
  describe('wirePointSourceSlot', () => {
    it('builds a slot with the source-specific fetcher and registers it in state.assetSlots.points + aggregateRegistry', () => {
      const state = makeStubEngineState();
      const fetcher = vi.fn();
      const cfg = { source: Source.SDSS, fetcher, initialTier: 'medium' as const };
      const aggregateRegistry = { add: vi.fn() };

      wirePointSourceSlot(state, cfg, { aggregateRegistry, /* commit hooks */ } as any);

      expect(state.assetSlots.points.get(Source.SDSS)).toBeDefined();
      expect(aggregateRegistry.add).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 2: Implement registry + helper**

  Match the existing per-source block's behaviour byte-for-byte.  The helper builds the slot, calls `slot.subscribe(...)` with the same commit function as today, registers with `aggregateRegistry`, stores in `state.assetSlots.points`.

- [ ] **Step 3: Run test → PASS.**

- [ ] **Step 4: Commit.**

### Task 4.3: Replace the per-source blocks in `engine.ts` with a registry loop

**Files:**
- Modify: `src/services/engine/engine.ts` — IIFE per-source blocks.

**Steps:**

- [ ] **Step 1: Replace 5 blocks with**

  ```ts
  for (const cfg of POINT_SOURCE_REGISTRY) {
    wirePointSourceSlot(state, cfg, registryDeps);
  }
  ```

- [ ] **Step 2: Sidecars (filaments, famousMeta, pgcAliases) stay inline.**  Don't try to absorb them.

- [ ] **Step 3: Verify the boot-time arrival promises still work.**  The existing `allArrivalsPromise` and the synthetic-fallback gate need to keep referencing the slots by `Source` — the registry doesn't change that.

- [ ] **Step 4: Typecheck + tests.**  Manual smoke: load fresh, watch each survey arrive in the dev panel.

- [ ] **Step 5: Commit + push + PR.**

---

## Phase 5 — Bootstrap IIFE to ordered phases

Branch: `chore/bootstrap-phases` off `main`.

### Task 5.1: Create the phases skeleton

**Files:**
- Create: `src/services/engine/phases/initGpu.ts`
- Create: `src/services/engine/phases/wireSlots.ts`
- Create: `src/services/engine/phases/wireInput.ts`
- Create: `src/services/engine/phases/startLoop.ts`
- Create: `src/services/engine/phases/bootstrap.ts`
- Test: `tests/services/engine/phases/bootstrap.test.ts`

**Steps:**

- [ ] **Step 1: Define the shared phase signature**

  ```ts
  // phases/bootstrap.ts
  export type Phase = (state: EngineState, deps: BootstrapDeps) => Promise<void>;
  export type BootstrapDeps = {
    canvas: HTMLCanvasElement;
    cb: EngineCallbacks;
    // (whatever else engine.ts's IIFE captures from createEngine's scope)
  };

  export async function runBootstrapPhases(state, deps): Promise<void> {
    await initGpu(state, deps);
    await wireSlots(state, deps);
    await wireInput(state, deps);
    await startLoop(state, deps);
  }
  ```

- [ ] **Step 2: Write a phase-ordering regression test**

  ```ts
  it('runs phases in declared order; first rejection short-circuits', async () => {
    const order: string[] = [];
    const fail = new Error('boom');
    // Mock each phase via vi.spyOn / module mocks; assert order[].
  });
  ```

- [ ] **Step 3: Lift each section of the IIFE into its phase file.**

  Boundaries (from Task 5.1 in the spec):
  - `initGpu.ts`: `initGpu(canvas)`, postProcess construction, renderer/pickRenderer/milkyWayRenderer/filamentRenderer instantiation.
  - `wireSlots.ts`: registry loop (from Phase 4) + sidecar slot construction + `allArrivalsPromise` + synthetic fallback.
  - `wireInput.ts`: `attachOrbitControls`, click handlers, `inputBindings`, settings panel state initial sync.
  - `startLoop.ts`: assigns `frame`, fires `state.subsystems.scheduler.requestRender()`.

  Each phase exports `(state, deps) => Promise<void>`.  Inter-phase data flow is via `state.*` writes (which is already how the IIFE works).

- [ ] **Step 4: Replace the IIFE in `engine.ts`**

  ```ts
  (async () => {
    try {
      cb.onStatusChange({ kind: 'initializing' });
      await runBootstrapPhases(state, { canvas, cb });
      cb.onStatusChange({ kind: 'ready' });
    } catch (err) {
      cb.onStatusChange({ kind: 'error', error: err as Error });
    }
  })();
  ```

- [ ] **Step 5: Typecheck + tests + visual smoke.**  Bootstrap is the largest relocation; smoke especially carefully — slot arrivals, orbit controls, click picks, frame loop, status callbacks all need to fire in the right order.

- [ ] **Step 6: Commit + push + PR.**

---

## Final completion

After all five PRs land:

- [ ] Verify engine.ts is ≤1500 lines (`wc -l src/services/engine/engine.ts`).
- [ ] Verify tests stay at 895+ (no skips or deletions during the refactor).
- [ ] Update memory `project_engine_rewrite.md` to mark Spec B as landed.
- [ ] If MSDF labels Phase 4 has been waiting, confirm the engine surface is now clean enough to resume it.

## Things to be careful about

- **Bespoke setters live in this list:** `setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`, `setSpaceMouseSensitivity`. They MUST stay inline. Forcing them through the table is a sign the descriptor type is being expanded beyond YAGNI.
- **Sidecar slots stay inline:** filaments, famousMeta, pgcAliases. Same principle — the registry is for the 5 point-source slots, not for everything.
- **No semantic changes.** Each PR should preserve observable behaviour. If a refactor is tempting to "fix while you're in there", split it out — that's a separate PR, possibly out of scope for Spec B.
- **Closure-captured `let`s in the frame body** (Phase 3): turn them into `{ current: T }` refs so they round-trip cleanly. Don't lift them to `state` unless you'd add them there even without the extraction.
- **Each phase ships independently.** Don't stack-rebase unless main churns; the five branches are small enough that conflicts are usually trivial to resolve when they do happen (Spec A's experience: only doc-string conflicts).
