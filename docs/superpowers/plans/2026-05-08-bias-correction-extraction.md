# Bias Correction Extraction (Spec E) — Implementation Plan

> **For agentic workers:** Each phase below produces one independent PR. Phases stack: E.2 branches off E.1; E.3 branches off E.2. Phases E.1–E.3 are intended for this run; E.4 and E.5 are documented but DEFERRED pending visual smoke test (see "Stop point" below).

**Goal:** Extract the ~400-line Malmquist-bias-correction half of `PointRenderer` into a sibling subsystem (`biasCorrectionSubsystem.ts` under `services/engine/subsystems/`), leaving `PointRenderer` as a clean instanced-billboard drawer. Survey constants (`schechter`, `mLim`, `nRef`) move to a sibling table under `services/biasCorrection/`. The seam between subsystem and renderer is a uni-directional, layout-aware splice API: `spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays`.

**Architecture:** The subsystem owns mode flags, cached ratios/weights per source, the async bake state machine, the worker runner registry, and a generation counter for race fixes. The renderer's new splice methods are pure synchronous byte-layout-aware writes — no async, no worker, no mode tracking. State (`state.bias.{mode, …}`) stays unchanged on `EngineState`; the new subsystem field is `state.subsystems.biasCorrection`.

**Tech Stack:** TypeScript, Vitest, existing Vite `?worker` chunks for `computeSchechterRatios.worker.ts` / `computeAngularWeights.worker.ts`. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-08-bias-correction-extraction-design.md` — read it for the design rationale, the diagnosis of the current shape, the race behaviour that must be preserved, and the type signatures referenced throughout this plan.

**Predecessors landed:** Spec A (engine↔renderer boundaries), Spec B (engine internal restructure), Spec C (services folder), Spec D (engine deeper abstractions). All five spec sequels' subsystems share the closure-returning factory shape — this plan follows the same pattern.

**Commit hygiene:** every commit uses `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer; never `--author=Claude...`. Every phase ships on its own feature branch; open a PR via `gh pr create`. Don't push to main directly.

**Conventions enforced (from `CLAUDE.md` and project memory):**
- `export type X = { ... }` — never `interface`.
- Didactic, learning-oriented comments — multi-paragraph module headers explaining *why*, *what alternative was considered*.
- Tests mirror the source tree under `tests/`.
- Vitest, not Jest. Test command: `npm test`.
- Type check: `npm run typecheck` (covers both src and tools tsconfigs).
- `npm run dev` is left running in another terminal for HMR; do not kill it.

---

## File Structure (locks decomposition)

**Created (across all phases):**
```
src/services/biasCorrection/                                (new folder, sibling to services/loading/)
  surveyConstants.ts                                        (E.2)

src/services/engine/subsystems/
  biasCorrectionSubsystem.ts                                (E.3)

src/@types/
  BiasCorrectionSubsystem.d.ts (or extend EngineSubsystemHandles.d.ts)  (E.3)

tests/services/biasCorrection/
  surveyConstants.test.ts                                   (E.2)

tests/services/engine/subsystems/
  biasCorrectionSubsystem.test.ts                           (E.3)
```

**Modified:**
```
src/services/gpu/renderers/pointRenderer.ts                 (E.1, E.2, E.3-light)
tests/services/gpu/renderers/pointRenderer.test.ts          (E.1)
src/@types/EngineSubsystemHandles.d.ts                      (E.3)
src/services/engine/engine.ts                               (E.3)
src/services/engine/phases/initGpu.ts                       (E.3)
```

**Deleted (DEFERRED — phase E.4 only, not in this run):**
```
PointRenderer.setBiasMode, bakeSchechterRatios, clearSchechterRatios,
spliceSchechterIntoMirror, bakeAngularWeights, clearAngularWeights,
spliceAngularIntoMirror, schechterModeActive, angularReweightModeActive,
static schechterRunner, static angularRunner, set*Runner statics, and the
LoadedSource fields cachedSchechterRatios, cachedAngularWeights, cloud.
```

---

## Phase E.1 — Add splice methods to PointRenderer

**Branch:** `refactor/bias-correction-e1` off `main`.

**Goal:** Add three new public methods (`spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays`) to `PointRenderer`. Pure additive change. The bodies are extracted from existing `spliceSchechterIntoMirror`, `spliceAngularIntoMirror`, and the relevant zero-out + writeBuffer parts of `clearSchechterRatios` / `clearAngularWeights`. No callers added; the new surface is dead code from the public POV until E.3 wires the subsystem.

**Why first:** lowest risk. The existing `setBiasMode` / `bake*` / `clear*` paths continue to work. The race-mode tests in `pointRenderer.test.ts` continue to pass unchanged. If anything is wrong with the splice surface, we find out before any caller depends on it.

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts`
- Test: `tests/services/gpu/renderers/pointRenderer.test.ts`

**Decision:** make the three new methods own the loop bodies; have the existing private helpers (`spliceSchechterIntoMirror`, `spliceAngularIntoMirror`) and the existing `clearSchechterRatios` / `clearAngularWeights` delegate **into** the new public methods. End-state in E.4: when the privates and `clear*` are deleted, the new public methods stand alone with no further refactor.

### Task E.1.1 — Add the three splice methods + tests

**Steps:**

- [ ] **Step 1: Read the existing private splice methods**

  Read `src/services/gpu/renderers/pointRenderer.ts` around:
  - lines 1308–1319 (`clearSchechterRatios`)
  - lines 1321–1335 (`spliceSchechterIntoMirror`)
  - lines 1419–1427 (`clearAngularWeights`)
  - lines 1429–1438 (`spliceAngularIntoMirror`)

  Confirm the slot offsets: slot 10 (`SCHECHTER_RATIO_BYTE_OFFSET = 40`) for Schechter ratios; slot 11 (`ANGULAR_WEIGHT_BYTE_OFFSET = 44`) for angular weights. Confirm the writeBuffer call shape: `this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved)`.

  Confirm the existing `upload()` method validates length implicitly via the bake worker's output. There is no explicit length-check pattern to mirror; we will throw on length mismatch with a clear message.

- [ ] **Step 2: Write the failing tests**

  Append to `tests/services/gpu/renderers/pointRenderer.test.ts` (after the existing `describe('PointRenderer.setBiasMode', …)` block):

  ```ts
  // ─── Splice surface (Spec E phase E.1) ───────────────────────────────────────
  //
  // Three new public methods carry the layout-aware splice contract that the
  // future biasCorrectionSubsystem (Spec E phase E.3) will call into.  In
  // E.1 they're dead code from the public surface's POV — no caller invokes
  // them yet — but the tests below assert their byte-write semantics so the
  // surface is verified before the subsystem depends on it.

  describe('PointRenderer.spliceSchechterRatios', () => {
    it('writes ratios[i] into slot 10 of row i of the interleaved mirror', async () => {
      const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
      const device = makeStubDevice() as GPUDevice;
      // Override writeBuffer so we can capture the upload.
      (device.queue as unknown as { writeBuffer: (b: GPUBuffer, o: number, d: ArrayBufferView) => void }).writeBuffer =
        (buffer, offset, data) => {
          writeCalls.push({ buffer, offset, data });
        };

      const renderer = new PointRenderer(device, 'rgba16float');
      const cloud = makeCloud(3);
      await renderer.upload(Source.SDSS, cloud);

      const ratios = new Float32Array([0.25, 0.5, 0.75]);
      renderer.spliceSchechterRatios(Source.SDSS, ratios);

      // The most-recent writeBuffer call carries the spliced mirror.
      const last = writeCalls[writeCalls.length - 1]!;
      const f32 = new Float32Array(
        (last.data as Float32Array).buffer,
        (last.data as Float32Array).byteOffset,
        (last.data as Float32Array).length,
      );
      // SLOTS_PER_POINT = 12; slot 10 = SCHECHTER_RATIO_BYTE_OFFSET / 4 = 10.
      expect(f32[0 * 12 + 10]).toBeCloseTo(0.25);
      expect(f32[1 * 12 + 10]).toBeCloseTo(0.5);
      expect(f32[2 * 12 + 10]).toBeCloseTo(0.75);
    });

    it('throws when ratios.length !== source count', async () => {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(5));
      expect(() => renderer.spliceSchechterRatios(Source.SDSS, new Float32Array(4))).toThrow(
        /length/i,
      );
    });

    it('is a no-op when the source is not loaded', () => {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      // Should not throw — subsystem may call this for a stale source mid-bake.
      expect(() =>
        renderer.spliceSchechterRatios(Source.Glade, new Float32Array(0)),
      ).not.toThrow();
    });
  });

  describe('PointRenderer.spliceAngularWeights', () => {
    it('writes weights[i] into slot 11 of row i', async () => {
      const writeCalls: { data: ArrayBufferView }[] = [];
      const device = makeStubDevice() as GPUDevice;
      (device.queue as unknown as { writeBuffer: (b: GPUBuffer, o: number, d: ArrayBufferView) => void }).writeBuffer =
        (_buffer, _offset, data) => {
          writeCalls.push({ data });
        };

      const renderer = new PointRenderer(device, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(2));

      const weights = new Float32Array([0.1, 0.9]);
      renderer.spliceAngularWeights(Source.SDSS, weights);

      const last = writeCalls[writeCalls.length - 1]!;
      const f32 = new Float32Array(
        (last.data as Float32Array).buffer,
        (last.data as Float32Array).byteOffset,
        (last.data as Float32Array).length,
      );
      // slot 11 = ANGULAR_WEIGHT_BYTE_OFFSET / 4 = 11.
      expect(f32[0 * 12 + 11]).toBeCloseTo(0.1);
      expect(f32[1 * 12 + 11]).toBeCloseTo(0.9);
    });

    it('throws when weights.length !== source count', async () => {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(5));
      expect(() => renderer.spliceAngularWeights(Source.SDSS, new Float32Array(6))).toThrow(
        /length/i,
      );
    });
  });

  describe('PointRenderer.clearBiasOverlays', () => {
    it('zeroes slots 10 and 11 for the named source', async () => {
      const writeCalls: { data: ArrayBufferView }[] = [];
      const device = makeStubDevice() as GPUDevice;
      (device.queue as unknown as { writeBuffer: (b: GPUBuffer, o: number, d: ArrayBufferView) => void }).writeBuffer =
        (_buffer, _offset, data) => {
          writeCalls.push({ data });
        };

      const renderer = new PointRenderer(device, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(2));

      // First populate slots 10/11 so we can assert clear actually clears.
      renderer.spliceSchechterRatios(Source.SDSS, new Float32Array([0.5, 0.6]));
      renderer.spliceAngularWeights(Source.SDSS, new Float32Array([0.7, 0.8]));

      writeCalls.length = 0; // reset capture
      renderer.clearBiasOverlays(Source.SDSS);

      const last = writeCalls[writeCalls.length - 1]!;
      const f32 = new Float32Array(
        (last.data as Float32Array).buffer,
        (last.data as Float32Array).byteOffset,
        (last.data as Float32Array).length,
      );
      expect(f32[0 * 12 + 10]).toBe(0);
      expect(f32[0 * 12 + 11]).toBe(0);
      expect(f32[1 * 12 + 10]).toBe(0);
      expect(f32[1 * 12 + 11]).toBe(0);
    });

    it('zeroes for every loaded source when called with no argument', async () => {
      const writeCount = { n: 0 };
      const device = makeStubDevice() as GPUDevice;
      (device.queue as unknown as { writeBuffer: (b: GPUBuffer, o: number, d: ArrayBufferView) => void }).writeBuffer =
        () => {
          writeCount.n += 1;
        };

      const renderer = new PointRenderer(device, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(1));
      await renderer.upload(Source.Glade, makeCloud(1));

      const before = writeCount.n;
      renderer.clearBiasOverlays();
      // One writeBuffer per loaded source.
      expect(writeCount.n - before).toBe(2);
    });

    it('is a no-op when no sources are loaded', () => {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      expect(() => renderer.clearBiasOverlays()).not.toThrow();
    });
  });
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  npx vitest run tests/services/gpu/renderers/pointRenderer.test.ts
  ```

  Expected: 6 new failures (`spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays` not found / not a function).

- [ ] **Step 4: Add the three public methods to `PointRenderer`**

  In `src/services/gpu/renderers/pointRenderer.ts`, add these methods just before the existing `// ─── Lazy Schechter-ratio bake ──` section (around line 1205, right after `setBiasMode`):

  ```ts
    // ─── Splice surface (Spec E phase E.1) ────────────────────────────────────
    //
    // Three layout-aware methods that write per-galaxy bias-correction values
    // straight into the interleaved CPU mirror and re-upload the GPU buffer.
    // The bias-correction subsystem (Spec E phase E.3) calls into these once
    // its async worker bakes resolve.  They contain *no* state — no mode
    // flags, no caches, no async, no worker spawn.  The subsystem owns all
    // of that; this surface just lays down what it's told.
    //
    // The methods are exposed as a no-op for unloaded sources because the
    // subsystem's per-source bakes can race against `unload()` — by the
    // time a bake resolves, the source may have been removed.  Throwing
    // here would force every caller to re-check `clouds.has(source)` after
    // an await, duplicating the safety net.  Returning silently is the
    // correct semantics: "splice into nothing → nothing happens".
    //
    // Length-mismatch IS a programmer error — not a race — and we throw with
    // a readable message so the test layer catches it before it ships.

    /**
     * Splice a tightly-packed Float32Array of per-row Schechter ratios
     * (length must equal the source's `count`) into slot 10 of every row of
     * the entry's interleaved mirror, then re-upload the whole vertex
     * buffer.  No mode tracking; the caller (subsystem) decides when to
     * call this.
     */
    spliceSchechterRatios(source: Source, ratios: Float32Array): void {
      const entry = this.clouds.get(source);
      if (!entry) return;
      if (ratios.length !== entry.count) {
        throw new Error(
          `spliceSchechterRatios: length mismatch — got ${ratios.length} ratios, expected ${entry.count}`,
        );
      }
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 10] = ratios[i]!;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }

    /**
     * Splice a tightly-packed Float32Array of per-row HEALPix angular
     * weights (length must equal the source's `count`) into slot 11 of
     * every row of the entry's interleaved mirror, then re-upload.
     */
    spliceAngularWeights(source: Source, weights: Float32Array): void {
      const entry = this.clouds.get(source);
      if (!entry) return;
      if (weights.length !== entry.count) {
        throw new Error(
          `spliceAngularWeights: length mismatch — got ${weights.length} weights, expected ${entry.count}`,
        );
      }
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 11] = weights[i]!;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }

    /**
     * Zero slots 10 (Schechter ratio) AND 11 (angular weight) for either
     * one named source or every loaded source.
     *
     * Why zero rather than 1.0?  The shader's `select(1.0, slot, mode==N)`
     * gate already substitutes 1.0 (the multiplicative identity) when the
     * mode doesn't match — so the slot's literal value is irrelevant in
     * inactive modes.  Zero is the cheapest "obviously-cleared" sentinel a
     * future debug overlay or diagnostic can recognise without ambiguity.
     * The previous `clear*` helpers wrote 1.0 for symmetry with the
     * shader's identity; the new method writes 0.0 because the subsystem
     * is the only caller and it explicitly transitions to None /
     * VolumeLimited after a clear (where the slot is dead anyway).
     */
    clearBiasOverlays(source?: Source): void {
      const targets: LoadedSource[] = source !== undefined
        ? (() => {
            const entry = this.clouds.get(source);
            return entry ? [entry] : [];
          })()
        : Array.from(this.clouds.values());
      for (const entry of targets) {
        for (let i = 0; i < entry.count; i++) {
          entry.interleaved[i * SLOTS_PER_POINT + 10] = 0;
          entry.interleaved[i * SLOTS_PER_POINT + 11] = 0;
        }
        this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
      }
    }
  ```

  Note that the existing `clearSchechterRatios` / `clearAngularWeights` writeBuffer calls write **1.0** into the slot. The new `clearBiasOverlays` writes **0.0** because, as noted in the docblock, the slot is read-gated by the shader's `select(1.0, …, mode==N)`. The two clear paths are independent in E.1 — the new method is dead code, the old method still writes 1.0. E.4 deletes `clearSchechterRatios` / `clearAngularWeights` entirely.

- [ ] **Step 5: Run tests, confirm green**

  ```bash
  npx vitest run tests/services/gpu/renderers/pointRenderer.test.ts
  ```

  Expected: all tests pass (existing + 6 new).

- [ ] **Step 6: Run full type check + test suite**

  ```bash
  npm run typecheck
  npm test
  ```

  Expected: typecheck clean. Tests: 973 + 6 = 979 passing.

- [ ] **Step 7: Commit + push + open PR**

  ```bash
  git add src/services/gpu/renderers/pointRenderer.ts \
          tests/services/gpu/renderers/pointRenderer.test.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): E.1 add splice methods to PointRenderer

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  git push -u origin refactor/bias-correction-e1
  gh pr create --title "refactor(engine): E.1 add splice methods to PointRenderer" --body "..."
  ```

  PR body:
  ```
  ## Summary
  - Add `spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays` as new public methods on `PointRenderer`.
  - Pure additive change — no caller invokes them yet; existing `setBiasMode` / `bake*` / `clear*` paths continue to work unchanged.
  - 6 new tests cover the byte-write semantics, length-mismatch errors, and unloaded-source no-ops.

  Spec PR #60 documents the full design; this is phase E.1 of five.

  ## Test plan
  - [ ] `npm run typecheck` clean
  - [ ] `npm test` — 979+ passing (973 baseline + 6 new)
  - [ ] No visual change (the new methods are dead code)
  ```

---

## Phase E.2 — Survey constants table

**Branch:** `refactor/bias-correction-e2` off `refactor/bias-correction-e1` (sequential — both touch `pointRenderer.ts`).

**Goal:** Move the three pure-functions-of-`Source` fields (`schechter`, `mLim`, `nRef`) off `LoadedSource` into a sibling table at `src/services/biasCorrection/surveyConstants.ts`. The renderer's `upload()` stops storing them on the entry; future readers (the subsystem in E.3) look them up via `surveyConstants(source)`.

**Why second:** sets up E.3's subsystem, which needs to look up survey constants when baking. The fields on `LoadedSource` are currently dead weight inside `pointRenderer.ts` (stored in `upload`, never read by any method that survives E.4 — verified via ripgrep below). Removing them is a small, mechanical cleanup that doesn't perturb runtime behaviour.

**Files:**
- Create: `src/services/biasCorrection/surveyConstants.ts`
- Test: `tests/services/biasCorrection/surveyConstants.test.ts`
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (drop 3 fields + their writes)

### Task E.2.1 — Verify `LoadedSource` field reads via ripgrep

**Steps:**

- [ ] **Step 1: ripgrep `\.schechter\b|\.mLim\b|\.nRef\b` across the codebase**

  Use the Grep tool. Expected:
  - **Read sites in `pointRenderer.ts`:** none. The fields are written in `upload(...)` (around line 1075–1090) and never read by any method on the class. (One docstring mention at line ~322 — that's a comment, not a read.)
  - **Read sites elsewhere in `src/`:** none.
  - **Read sites in `tests/`:** none.
  - **Other (non-`LoadedSource`) hits in `tools/` or `data/` source files:** ignored — those are the canonical definitions.

  If a read site appears that is in code surviving E.4 (i.e. not `bakeSchechterRatios` / `bakeAngularWeights` / `setBiasMode`), STOP and report.

  Per Risk R3 in the spec, this audit is the gate for E.2 dropping the fields without a fallback path.

### Task E.2.2 — Create `surveyConstants.ts` and its test

**Steps:**

- [ ] **Step 1: Write the failing test**

  Create `tests/services/biasCorrection/surveyConstants.test.ts`:

  ```ts
  /**
   * Survey constants table — table-vs-live-call round-trip.
   *
   * The table caches three pure-functions-of-Source values (Schechter
   * triple, flux limit, central-density normaliser) so the bias-correction
   * subsystem can look them up without re-running `expectedNumberDensity`
   * per call.  This test asserts that for every Source, the table's
   * `nRef` matches a live `expectedNumberDensity({...})` call to the
   * basis-of-truth — i.e. the table didn't silently de-sync from the
   * primitive helpers it caches.
   */

  import { describe, it, expect } from 'vitest';
  import { surveyConstants } from '../../../src/services/biasCorrection/surveyConstants';
  import {
    surveyFluxLimit,
    surveySchechter,
  } from '../../../src/data/surveyFluxLimits';
  import { expectedNumberDensity } from '../../../src/utils/math/schechterDensity';
  import { Source } from '../../../src/data/sources';

  describe('surveyConstants table', () => {
    for (const src of [Source.Synthetic, Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
      it(`Source.${Source[src]} — schechter, mLim, nRef match live primitives`, () => {
        const c = surveyConstants(src);
        expect(c.schechter).toEqual(surveySchechter(src));
        expect(c.mLim).toBe(surveyFluxLimit(src));
        const liveNRef = expectedNumberDensity({
          ...surveySchechter(src),
          mLim: surveyFluxLimit(src),
          dMpc: 10,
        });
        expect(c.nRef).toBeCloseTo(liveNRef, 12);
      });
    }

    it('returns the same object across calls (memoisation does not regress identity)', () => {
      // Eager-built table: identity should be stable across calls so
      // consumers can use it as a cheap cache key without copying.
      const a = surveyConstants(Source.SDSS);
      const b = surveyConstants(Source.SDSS);
      expect(a).toBe(b);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```bash
  npx vitest run tests/services/biasCorrection/surveyConstants.test.ts
  ```

  Expected: FAIL — `src/services/biasCorrection/surveyConstants.ts` doesn't exist.

- [ ] **Step 3: Implement `surveyConstants.ts`**

  Create `src/services/biasCorrection/surveyConstants.ts`:

  ```ts
  /**
   * Survey constants — pure-functions-of-Source, eagerly cached.
   *
   * Three values per `Source` are constant for the lifetime of the runtime:
   *
   *   - `schechter` — the LF triple `(M*, α, φ*)` for the band that defines
   *     the survey's flux limit (SDSS r-band, 2MRS K-band, GLADE B-band, …).
   *   - `mLim` — the survey's apparent-magnitude flux limit (e.g. SDSS = 17.77).
   *   - `nRef` — the central-density normaliser
   *     `expectedNumberDensity({...schechter, mLim, dMpc: 10})`, the
   *     reference-point density at d = 10 Mpc.
   *
   * Pre-Spec-E these were stored on `LoadedSource` inside `PointRenderer`,
   * recomputed at every `upload()`.  The recompute was ~free for the
   * Schechter triple (a Record-lookup) but non-trivial for `nRef` (a
   * 200-step trapezoidal integral inside `expectedNumberDensity`).  More
   * importantly, the values had no rendering reason to be on the renderer
   * — they're inputs to the bias-correction bake, not to any draw call.
   * Spec E moves them to a sibling table so the subsystem can look them
   * up without reaching into the renderer.
   *
   * ### Why eager (not lazy)
   *
   * Five sources × one `expectedNumberDensity` call each ≈ a few
   * milliseconds at module-init time.  The table is a top-level `const`
   * so consumers can rely on `surveyConstants(source)` returning the
   * SAME object identity across calls — useful both as a cheap cache key
   * (the subsystem can compare references when deciding whether bake
   * inputs changed) and as a clear lifecycle signal (no "first call is
   * slower than the rest" surprise).
   *
   * Lazy memoisation would have the same behaviour after the first call
   * but with extra branching on every subsequent call.  With only five
   * sources, eager is strictly simpler.
   *
   * ### Why a sibling folder under `services/biasCorrection/`
   *
   * `services/biasCorrection/` is created by Spec E as a sibling to
   * `services/loading/` and `services/gpu/`.  It holds GPU-independent
   * bias-correction logic (this table today; possibly more later if we
   * extract more from the workers).  See the spec's *File layout* for
   * the placement rationale.
   */

  import { Source, ALL_SOURCES } from '../../data/sources';
  import {
    type SchechterTriple,
    surveyFluxLimit,
    surveySchechter,
  } from '../../data/surveyFluxLimits';
  import { expectedNumberDensity } from '../../utils/math/schechterDensity';

  export type SurveyConstants = {
    /** Schechter LF triple `(M*, α, φ*)` for the band defining the flux limit. */
    schechter: SchechterTriple;
    /** Apparent-magnitude flux limit (e.g. SDSS = 17.77, 2MRS = 11.75). */
    mLim: number;
    /** Central-density normaliser n(d = 10 Mpc), pre-computed once. */
    nRef: number;
  };

  function buildOne(source: Source): SurveyConstants {
    const schechter = surveySchechter(source);
    const mLim = surveyFluxLimit(source);
    const nRef = expectedNumberDensity({
      ...schechter,
      mLim,
      dMpc: 10,
    });
    return { schechter, mLim, nRef };
  }

  // Eager-build the table at module init.  Object.freeze on each entry
  // makes the misuse "subsystem mutates a constants record" impossible
  // — the entries are shared across the subsystem, the renderer (post-
  // E.2 reads), and any future consumer.
  const TABLE: Record<Source, SurveyConstants> = ALL_SOURCES.reduce(
    (acc, src) => {
      acc[src] = Object.freeze(buildOne(src));
      return acc;
    },
    {} as Record<Source, SurveyConstants>,
  );

  /**
   * Look up the cached `SurveyConstants` for a source.  Identity-stable
   * across calls; safe to use as a Map key.
   */
  export function surveyConstants(source: Source): SurveyConstants {
    return TABLE[source];
  }
  ```

- [ ] **Step 4: Run the new test, confirm green**

  ```bash
  npx vitest run tests/services/biasCorrection/surveyConstants.test.ts
  ```

  Expected: 6 tests pass (5 sources × 1 round-trip + 1 identity test).

### Task E.2.3 — Drop the three fields from `LoadedSource`

**Steps:**

- [ ] **Step 1: Drop fields from the `LoadedSource` type**

  In `src/services/gpu/renderers/pointRenderer.ts`, remove these three fields from the `LoadedSource` type (around lines 654–677):

  ```ts
    schechter: SchechterTriple;
    mLim: number;
    nRef: number;
  ```

  Update the docblock at the top of `LoadedSource` to note (didactically) that survey constants moved out:

  ```ts
  /**
   * ### Survey constants moved to a sibling table (Spec E phase E.2)
   *
   * Pre-Spec-E this type carried `schechter`, `mLim`, and `nRef` —
   * pure-functions-of-Source that were stored here only because the bias-
   * correction bake was a method on `PointRenderer` (which had to read
   * them).  Spec E extracts the bias-correction subsystem; survey
   * constants now live in `src/services/biasCorrection/surveyConstants.ts`
   * and are looked up by the subsystem on demand.
   *
   * The renderer no longer needs them — every former reader (the
   * `bake*` helpers) is on the deletion path for phase E.4.
   */
  ```

- [ ] **Step 2: Drop the writes from `upload()`**

  In `upload()` (around lines 1075–1090), remove `schechter`, `mLim`, `nRef` from the destructure of `result` and from the `this.clouds.set(...)` literal:

  ```ts
      // Before (current):
      const { interleaved, schechter, mLim, nRef } = result;
      …
      this.clouds.set(source, {
        buffer,
        count: cloud.count,
        cloud,
        schechter,
        mLim,
        nRef,
        interleaved,
        cachedSchechterRatios,
        cachedAngularWeights: null,
        fade,
      });

      // After:
      const { interleaved } = result;
      …
      this.clouds.set(source, {
        buffer,
        count: cloud.count,
        cloud,
        interleaved,
        cachedSchechterRatios,
        cachedAngularWeights: null,
        fade,
      });
  ```

  The `BuildPointInterleavedBufferResult` still carries the three fields (consumers other than `pointRenderer` may use them — though none currently do); we just stop reading them here. This keeps E.2 a single-file change to `pointRenderer.ts`.

- [ ] **Step 3: Drop the `SchechterTriple` import if it is no longer used**

  Check the imports at the top of `pointRenderer.ts`. If `SchechterTriple` is only used by the now-deleted fields, remove its import. (As of the survey, the import lives on line 46 — verify after the edit whether anything else in the file references it, e.g. a method signature; if not, delete the import line.)

- [ ] **Step 4: Run typecheck + tests**

  ```bash
  npm run typecheck
  npm test
  ```

  Expected: typecheck clean (no consumer of the removed fields). 979 + 6 = 985 tests passing.

  If typecheck fails because something outside `pointRenderer.ts` was reading `LoadedSource.schechter` etc. that ripgrep missed, STOP and report — the spec's R3 mitigation requires every read site to be either deleted or replaced via `surveyConstants(source).{...}`.

- [ ] **Step 5: Commit + push + open PR**

  ```bash
  git add src/services/biasCorrection/surveyConstants.ts \
          tests/services/biasCorrection/surveyConstants.test.ts \
          src/services/gpu/renderers/pointRenderer.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): E.2 survey constants table

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  git push -u origin refactor/bias-correction-e2
  gh pr create --base refactor/bias-correction-e1 --title "refactor(engine): E.2 survey constants table" --body "..."
  ```

  PR base = `refactor/bias-correction-e1` (stacked PR).

  PR body:
  ```
  ## Summary
  - Move `schechter`, `mLim`, `nRef` off `LoadedSource` into a sibling table at `src/services/biasCorrection/surveyConstants.ts`.
  - Eager-built at module init; `surveyConstants(source)` returns identity-stable records.
  - `pointRenderer.ts` stops storing the three fields; no read sites elsewhere (verified via ripgrep per spec R3).

  Spec PR #60 documents the full design; this is phase E.2 of five. Stacked on #<E.1 PR>.

  ## Test plan
  - [ ] `npm run typecheck` clean
  - [ ] `npm test` — 985+ passing (979 prior + 6 new round-trip tests)
  - [ ] No visual change (renderer no longer stores the fields, but no code path reads them)
  ```

---

## Phase E.3 — Subsystem creation + idle wiring

**Branch:** `refactor/bias-correction-e3` off `refactor/bias-correction-e2` (sequential — touches `pointRenderer.ts` for the upload/unload hooks, and `engine.ts` / `initGpu.ts` for state-bag + attachRenderer wiring; would conflict with E.1/E.2 if started independently).

**Goal:** Create `biasCorrectionSubsystem.ts` per the spec's *Subsystem shape*, wire it into `state.subsystems.biasCorrection`, and have `phases/initGpu.ts` call `attachRenderer(pointRenderer)`. Hook `pointRenderer.upload(...)` to call `subsystem.onSourceUploaded(source, cloud)` on commit, and `unload(...)` to call `subsystem.onSourceUnloaded(source)`. **Production behaviour does not change** — `handle.setBiasMode` STILL goes through `pointRenderer.setBiasMode` (the old path); the subsystem is wired and idle from the public-handle's POV. The cut-over to call the new subsystem happens in E.4 (DEFERRED).

**Why third:** subsystem can be built and tested standalone without touching engine.ts's `setBiasMode` behaviour. If something's wrong with the state machine, we find out before any user-visible call path depends on it.

**Files:**
- Create: `src/services/engine/subsystems/biasCorrectionSubsystem.ts`
- Modify: `src/@types/EngineSubsystemHandles.d.ts`
- Modify: `src/services/engine/engine.ts` (add to state literal)
- Modify: `src/services/engine/phases/initGpu.ts` (call `attachRenderer`)
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (install upload/unload callbacks via `attachRenderer`)
- Test: `tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts`

### Task E.3.1 — Decide the renderer-to-subsystem callback shape

**Decision:** the renderer does **not** import or reach into the engine state. Instead, the subsystem's `attachRenderer(renderer)` *installs* two callbacks on the renderer (`onUploaded`, `onUnloaded`) via setter methods — `pointRenderer.setBiasUploadCallback(cb)` and `pointRenderer.setBiasUnloadCallback(cb)`. The renderer's existing `upload` / `unload` invoke the callback if non-null, otherwise no-op. This keeps the renderer's import surface unchanged (no engine state, no subsystem), preserves the uni-directional split from the spec, and makes the test layer trivially mockable.

This decision matches the existing pattern (e.g. `cloudFade.setSourceCode(...)` is called from `upload`; the `CloudFade` doesn't import engine state).

### Task E.3.2 — Add the upload/unload callback setters to PointRenderer

**Steps:**

- [ ] **Step 1: Add the two setter methods + private fields**

  In `src/services/gpu/renderers/pointRenderer.ts`, add inside the class (after the other setters, around line 800):

  ```ts
    /**
     * Optional callback fired at the tail of `upload(source, cloud)` once
     * the GPU buffer is committed.  The bias-correction subsystem (Spec E
     * phase E.3) installs this so it can fire a per-source bake when a
     * new source arrives mid-mode.  The renderer doesn't reach into
     * engine state to find the subsystem; the subsystem reaches in via
     * `attachRenderer(...)` and installs the callback.  Uni-directional
     * coupling — the renderer doesn't know what the callback does.
     *
     * Null when no subsystem is attached (e.g. tests, or the brief
     * pre-attach window during bootstrap).  No-op in that case.
     */
    private biasUploadCallback: ((source: Source, cloud: PointCloud) => void) | null = null;
    private biasUnloadCallback: ((source: Source) => void) | null = null;

    /**
     * Install the upload-tail callback used by the bias-correction
     * subsystem.  Pass `null` to detach.  Idempotent: calling twice
     * replaces the previous callback.
     */
    setBiasUploadCallback(cb: ((source: Source, cloud: PointCloud) => void) | null): void {
      this.biasUploadCallback = cb;
    }

    /** Install the unload-tail callback for the bias-correction subsystem. */
    setBiasUnloadCallback(cb: ((source: Source) => void) | null): void {
      this.biasUnloadCallback = cb;
    }
  ```

- [ ] **Step 2: Fire the callbacks at the tail of `upload` / `unload`**

  In `upload()`, append at the very end (after `this.clouds.set(source, {...})`):

  ```ts
      this.biasUploadCallback?.(source, cloud);
  ```

  Same for the empty-cloud unload path (the `if (cloud.count === 0)` branch) — fire the **unload** callback there:

  ```ts
      this.biasUnloadCallback?.(source);
      return;
  ```

  In `unload(source)`, after `this.clouds.delete(source)`:

  ```ts
      this.biasUnloadCallback?.(source);
  ```

  (The callback is fired AFTER the renderer's state mutation so callbacks observing `loadedSources()` see the post-commit state.)

- [ ] **Step 3: Run typecheck + existing tests**

  ```bash
  npm run typecheck
  npm test
  ```

  Expected: typecheck clean. 985 tests still passing (callbacks default to null, no behaviour change).

### Task E.3.3 — Create the subsystem + tests

**Steps:**

- [ ] **Step 1: Write the failing test file**

  Create `tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts`:

  ```ts
  /**
   * biasCorrectionSubsystem — unit tests for the closure-returning facade
   * that owns Malmquist-bias mode flags, cached ratios/weights per source,
   * the async bake state machine, and the worker-runner registry.
   *
   * Coverage focus (per the spec's *Race behaviour — preserve exactly*
   * section, R1 mitigation):
   *
   *   1. fast_toggle_race            — three setMode calls; stale bake's
   *                                    splice is dropped.
   *   2. mid_bake_upload_race        — onSourceUploaded mid-bake fires a
   *                                    per-source bake, not a re-bake-all.
   *   3. multi_source_completion_ordering — each source's splice fires
   *                                    in resolution order; one
   *                                    requestRender at the end.
   *   4. attach_before_setMode       — setMode before attachRenderer:
   *                                    bake runs, splice happens at
   *                                    attach time.
   *   5. attach_after_setMode_completes — bake resolves before attach;
   *                                    cached results splice on attach.
   *
   * Stub renderer captures every spliceSchechterRatios / spliceAngular-
   * Weights / clearBiasOverlays / setBiasUploadCallback /
   * setBiasUnloadCallback call.  Stub runners use Promise constructors
   * so tests drive arbitrary completion ordering.
   */

  import { describe, it, expect, vi } from 'vitest';
  import { createBiasCorrectionSubsystem } from '../../../../src/services/engine/subsystems/biasCorrectionSubsystem';
  import { BiasMode } from '../../../../src/data/biasMode';
  import { Source } from '../../../../src/data/sources';
  import type { EngineState, PointCloud } from '../../../../src/@types';
  import type { PointRenderer } from '../../../../src/services/gpu/renderers/pointRenderer';

  type SpliceCall = { kind: 'schechter' | 'angular' | 'clear'; source?: Source; data?: Float32Array };

  /**
   * Build a stub renderer that captures every method call the subsystem
   * makes against it.  Mirrors the subset of the PointRenderer surface
   * the subsystem actually uses (5 methods).
   */
  function makeStubRenderer(): {
    renderer: PointRenderer;
    calls: SpliceCall[];
    uploadCb: ((source: Source, cloud: PointCloud) => void) | null;
    unloadCb: ((source: Source) => void) | null;
  } {
    const calls: SpliceCall[] = [];
    let uploadCb: ((source: Source, cloud: PointCloud) => void) | null = null;
    let unloadCb: ((source: Source) => void) | null = null;
    const stub: Partial<PointRenderer> = {
      spliceSchechterRatios: (source, data) => {
        calls.push({ kind: 'schechter', source, data });
      },
      spliceAngularWeights: (source, data) => {
        calls.push({ kind: 'angular', source, data });
      },
      clearBiasOverlays: (source) => {
        calls.push({ kind: 'clear', source });
      },
      setBiasUploadCallback: (cb) => {
        uploadCb = cb;
      },
      setBiasUnloadCallback: (cb) => {
        unloadCb = cb;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      renderer: stub as PointRenderer,
      calls,
      get uploadCb() {
        return uploadCb;
      },
      get unloadCb() {
        return unloadCb;
      },
    } as any;
  }

  function makeCloud(count: number): PointCloud {
    return {
      count,
      objIDs: new BigUint64Array(count),
      positions: new Float32Array(count * 3),
      magU: new Float32Array(count),
      magG: new Float32Array(count),
      magR: new Float32Array(count),
      magI: new Float32Array(count),
      magZ: new Float32Array(count),
      axisRatio: new Float32Array(count),
      positionAngleDeg: new Float32Array(count),
      diameterKpc: new Float32Array(count),
    } as unknown as PointCloud;
  }

  function makeState(clouds: Map<Source, PointCloud>): EngineState {
    const requestRender = vi.fn();
    return {
      bias: {
        mode: BiasMode.None,
        absMagLimit: 0,
        apparentMagLimit: 0,
        schechterMStar: 0,
        schechterAlpha: 0,
      },
      sources: { clouds } as unknown as EngineState['sources'],
      subsystems: {
        scheduler: { requestRender },
      } as unknown as EngineState['subsystems'],
    } as unknown as EngineState;
  }

  describe('createBiasCorrectionSubsystem', () => {
    it('setMode(None) on a no-source state resolves cleanly with a clearBiasOverlays call', async () => {
      const stub = makeStubRenderer();
      const state = makeState(new Map());
      const sub = createBiasCorrectionSubsystem({ state });
      sub.attachRenderer(stub.renderer);

      await sub.setMode(BiasMode.None);
      expect(stub.calls.filter((c) => c.kind === 'clear').length).toBe(1);
    });

    it('setMode(Schechter) fires per-source bake for every loaded source and splices ratios', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([
        [Source.SDSS, makeCloud(3)],
        [Source.Glade, makeCloud(5)],
      ]);
      const state = makeState(clouds);
      const calls: { source: Source }[] = [];
      const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) => {
        calls.push({ source: input.source });
        return new Float32Array(input.cloud.count);
      });

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });
      sub.attachRenderer(stub.renderer);

      await sub.setMode(BiasMode.Schechter);
      expect(calls.length).toBe(2);
      const splices = stub.calls.filter((c) => c.kind === 'schechter');
      expect(splices.length).toBe(2);
    });

    it('fast_toggle_race — None → Schechter → None drops the stale Schechter splice', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
      const state = makeState(clouds);
      // Hold the Schechter bake open via an external resolver.
      let resolveBake: (v: Float32Array) => void = () => {};
      const schechterRunner = vi.fn(
        () =>
          new Promise<Float32Array>((res) => {
            resolveBake = res;
          }),
      );

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });
      sub.attachRenderer(stub.renderer);

      // 1. setMode(None) — synchronously clears.
      await sub.setMode(BiasMode.None);
      // 2. setMode(Schechter) — kicks off the bake (held).
      const schechterPromise = sub.setMode(BiasMode.Schechter);
      // 3. setMode(None) before the bake resolves — bumps generation.
      await sub.setMode(BiasMode.None);
      // 4. Resolve the held bake with a marker payload.
      resolveBake(new Float32Array([1, 2, 3]));
      await schechterPromise;

      // Assert: NO spliceSchechterRatios call — the stale bake's result was dropped.
      const spliceCalls = stub.calls.filter((c) => c.kind === 'schechter');
      expect(spliceCalls.length).toBe(0);
    });

    it('mid_bake_upload_race — onSourceUploaded mid-bake fires a per-source bake', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([
        [Source.SDSS, makeCloud(3)],
        [Source.Famous, makeCloud(2)],
      ]);
      const state = makeState(clouds);
      let bakeCalls = 0;
      const bakedSources: Source[] = [];
      const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) => {
        bakeCalls += 1;
        bakedSources.push(input.source);
        // Yield to allow the test to fire onSourceUploaded mid-bake.
        await Promise.resolve();
        return new Float32Array(input.cloud.count);
      });

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });
      sub.attachRenderer(stub.renderer);

      // Start the multi-source bake (don't await yet).
      const setModePromise = sub.setMode(BiasMode.Schechter);

      // Fire a fresh-source upload mid-bake.
      const newCloud = makeCloud(7);
      clouds.set(Source.Glade, newCloud);
      sub.onSourceUploaded(Source.Glade, newCloud);

      await setModePromise;
      // One additional round for the per-source GLADE bake.
      await new Promise((r) => setTimeout(r, 0));

      // Original bake covers SDSS + Famous; mid-bake upload adds GLADE.
      expect(bakedSources.includes(Source.Glade)).toBe(true);
      // No re-bake-all: SDSS and Famous each appear exactly once.
      expect(bakedSources.filter((s) => s === Source.SDSS).length).toBe(1);
      expect(bakedSources.filter((s) => s === Source.Famous).length).toBe(1);
    });

    it('multi_source_completion_ordering — splice fires in resolution order; one requestRender at end', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([
        [Source.SDSS, makeCloud(3)],
        [Source.TwoMRS, makeCloud(2)],
        [Source.Glade, makeCloud(5)],
      ]);
      const state = makeState(clouds);
      // Per-source resolvers so we control completion order.
      const resolvers = new Map<Source, (v: Float32Array) => void>();
      const schechterRunner = vi.fn(
        (input: { source: Source; cloud: PointCloud }) =>
          new Promise<Float32Array>((res) => {
            resolvers.set(input.source, (v) => res(v));
          }),
      );

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });
      sub.attachRenderer(stub.renderer);

      const setModePromise = sub.setMode(BiasMode.Schechter);

      // Resolve in REVERSE order: Glade → TwoMRS → SDSS.
      // Yield between resolves so the subsystem's then() callbacks
      // fire in the order we resolve.
      resolvers.get(Source.Glade)!(new Float32Array([10, 11, 12, 13, 14]));
      await new Promise((r) => setTimeout(r, 0));
      resolvers.get(Source.TwoMRS)!(new Float32Array([20, 21]));
      await new Promise((r) => setTimeout(r, 0));
      resolvers.get(Source.SDSS)!(new Float32Array([30, 31, 32]));
      await setModePromise;

      const splices = stub.calls.filter((c) => c.kind === 'schechter');
      expect(splices.map((s) => s.source)).toEqual([Source.Glade, Source.TwoMRS, Source.SDSS]);
      // Exactly one requestRender call after all three splices.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scheduler = (state.subsystems as any).scheduler;
      expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
    });

    it('attach_before_setMode — setMode without attachRenderer; splice fires at attach time', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
      const state = makeState(clouds);
      const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) =>
        new Float32Array(input.cloud.count),
      );

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });

      // setMode WITHOUT attachRenderer — bake should run; splice deferred.
      await sub.setMode(BiasMode.Schechter);
      expect(stub.calls.length).toBe(0);

      // attachRenderer fires the deferred splices.
      sub.attachRenderer(stub.renderer);
      const splices = stub.calls.filter((c) => c.kind === 'schechter');
      expect(splices.length).toBe(1);
      expect(splices[0]!.source).toBe(Source.SDSS);
    });

    it('onSourceUnloaded — drops cached ratios + weights for that source', async () => {
      const stub = makeStubRenderer();
      const clouds = new Map<Source, PointCloud>([[Source.SDSS, makeCloud(3)]]);
      const state = makeState(clouds);
      const schechterRunner = vi.fn(async (input: { source: Source; cloud: PointCloud }) =>
        new Float32Array(input.cloud.count),
      );

      const sub = createBiasCorrectionSubsystem({ state, schechterRunner });
      sub.attachRenderer(stub.renderer);
      await sub.setMode(BiasMode.Schechter);
      expect(sub.state().sourcesWithSchechter).toContain(Source.SDSS);

      sub.onSourceUnloaded(Source.SDSS);
      expect(sub.state().sourcesWithSchechter).not.toContain(Source.SDSS);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```bash
  npx vitest run tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts
  ```

  Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the subsystem**

  Create `src/services/engine/subsystems/biasCorrectionSubsystem.ts`:

  ```ts
  /**
   * biasCorrectionSubsystem — owns the engine's Malmquist-bias correction
   * mode flags, cached per-source ratios/weights, the async bake state
   * machine, and the worker-runner registry.
   *
   * Pre-Spec-E this state machine lived inside `PointRenderer` (~400 lines
   * of code that had no rendering reason to be on the renderer).  Spec E
   * extracts it into a sibling subsystem under `services/engine/subsystems/`,
   * leaving the renderer as a clean instanced-billboard drawer.  See the
   * spec for the full design rationale (uni-directional split, "renderer
   * doesn't observe subsystem"), the *Race behaviour — preserve exactly*
   * section for the three named races this subsystem must handle, and the
   * *Subsystem shape* section for the public API.
   *
   * ### Why a closure-returning factory rather than a class?
   *
   * Same rationale every other subsystem under this folder uses
   * (selectionSubsystem, thumbnailSubsystem, spaceMouseSubsystem):
   * the codebase's convention is "factories return typed handles, not
   * class instances", the internal mutable state (renderer ref, mode,
   * cache maps, generation counter) is genuinely inaccessible from
   * outside (no `this.mode` to reach in and poke), and the per-engine
   * cost is irrelevant — there's exactly one engine per page.
   *
   * ### Race handling via a generation counter
   *
   * Each `setMode` increments `generation`.  Each per-source bake captures
   * the generation at start; on resolve, drops the result if the captured
   * generation no longer equals `generation`.  This is the same shape
   * Spec A's `AssetSlot` uses for tier-swap race fixes — proven correct
   * in production, transplanted here.  The fast_toggle_race test in the
   * test file is the regression-suite anchor for this fix.
   *
   * ### Why the renderer ref is null at construction
   *
   * The subsystem is constructed eagerly in the engine state literal
   * (alongside `selection`, `tweens`, `scheduler`) — at that point the
   * GPU device hasn't been acquired yet, so `state.gpu.renderer` is
   * null.  `attachRenderer(renderer)` is called from `phases/initGpu.ts`
   * once the renderer exists.  In the brief pre-attach window:
   *
   *   - `setMode(...)` runs the bakes anyway and stores the resolved
   *     ratios/weights in `cachedSchechter` / `cachedAngular`.  When
   *     `attachRenderer` lands, the cached results splice immediately
   *     so the next render frame sees them.
   *   - `onSourceUploaded(...)` no-ops — the renderer's upload callback
   *     can't have fired yet (the renderer doesn't exist).
   *
   * The "no-op when no renderer" pre-attach behaviour matches Spec A's
   * eager-construction rule: any consumer capturing
   * `state.subsystems.biasCorrection` from t=0 onwards gets the live
   * subsystem.
   *
   * ### Why the worker runner is a factory parameter
   *
   * Test injection.  Pre-Spec-E the runner was a `private static` on
   * `PointRenderer` mutated via `setSchechterRatioRunner(...)` — a
   * mutable global is a smell, and made the renderer's surface area
   * carry an injection seam that wasn't part of its rendering concern.
   * Spec E moves the seam onto this subsystem's factory parameter:
   * tests pass an in-process stub at construction; production omits
   * the param and gets the default Vite `?worker` runner.
   *
   * ### Why `state.bias.mode` stays separate
   *
   * The subsystem mirrors `state.bias.mode` internally (`mode` field
   * here) but doesn't own it.  The UI-facing knob bag stays on
   * `EngineState` — same role as `state.settings`.  See the spec's
   * *State* section for why we keep the two parallel: every existing
   * reader (URL hash, InfoCard, SettingsPanel echo) continues to work
   * unchanged.
   */

  import type { EngineState, PointCloud } from '../../../@types';
  import { BiasMode } from '../../../data/biasMode';
  import { Source, ALL_SOURCES } from '../../../data/sources';
  import type { ComputeSchechterRatiosInput } from '../bake/computeSchechterRatios';
  import type { ComputeAngularWeightsInput } from '../bake/computeAngularWeights';
  import type { PointRenderer } from '../../gpu/renderers/pointRenderer';

  /** Async function from a Schechter bake input to per-galaxy ratios. */
  export type SchechterRunner = (input: ComputeSchechterRatiosInput) => Promise<Float32Array>;

  /** Async function from an angular bake input to per-galaxy weights. */
  export type AngularRunner = (input: ComputeAngularWeightsInput) => Promise<Float32Array>;

  export type BiasCorrectionDeps = {
    state: EngineState;
    /** Optional override; defaults to the Vite `?worker` runner. */
    schechterRunner?: SchechterRunner;
    /** Optional override; defaults to the Vite `?worker` runner. */
    angularRunner?: AngularRunner;
  };

  export type BiasCorrectionSubsystem = {
    /** Wire the renderer once it exists (during `phases/initGpu`). */
    attachRenderer(renderer: PointRenderer): void;
    /** Switch bias mode; fires bakes for every loaded source. */
    setMode(mode: BiasMode): Promise<void>;
    /** Called by the renderer when a source uploads or re-uploads. */
    onSourceUploaded(source: Source, cloud: PointCloud): void;
    /** Called by the renderer when a source unloads. */
    onSourceUnloaded(source: Source): void;
    /** Test-only: snapshot of internal state. */
    state(): {
      mode: BiasMode;
      sourcesWithSchechter: Source[];
      sourcesWithAngular: Source[];
    };
  };

  // The default runners require Vite's `?worker` import — they live on
  // the renderer module today (defaultSchechterWorkerRunner / default-
  // AngularWeightsWorkerRunner).  Phase E.4 moves them here.  In E.3
  // we keep the existing renderer-side defaults and require tests to
  // inject stubs (production code goes through `pointRenderer.setBiasMode`
  // until E.4 cuts over).  Throwing on accidental fall-through makes
  // the "you forgot to wire the runner" failure loud.
  function defaultRunnerNotWired(): never {
    throw new Error(
      'biasCorrectionSubsystem: no default runner wired — pass schechterRunner/angularRunner ' +
        'in tests, or wait for Spec E phase E.4 to cut over from pointRenderer.setBiasMode.',
    );
  }

  export function createBiasCorrectionSubsystem(deps: BiasCorrectionDeps): BiasCorrectionSubsystem {
    const { state } = deps;
    const schechterRunner: SchechterRunner = deps.schechterRunner ?? defaultRunnerNotWired;
    const angularRunner: AngularRunner = deps.angularRunner ?? defaultRunnerNotWired;

    let renderer: PointRenderer | null = null;
    let mode: BiasMode = state.bias.mode;
    const cachedSchechter = new Map<Source, Float32Array>();
    const cachedAngular = new Map<Source, Float32Array>();
    let generation = 0;

    /** Snapshot every loaded `(source, cloud)` from the engine state. */
    function loadedSourceCloudPairs(): { source: Source; cloud: PointCloud }[] {
      const out: { source: Source; cloud: PointCloud }[] = [];
      for (const source of ALL_SOURCES) {
        const cloud = state.sources.clouds.get(source);
        if (cloud && cloud.count > 0) {
          out.push({ source, cloud });
        }
      }
      return out;
    }

    /**
     * Run a per-source Schechter bake.  Captures the generation at
     * start; on resolve, drops the result if a newer generation has
     * started.  On race-pass, caches the ratios + (if renderer attached)
     * splices them.
     */
    async function bakeSchechterFor(
      source: Source,
      cloud: PointCloud,
      myGen: number,
    ): Promise<void> {
      const ratios = await schechterRunner({ cloud, source });
      if (myGen !== generation) return; // stale
      cachedSchechter.set(source, ratios);
      // If the renderer is attached, splice immediately.  If not,
      // attachRenderer will pick up the cached entry on attach.
      renderer?.spliceSchechterRatios(source, ratios);
    }

    async function bakeAngularFor(
      source: Source,
      cloud: PointCloud,
      myGen: number,
    ): Promise<void> {
      const weights = await angularRunner({ cloud, source });
      if (myGen !== generation) return;
      cachedAngular.set(source, weights);
      renderer?.spliceAngularWeights(source, weights);
    }

    async function setMode(next: BiasMode): Promise<void> {
      generation += 1;
      const myGen = generation;
      mode = next;

      if (next === BiasMode.None || next === BiasMode.VolumeLimited || next === BiasMode.VMax) {
        // Identity-only modes.  The shader's gate ignores the per-galaxy
        // slot, so the slot's value is irrelevant — but we clear for
        // diagnostic cleanliness (a future debug overlay can recognise
        // 0.0 as "not active").
        renderer?.clearBiasOverlays();
        return;
      }

      const pairs = loadedSourceCloudPairs();

      if (next === BiasMode.Schechter) {
        await Promise.all(pairs.map(({ source, cloud }) => bakeSchechterFor(source, cloud, myGen)));
        if (myGen === generation) {
          state.subsystems.scheduler.requestRender();
        }
        return;
      }

      if (next === BiasMode.AngularReweight) {
        await Promise.all(pairs.map(({ source, cloud }) => bakeAngularFor(source, cloud, myGen)));
        if (myGen === generation) {
          state.subsystems.scheduler.requestRender();
        }
        return;
      }
    }

    function onSourceUploaded(source: Source, cloud: PointCloud): void {
      // Drop any prior cache for this source (a re-upload invalidates).
      cachedSchechter.delete(source);
      cachedAngular.delete(source);

      // If a bias mode is active, fire a fresh per-source bake using
      // the current generation.  Same race-drop semantics as setMode.
      const myGen = generation;
      if (mode === BiasMode.Schechter) {
        void bakeSchechterFor(source, cloud, myGen);
      } else if (mode === BiasMode.AngularReweight) {
        void bakeAngularFor(source, cloud, myGen);
      }
    }

    function onSourceUnloaded(source: Source): void {
      cachedSchechter.delete(source);
      cachedAngular.delete(source);
    }

    function attachRenderer(r: PointRenderer): void {
      renderer = r;
      // Install the upload/unload callbacks so the renderer can notify
      // us mid-mode when a source arrives/leaves.
      r.setBiasUploadCallback((source, cloud) => onSourceUploaded(source, cloud));
      r.setBiasUnloadCallback((source) => onSourceUnloaded(source));
      // Apply any cached results that resolved before attach (the
      // attach_after_setMode_completes test).  Mode-coherent: only
      // splice the family that matches the current mode.
      if (mode === BiasMode.Schechter) {
        for (const [source, ratios] of cachedSchechter) {
          r.spliceSchechterRatios(source, ratios);
        }
      } else if (mode === BiasMode.AngularReweight) {
        for (const [source, weights] of cachedAngular) {
          r.spliceAngularWeights(source, weights);
        }
      }
    }

    return {
      attachRenderer,
      setMode,
      onSourceUploaded,
      onSourceUnloaded,
      state: () => ({
        mode,
        sourcesWithSchechter: Array.from(cachedSchechter.keys()),
        sourcesWithAngular: Array.from(cachedAngular.keys()),
      }),
    };
  }
  ```

- [ ] **Step 4: Run the test, confirm green**

  ```bash
  npx vitest run tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts
  ```

  Expected: 7 tests pass. If any race test fails, the generation-counter logic likely has an off-by-one — re-read the spec's *Race behaviour* section against the failing test.

### Task E.3.4 — Wire the subsystem into engine state

**Steps:**

- [ ] **Step 1: Update `EngineSubsystemHandles.d.ts`**

  In `src/@types/EngineSubsystemHandles.d.ts`, add the new field:

  ```ts
  import type { BiasCorrectionSubsystem } from '../services/engine/subsystems/biasCorrectionSubsystem';
  // …
  export type EngineSubsystemHandles = {
    // …existing fields…
    /**
     * Malmquist-bias correction subsystem (Spec E phase E.3).
     *
     * Owns the bias-mode flags, cached per-source ratios/weights, and
     * the async bake state machine — extracted from `PointRenderer` so
     * the renderer can shrink to a clean instanced-billboard drawer.
     * Constructed eagerly in the engine state literal alongside
     * `selection` / `tweens` / `scheduler` (no GPU dependency); the
     * renderer is wired in during `phases/initGpu.ts` via
     * `attachRenderer(...)`.
     *
     * Phase E.3 wires the subsystem and tests it standalone.  Phase E.4
     * (DEFERRED — pending visual smoke test) cuts over `handle.setBiasMode`
     * to call into this subsystem.  Until then the subsystem is wired
     * and idle from the public-handle's POV.
     */
    biasCorrection: BiasCorrectionSubsystem;
  };
  ```

- [ ] **Step 2: Construct the subsystem in the engine state literal**

  In `src/services/engine/engine.ts`, import the factory:

  ```ts
  import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
  ```

  In the `state.subsystems` literal (around line 312), add the new field next to `selection`:

  ```ts
        // ── Bias-correction subsystem ────────────────────────────────
        // Owns Malmquist-bias mode flags, cached per-source ratios/
        // weights, and the async bake state machine — extracted from
        // PointRenderer (Spec E phase E.3).  Constructed eagerly here
        // (no GPU dep); the renderer is wired during phases/initGpu via
        // `attachRenderer(...)`.  In E.3 the subsystem is idle from the
        // public-handle POV — `handle.setBiasMode` STILL goes through
        // `pointRenderer.setBiasMode` (the old path).  E.4 (DEFERRED)
        // cuts over.
        biasCorrection: createBiasCorrectionSubsystem({ state }),
  ```

  Note: at the point `createBiasCorrectionSubsystem({ state })` is called, the `state` reference is the very object literal being constructed — JS closes over the binding, so by the time `setMode` reads `state.sources.clouds`, the literal has been fully initialised. (Same pattern as `scheduler: createRenderScheduler({ onFrame: () => frameRef.current() })` a few lines above, which captures `frameRef` from the enclosing scope.)

  In production this is fine because no caller invokes `biasCorrection.setMode` until after `attachRenderer` runs in `initGpu`. The `defaultRunnerNotWired` throw will only fire if somebody invokes `setMode` against the live state before E.4 wires the production runners — which doesn't happen in E.3 because nothing calls into the new subsystem yet.

- [ ] **Step 3: Wire `attachRenderer` in `phases/initGpu.ts`**

  In `src/services/engine/phases/initGpu.ts`, after `state.gpu.renderer = renderer` (around line 181), add:

  ```ts
    // ── Wire the bias-correction subsystem to the freshly-built renderer ──
    //
    // Spec E phase E.3.  The subsystem was constructed eagerly in the
    // engine state literal (no GPU dep); now that the renderer exists,
    // we hand it to the subsystem so its splice methods can fire when
    // bakes resolve.  attachRenderer also installs the upload/unload
    // callbacks the renderer fires from `upload(...)` / `unload(...)`.
    state.subsystems.biasCorrection.attachRenderer(renderer);
  ```

- [ ] **Step 4: Run typecheck + the full test suite**

  ```bash
  npm run typecheck
  npm test
  ```

  Expected: typecheck clean. Tests: 985 + 7 = 992 passing.

  If any test fails, check first that the `state.subsystems.scheduler` reference resolves at the moment `setMode` is called (we use a closure over `state`, so it should — but if the closure captured the wrong binding, tests will surface it).

- [ ] **Step 5: Commit + push + open PR**

  ```bash
  git add src/services/engine/subsystems/biasCorrectionSubsystem.ts \
          tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts \
          src/@types/EngineSubsystemHandles.d.ts \
          src/services/engine/engine.ts \
          src/services/engine/phases/initGpu.ts \
          src/services/gpu/renderers/pointRenderer.ts
  git commit -m "$(cat <<'EOF'
  refactor(engine): E.3 biasCorrectionSubsystem + idle wiring

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  git push -u origin refactor/bias-correction-e3
  gh pr create --base refactor/bias-correction-e2 --title "refactor(engine): E.3 biasCorrectionSubsystem + idle wiring" --body "..."
  ```

  PR base = `refactor/bias-correction-e2` (stacked PR).

  PR body:
  ```
  ## Summary
  - Create `biasCorrectionSubsystem.ts` per spec — closure-returning factory owning mode flags, cached per-source ratios/weights, the async bake state machine, and a generation counter for race fixes.
  - Wire into `state.subsystems.biasCorrection` (eager); `phases/initGpu.ts` calls `attachRenderer(pointRenderer)` once the renderer exists.
  - Renderer gains `setBiasUploadCallback` / `setBiasUnloadCallback` setters; the subsystem installs them via `attachRenderer`.
  - **Production behaviour does not change** — `handle.setBiasMode` STILL goes through `pointRenderer.setBiasMode` (the old path). Cut-over is phase E.4 (DEFERRED).

  Spec PR #60 documents the full design; this is phase E.3 of five. Stacked on #<E.2 PR>.

  ## Test plan
  - [ ] `npm run typecheck` clean
  - [ ] `npm test` — 992+ passing (985 prior + 7 new subsystem tests covering 3 named races + attach edge cases)
  - [ ] No visual change (subsystem is wired and idle)
  ```

---

## Phase E.4 — Cut over engine.ts to the subsystem (DEFERRED)

> **DEFERRED — not part of this run.**
>
> E.4 deletes ~400 lines from a critical render path (PointRenderer's bias-mode methods + worker runner statics + the three `LoadedSource` cache fields + `state.gpu.renderer.setBiasMode` cut-over to `state.subsystems.biasCorrection.setMode`). The spec's R1 risk and the user's standing rule "don't autonomously merge engine-integration PRs without a visual check" both require a human visual smoke test of the bias-mode toggle in the SettingsPanel before this can land. The agent in this run does NOT touch E.4.

**Branch:** `refactor/bias-correction-e4` off `refactor/bias-correction-e3` when E.4 ships.

**Files:**
- Modify: `src/services/engine/engine.ts` (cut over `handle.setBiasMode`)
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (delete bias-mode code)
- Modify: `tests/services/gpu/renderers/pointRenderer.test.ts` (delete bias-mode tests)
- (Possibly) Move `defaultSchechterWorkerRunner` / `defaultAngularWeightsWorkerRunner` from `pointRenderer.ts` to `biasCorrectionSubsystem.ts` so the subsystem can use the production worker default when no `schechterRunner` / `angularRunner` is passed.

**Tasks (sketch):**

- [ ] **Task E.4.1 — Move the default worker runners onto the subsystem**

  Move `defaultSchechterWorkerRunner` (currently lines ~474–518 in `pointRenderer.ts`) and `defaultAngularWeightsWorkerRunner` (lines ~532–578) to module scope in `biasCorrectionSubsystem.ts` (or a sibling worker-runners module). Replace the `defaultRunnerNotWired` throw in the factory with the real defaults so `createBiasCorrectionSubsystem({state})` (no overrides) just works in production.

  The Vite `?worker` imports come along — they're at module scope already, so the move is mechanical.

- [ ] **Task E.4.2 — Cut over `handle.setBiasMode`**

  In `src/services/engine/engine.ts`, replace the body of `setBiasMode`:

  ```ts
  setBiasMode(mode) {
    state.bias.mode = mode;
    cb.onBiasModeChange?.(mode);
    void state.subsystems.biasCorrection.setMode(mode);
    state.subsystems.scheduler.requestRender();
  },
  ```

  The `void` discards the Promise — engine.ts doesn't await. The subsystem calls `requestRender` itself when each source's splice completes, so the visual update appears as bakes resolve.

- [ ] **Task E.4.3 — Delete bias-mode code from `PointRenderer`**

  Delete from `src/services/gpu/renderers/pointRenderer.ts`:
  - Methods: `setBiasMode`, `bakeSchechterRatios`, `clearSchechterRatios`, `spliceSchechterIntoMirror`, `bakeAngularWeights`, `clearAngularWeights`, `spliceAngularIntoMirror`.
  - Private fields: `schechterModeActive`, `angularReweightModeActive`.
  - Static fields: `schechterRunner`, `angularRunner`.
  - Static methods: `setSchechterRatioRunner`, `setAngularWeightRunner`.
  - `LoadedSource` fields: `cachedSchechterRatios`, `cachedAngularWeights`, `cloud` (back-ref).
  - `defaultSchechterWorkerRunner`, `defaultAngularWeightsWorkerRunner` (moved in Task E.4.1).
  - `BiasMode` import.
  - Per Risk R3: ripgrep `\.schechter\b|\.mLim\b|\.nRef\b|\.cloud\b` after deletion to confirm no surviving reads.

  Convert `static buildRunner` (and `setBuildBufferRunner`) from class statics to module-level — same call shape, no `PointRenderer.` prefix on the export. (See spec section *Worker injection* for the rationale on why `buildRunner` stays.)

- [ ] **Task E.4.4 — Delete bias-mode tests + update `setBuildBufferRunner` calls**

  In `tests/services/gpu/renderers/pointRenderer.test.ts`:
  - Delete the `describe('PointRenderer.setBiasMode', …)` block (covered now by `biasCorrectionSubsystem.test.ts`).
  - Replace `PointRenderer.setBuildBufferRunner(...)` → `setBuildBufferRunner(...)` (module-level).
  - Drop `setSchechterRatioRunner` / `setAngularWeightRunner` calls.

- [ ] **Task E.4.5 — Wire upload/unload hooks**

  Confirm `pointRenderer.upload(source, cloud)` calls `state.subsystems.biasCorrection.onSourceUploaded(source, cloud)` and `unload(source)` calls `onSourceUnloaded(source)`. (E.3 already wired these via the renderer's setter callbacks; E.4 just verifies they're hot.)

- [ ] **Task E.4.6 — Visual smoke test (HUMAN, not agent)**

  - Run the app locally.
  - Open SettingsPanel.
  - Toggle BiasMode: None → VolumeLimited → VMax → Schechter → AngularReweight → None.
  - Verify each mode transition produces the expected visual (Schechter dims dense regions; AngularReweight flattens GLADE jets).
  - Check the dev console for errors.

- [ ] **Task E.4.7 — Commit + PR**

  Single commit; same `Co-Authored-By` trailer; PR base = `refactor/bias-correction-e3`.

---

## Phase E.5 — File-organisation polish (DEFERRED, optional)

> **DEFERRED — not part of this run; optional even when re-considered.**
>
> Pure file-relocation; zero behaviour change. Skip if E.1–E.4 took longer than expected.

Consider moving `src/services/engine/bake/` to `src/services/biasCorrection/bake/` so all bias-correction code lives in one tree. Or leave `bake/` where it is (it's also home to `buildPointInterleavedBuffer`, which isn't bias-specific). Decide during the PR.

---

## Stop point (this run)

After E.3's PR is open, **STOP**. Do NOT touch E.4 or E.5. Do NOT merge any of the PRs (the user merges).

The agent reports back with:
- Plan PR (extension to #60) commit SHA.
- E.1 PR URL.
- E.2 PR URL.
- E.3 PR URL.
- For each phase: line delta on `pointRenderer.ts` and other touched files.
- Total test count after each phase (973 → ~979 → ~985 → ~992).
- Any decisions that deviated from the spec or the Part-1 prompt.
