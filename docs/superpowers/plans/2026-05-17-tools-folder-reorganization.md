# Tools Folder Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `tools/` from a flat 24-file dump into by-domain subfolders, and introduce `tools/utils/` to absorb duplicated helpers.

**Architecture:** Two parallel changes in one PR: (1) extract copy-pasted helpers from tool scripts into a new `tools/utils/` registry (mirroring how `src/utils/` serves browser code), with tests for the new utils; (2) `git mv` existing top-level tool files into eight by-domain subfolders (`catalog/`, `famous/`, `filaments/`, `volumes/`, `fonts/`, `site/`, `deploy/`, `fetch/`). The split rule between `src/utils/` and `tools/utils/` is by runtime environment, not domain: browser-safe code lives in src, Node-only pipeline plumbing lives in tools. Pre-existing parsers/ folder stays untouched except for moving `floatToHalf.ts` out to `tools/utils/math/`.

**Tech Stack:** TypeScript (Node, via tsx). Vitest for unit tests. No new dependencies.

---

## Working-rules for this plan

These constraints apply to EVERY task below. Re-read before starting each one.

- **`type` aliases, never `interface`.** Every new file uses `export type X = { ... }`.
- **Didactic comments.** Each new utils file opens with a 2–4-line module header explaining what + why + the alternative considered (longer when there's a non-obvious choice — e.g., `floatHalf.ts`).
- **No barrel exports** in `tools/utils/`. Consumers always import the deep path (e.g. `'../../utils/io/jsonCache'`), never an `index.ts`.
- **`git mv`, never delete + add**, for every file move. `git blame` must survive the reorg.
- **Per-task commits, single PR.** Each task ends with one commit. Do not squash.
- **NEVER stage files you didn't touch.** The worktree has ~199 pre-existing modifications unrelated to this work. Always `git add <specific-path>`; never `git add -A`, `git add .`, or `git add tools/`. If unsure, run `git status` first and add only files this task created/edited.
- **Commit author:** use the user's git identity. Add a `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer; do NOT use `--author=Claude...`.
- **TDD where applicable.** For every new utils file in Phase 1: write the test first, run it to see it fail, then implement, then run it to see it pass, then commit. Never collapse the steps.
- **Verify after each task.** Run `npm run typecheck` after every task in Phases 2–7. Run `npm test -- <test path>` after each Phase 1 task.

---

## Phase 1 — Add `tools/utils/` with tests (no behaviour change yet)

Each task creates ONE new util file plus its test, with no consumer changes. The existing tool scripts keep their local copies until Phase 3. This keeps Phase 1 commits trivially reviewable and bisectable.

### Task 1.1 — `tools/utils/async/delay.ts`

The simplest util — start here to bed in the directory layout and test style before tackling anything subtle.

- [ ] Confirm the target directory does not yet exist:

```bash
ls /Users/rulkens/Development/js/skymap/tools/utils/async 2>&1
```

Expected: `ls: ...: No such file or directory`.

- [ ] Create the test file at `/Users/rulkens/Development/js/skymap/tests/tools/utils/async/delay.test.ts` with the following content:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { delay } from '../../../../tools/utils/async/delay';

/**
 * `delay` is a thin Promise-ised `setTimeout`.  We use Vitest's fake
 * timers so the test runs instantly without sleeping the test process.
 */
describe('delay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified number of ms', async () => {
    vi.useFakeTimers();
    const p = delay(500);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    // Before time advances, the promise is still pending.
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Advance just past the threshold and flush microtasks.
    vi.advanceTimersByTime(500);
    await p;
    expect(resolved).toBe(true);
  });

  it('returns a Promise<void>', () => {
    vi.useFakeTimers();
    const p = delay(0);
    expect(p).toBeInstanceOf(Promise);
    vi.advanceTimersByTime(0);
    return p;
  });
});
```

- [ ] Run the test and confirm it fails because the source file does not yet exist:

```bash
npm test -- tests/tools/utils/async/delay.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/async/delay`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/async/delay.ts`:

```ts
/**
 * delay — sleep for `ms` milliseconds, then resolve.
 *
 * Why this lives in tools/utils/async and not src/utils: it is used only
 * by Node-side pipeline scripts (rate-limiting outbound HTTP). The browser
 * has nothing equivalent in the bundle that benefits from sharing it.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/async/delay.test.ts
```

Expected: `1 file passed`, `2 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0, no output.

- [ ] Commit only the two new files:

```bash
git add tools/utils/async/delay.ts tests/tools/utils/async/delay.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract delay helper into tools/utils/async

Adds tools/utils/async/delay.ts with a Promise-ised setTimeout, plus
tests using fake timers.  No consumer changes yet — expandFamousFromCatalogs
keeps its local copy until Phase 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.2 — `tools/utils/random/gaussian.ts`

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/random/gaussian.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { gaussian } from '../../../../tools/utils/random/gaussian';

/**
 * `gaussian` should produce draws with mean ≈ 0 and stddev ≈ 1.  We
 * sample N draws from a fixed seed and check empirical moments within
 * a generous tolerance — Box-Muller is exact in the limit, but 10 000
 * samples isn't infinity.
 */
describe('gaussian', () => {
  it('produces samples with mean ≈ 0 and stddev ≈ 1', () => {
    const rng = mulberry32(42);
    const N = 10000;
    let sum = 0;
    const xs: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = gaussian(rng);
      xs.push(x);
      sum += x;
    }
    const mean = sum / N;
    let sqsum = 0;
    for (const x of xs) sqsum += (x - mean) * (x - mean);
    const stddev = Math.sqrt(sqsum / N);
    expect(mean).toBeCloseTo(0, 1); // within 0.05
    expect(stddev).toBeCloseTo(1, 1); // within 0.05
  });

  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(gaussian(a)).toBe(gaussian(b));
    }
  });
});
```

- [ ] Run the test and confirm it fails:

```bash
npm test -- tests/tools/utils/random/gaussian.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/random/gaussian`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/random/gaussian.ts`:

```ts
/**
 * gaussian — one Box-Muller sample (mean 0, stddev 1) per call.
 *
 * Why discard the second sample Box-Muller produces "for free"?  The
 * per-galaxy duplicate count in `buildFilaments` is variable, so a
 * cached second sample would cross galaxy boundaries and tangle the
 * seeded determinism.  At ~3M points × ≤15 copies × 3 axes the wasted
 * call is negligible compared to file I/O and the Delaunay stage.
 *
 * `u1` is floor-clamped to `Number.MIN_VALUE` to avoid `Math.log(0)`;
 * `rng()` returns [0, 1) so the zero case is theoretically reachable.
 */
export function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/random/gaussian.test.ts
```

Expected: `1 file passed`, `2 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/random/gaussian.ts tests/tools/utils/random/gaussian.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract Box-Muller gaussian into tools/utils/random

Adds tools/utils/random/gaussian.ts; consumer migration deferred to
Phase 3 so buildFilaments still uses its local copy for now.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.3 — `tools/utils/math/floatHalf.ts`

Consolidates `f32ToF16Bits` (currently in `tools/parsers/floatToHalf.ts`) and `f16BitsToFloat` (currently inlined in `verifyCf4Scfd.ts`) into one file. The existing test at `tests/tools/parsers/floatToHalf.test.ts` stays in place this phase — it still imports the old location — and gets updated in Phase 3 when the old file is deleted.

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/math/floatHalf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { f32ToF16Bits, f16BitsToFloat } from '../../../../tools/utils/math/floatHalf';

/**
 * Round-trip cases for the IEEE-754 f32↔f16 helpers.  Both directions
 * live in one file so the inverse relationship is testable without an
 * external decoder.
 */
describe('floatHalf', () => {
  it('round-trips representative values within f16 precision', () => {
    const cases = [0, 1, -1, 0.5, -0.5, 65504, -65504, 1e-4];
    for (const v of cases) {
      const round = f16BitsToFloat(f32ToF16Bits(v));
      expect(round).toBeCloseTo(v, Math.abs(v) > 1 ? 0 : 3);
    }
  });

  it('overflows to +Inf and -Inf', () => {
    expect(f16BitsToFloat(f32ToF16Bits(1e10))).toBe(Infinity);
    expect(f16BitsToFloat(f32ToF16Bits(-1e10))).toBe(-Infinity);
  });

  it('preserves NaN', () => {
    expect(Number.isNaN(f16BitsToFloat(f32ToF16Bits(NaN)))).toBe(true);
  });

  it('packs zero as bit pattern 0', () => {
    expect(f32ToF16Bits(0)).toBe(0);
  });

  it('decodes f16 +Inf bit pattern back to Infinity', () => {
    // f16 +Inf bit pattern: 0 11111 0000000000 = 0x7C00
    expect(f16BitsToFloat(0x7c00)).toBe(Infinity);
  });

  it('demonstrates known precision loss for a large representable value', () => {
    // f16 has 10 mantissa bits; 1234 has < 11 significant bits so it is
    // representable exactly.  1235 is not — it quantises to 1235 or 1236
    // depending on rounding.  We assert the absolute error is < 1.
    expect(Math.abs(f16BitsToFloat(f32ToF16Bits(1235)) - 1235)).toBeLessThan(1);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/math/floatHalf.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/math/floatHalf`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/math/floatHalf.ts`:

```ts
/**
 * IEEE-754 f32 ↔ f16 raw-bit-pattern converters.
 *
 * Used offline by the SCFD volume builders (`buildCf4Density`,
 * `buildMcpmVolume`) to pack f32 source arrays into Uint16 f16 voxel
 * arrays for on-disk storage, and by the verifier (`verifyCf4Scfd`) to
 * decode them back for comparison against known cosmography.
 *
 * Why hand-roll instead of importing a library?  This is fundamentally
 * bit twiddling on a Uint32 view of a Float32Array — adding a dependency
 * for ~30 lines of arithmetic would dwarf the saved code.  Both
 * directions live in one file so the inverse relationship is locally
 * verifiable (see the round-trip tests).
 *
 * Layout reminder:
 *   f32: 1 sign + 8 exp + 23 mant  (bias 127)
 *   f16: 1 sign + 5 exp + 10 mant  (bias 15)
 *
 * Edge handling: NaN preserves the signal bit, ±Inf overflows, subnormal
 * underflow shifts the mantissa into the f16 subnormal field, and the
 * normal range uses round-to-nearest-even via the guard bit at
 * mantissa[12].
 */

/** Convert one IEEE-754 f32 value to its 16-bit f16 raw bit pattern. */
export function f32ToF16Bits(value: number): number {
  const f32 = new Float32Array(1);
  f32[0] = value;
  const u32 = new Uint32Array(f32.buffer)[0]!;
  const sign = (u32 >>> 16) & 0x8000;
  let mant = u32 & 0x007fffff;
  let exp = (u32 >>> 23) & 0xff;
  if (exp === 255) {
    // Inf / NaN — preserve the bit pattern signal (NaN vs Inf).
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00; // overflow → Inf
  if (exp <= 0) {
    // Subnormal or zero — shift mantissa to fit the f16 subnormal field.
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - exp);
    if (mant & 0x00001000) mant += 0x00002000; // round up
    return sign | (mant >>> 13);
  }
  // Normal range: round-to-nearest-even via the guard bit at mantissa[12].
  if (mant & 0x00001000) {
    mant += 0x00002000;
    if (mant & 0x00800000) {
      mant = 0;
      exp += 1;
      if (exp >= 31) return sign | 0x7c00;
    }
  }
  return sign | (exp << 10) | (mant >>> 13);
}

/** Decode a single f16 raw bit pattern back into a JS number. */
export function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  if (exp === 31) return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}
```

- [ ] Run the new test and confirm it passes:

```bash
npm test -- tests/tools/utils/math/floatHalf.test.ts
```

Expected: `1 file passed`, `6 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/math/floatHalf.ts tests/tools/utils/math/floatHalf.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): add tools/utils/math/floatHalf with f32↔f16 bit ops

Consolidates f32ToF16Bits (currently in tools/parsers/floatToHalf.ts)
and f16BitsToFloat (currently inlined in verifyCf4Scfd.ts) into a
single file.  Old locations stay in place this phase; Phase 3 migrates
consumers and deletes the originals.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.4 — `tools/utils/math/percentile.ts`

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/math/percentile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { percentileOf } from '../../../../tools/utils/math/percentile';

/**
 * `percentileOf` finds the largest index in a pre-sorted (ascending)
 * Float64Array whose value is ≤ the query, then converts that rank to
 * a 0–100 percentile.  No interpolation between adjacent breakpoints;
 * the callers only need it for ranking comparisons.
 */
describe('percentileOf', () => {
  it('returns 0 for the smallest value', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(1, sorted)).toBe(0);
  });

  it('returns 100 for the largest value', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(5, sorted)).toBe(100);
  });

  it('returns 50 for the median in an odd-length array', () => {
    const sorted = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentileOf(3, sorted)).toBe(50);
  });

  it('returns the rank of the largest value ≤ query', () => {
    const sorted = new Float64Array([0, 10, 20, 30, 40]);
    // 25 ≤ 20 is false; largest index with sorted[i] ≤ 25 is i=2 (value 20).
    // pct = 2 / 4 * 100 = 50.
    expect(percentileOf(25, sorted)).toBe(50);
  });

  it('returns 100 for a value above the max', () => {
    const sorted = new Float64Array([1, 2, 3]);
    expect(percentileOf(999, sorted)).toBe(100);
  });

  it('clamps to index 0 for a value below the min', () => {
    const sorted = new Float64Array([10, 20, 30]);
    // Binary search initialises lo=0; loop never advances.  Result: 0%.
    expect(percentileOf(-5, sorted)).toBe(0);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/math/percentile.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/math/percentile`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/math/percentile.ts`:

```ts
/**
 * percentileOf — find the rank of `value` in a pre-sorted ascending
 * Float64Array and return it as a 0–100 percentile.
 *
 * Binary searches for the largest index whose value is ≤ the query.
 * No linear interpolation between adjacent breakpoints — both callers
 * (auditCf4Anchors, verifyCf4Scfd) only need monotonic ranking, so the
 * cheaper integer-rank version is fine.
 *
 * Why a Float64Array argument rather than a generic number[]?  The
 * callers already hold typed-array data (decoded SCFD voxels) and a
 * conversion would dominate the cost of the search.
 */
export function percentileOf(value: number, sortedAsc: Float64Array): number {
  let lo = 0;
  let hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (sortedAsc[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return (lo / (sortedAsc.length - 1)) * 100;
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/math/percentile.test.ts
```

Expected: `1 file passed`, `6 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/math/percentile.ts tests/tools/utils/math/percentile.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract percentileOf into tools/utils/math

Shared by auditCf4Anchors and verifyCf4Scfd today as identical local
copies.  Consumer migration deferred to Phase 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.5 — `tools/utils/math/mat3.ts`

Imports the canonical `Mat3` and `Vec3` types from `src/@types/math/`. The cross-directory style used by existing tools is `../../../src/@types/math/Mat3` (relative path traversal — verified against `tools/auditCf4Anchors.ts:30`, which uses `../src/@types/math/Mat3`, scaled for the deeper nesting).

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/math/mat3.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyMat3, transpose3 } from '../../../../tools/utils/math/mat3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

/**
 * Column-major Mat3 ops.  Identity sanity, transpose-of-transpose
 * round-trip, and a hand-computed rotation example.
 */
describe('mat3', () => {
  const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it('applyMat3 with identity returns the input vector', () => {
    expect(applyMat3(identity, [3, 4, 5])).toEqual([3, 4, 5]);
  });

  it('transpose3(transpose3(m)) === m', () => {
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(transpose3(m))).toEqual(m);
  });

  it('transpose3 swaps rows and columns (column-major)', () => {
    // Column-major: columns are [1,2,3], [4,5,6], [7,8,9].
    // Transpose: columns are [1,4,7], [2,5,8], [3,6,9].
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose3(m)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  it('applyMat3 performs a 90° rotation about Z', () => {
    // Column-major 90° rotation about +Z: x → y, y → -x, z → z.
    // Columns: [0,1,0], [-1,0,0], [0,0,1].
    const rotZ90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    expect(applyMat3(rotZ90, [1, 0, 0])).toEqual([0, 1, 0]);
    expect(applyMat3(rotZ90, [0, 1, 0])).toEqual([-1, 0, 0]);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/math/mat3.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/math/mat3`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/math/mat3.ts`:

```ts
/**
 * 3×3 matrix ops in the column-major convention used everywhere in
 * skymap (gl-matrix, WebGPU, GLSL).
 *
 * Index map: cell at row r, column c is at `m[c*3 + r]`.  This is the
 * convention `Mat3` (src/@types/math/Mat3.d.ts) documents and that
 * gl-matrix follows; we mirror it offline so SG↔EQ transforms in
 * tools/ behave identically to the runtime.
 */
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * Apply a column-major Mat3 to a Vec3.
 *   result[r] = Σ_c m[c*3 + r] · v[c]
 */
export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}

/**
 * Transpose of a column-major Mat3.  For an orthonormal rotation this
 * is its inverse.  Indexing reminder: m[c*3 + r] becomes m'[r*3 + c].
 */
export function transpose3(m: Mat3): Mat3 {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/math/mat3.test.ts
```

Expected: `1 file passed`, `4 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/math/mat3.ts tests/tools/utils/math/mat3.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract column-major Mat3 ops into tools/utils/math

applyMat3 and transpose3 are duplicated verbatim between auditCf4Anchors
and verifyCf4Scfd.  This phase only adds the shared module + tests;
consumers migrate in Phase 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.6 — `tools/utils/math/coordinates.ts`

This is the largest math module: 5 functions extracted from `auditCf4Anchors.ts` and `verifyCf4Scfd.ts`. It imports `applyMat3`/`transpose3` from `mat3.ts` (Task 1.5) and `SG_TO_EQ_MATRIX` from `src/data/superGalacticTransform`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/math/coordinates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  eqToSg,
  sgToEq,
  eqCartToRaDecDist,
  voxelToEqCart,
  sgToVoxelIndex,
} from '../../../../tools/utils/math/coordinates';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/**
 * SG↔EQ Cartesian round-trip, eqCartToRaDecDist hand-computed spot
 * checks, and voxel-index linearity.
 */
describe('coordinates', () => {
  it('eqToSg then sgToEq round-trips to the input vector', () => {
    const cases: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [3, 4, 5],
      [-10, 20, -30],
    ];
    for (const eq of cases) {
      const sg = eqToSg(eq);
      const back = sgToEq(sg);
      expect(back[0]).toBeCloseTo(eq[0], 9);
      expect(back[1]).toBeCloseTo(eq[1], 9);
      expect(back[2]).toBeCloseTo(eq[2], 9);
    }
  });

  it('eqCartToRaDecDist on the +x axis returns RA=0, Dec=0', () => {
    const r = eqCartToRaDecDist([10, 0, 0]);
    expect(r.raHours).toBeCloseTo(0, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
    expect(r.distMpc).toBeCloseTo(10, 9);
  });

  it('eqCartToRaDecDist on the +z axis returns Dec=+90°', () => {
    const r = eqCartToRaDecDist([0, 0, 7]);
    expect(r.decDeg).toBeCloseTo(90, 9);
    expect(r.distMpc).toBeCloseTo(7, 9);
  });

  it('eqCartToRaDecDist on the +y axis returns RA=6h', () => {
    const r = eqCartToRaDecDist([0, 5, 0]);
    expect(r.raHours).toBeCloseTo(6, 9);
    expect(r.decDeg).toBeCloseTo(0, 9);
  });

  it('sgToVoxelIndex linearly maps SG Mpc onto the 128³ CF-4 grid', () => {
    // ORIGIN_MPC = -500, VOXEL_SIZE_MPC = 1000/128 ≈ 7.8125.
    // Origin (-500,-500,-500) → voxel (0,0,0); centre (0,0,0) → 64.
    expect(sgToVoxelIndex([-500, -500, -500])).toEqual([0, 0, 0]);
    const centre = sgToVoxelIndex([0, 0, 0]);
    expect(centre[0]).toBeCloseTo(64, 9);
    expect(centre[1]).toBeCloseTo(64, 9);
    expect(centre[2]).toBeCloseTo(64, 9);
  });

  it('voxelToEqCart returns Cartesian inside the unit cube for the centre voxel', () => {
    // 128³ cube, voxel size 1, dim 128: voxel (64,64,64) sits near origin.
    const eq = voxelToEqCart([64, 64, 64], [128, 128, 128], 1);
    // Magnitude is the SG-vector length put through SG→EQ rotation —
    // length-preserving, so we just sanity-check it is finite.
    expect(Number.isFinite(eq[0])).toBe(true);
    expect(Number.isFinite(eq[1])).toBe(true);
    expect(Number.isFinite(eq[2])).toBe(true);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/math/coordinates.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/math/coordinates`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/math/coordinates.ts`:

```ts
/**
 * Equatorial ↔ Supergalactic Cartesian conversions, plus the
 * SG-Mpc → CF-4 voxel-index helper used by the CF-4 diagnostics
 * (auditCf4Anchors, verifyCf4Scfd).
 *
 * Why duplicate the CF-4-specific origin and voxel-size constants
 * here rather than import them from src/?  They are coupled to the
 * CF-4 catalog box specifically (128³, ±500 Mpc) — moving them into
 * src/ would suggest runtime use, which there is none.  If a second
 * volume needs a similar helper we'd parameterise; right now hard-
 * coding keeps the call sites short.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SG_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';
import { applyMat3, transpose3 } from './mat3';

const EQ_TO_SG_MATRIX = transpose3(SG_TO_EQ_MATRIX);

const CF4_VOXEL_SIZE_MPC = 1000 / 128;
const CF4_DIMS = 128;
const CF4_ORIGIN_MPC = -CF4_VOXEL_SIZE_MPC * (CF4_DIMS / 2); // -500 Mpc

/** Equatorial Cartesian (Mpc) → Supergalactic Cartesian (Mpc). */
export function eqToSg(eq: Vec3): Vec3 {
  return applyMat3(EQ_TO_SG_MATRIX, eq);
}

/** Supergalactic Cartesian (Mpc) → Equatorial Cartesian (Mpc). */
export function sgToEq(sg: Vec3): Vec3 {
  return applyMat3(SG_TO_EQ_MATRIX, sg);
}

/** Equatorial Cartesian → (RA hours, Dec deg, distance Mpc). */
export function eqCartToRaDecDist(eq: Vec3): {
  raHours: number;
  decDeg: number;
  distMpc: number;
} {
  const d = Math.hypot(eq[0], eq[1], eq[2]);
  const decDeg = (Math.asin(eq[2] / d) * 180) / Math.PI;
  let raDeg = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { raHours: raDeg / 15, decDeg, distMpc: d };
}

/**
 * SG Cartesian (Mpc) → continuous voxel indices in the CF-4 cube's
 * native numpy axis order.  Linear: corner 0 at -500 Mpc, corner 128
 * at +500 Mpc.
 */
export function sgToVoxelIndex(sg: Vec3): Vec3 {
  return [
    (sg[0] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[1] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
    (sg[2] - CF4_ORIGIN_MPC) / CF4_VOXEL_SIZE_MPC,
  ];
}

/**
 * Integer voxel index → Equatorial Cartesian (Mpc), centring the
 * voxel by adding 0.5 to each axis before rescaling.
 */
export function voxelToEqCart(vox: Vec3, dims: Vec3, voxelSize: number): Vec3 {
  const sgX = (vox[0] - dims[0] / 2 + 0.5) * voxelSize;
  const sgY = (vox[1] - dims[1] / 2 + 0.5) * voxelSize;
  const sgZ = (vox[2] - dims[2] / 2 + 0.5) * voxelSize;
  return sgToEq([sgX, sgY, sgZ]);
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/math/coordinates.test.ts
```

Expected: `1 file passed`, `6 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/math/coordinates.ts tests/tools/utils/math/coordinates.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract SG↔EQ coordinate helpers into tools/utils/math

Consolidates eqToSg, sgToEq, eqCartToRaDecDist, sgToVoxelIndex, and
voxelToEqCart from auditCf4Anchors + verifyCf4Scfd into a single
module.  The CF-4 cube origin / voxel-size constants live with the
helpers since the only callers are the CF-4 diagnostics.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.7 — `tools/utils/io/jsonCache.ts`

Generic version of the Wikipedia/HyperLEDA cache helpers. **Important behaviour reconciliation:** both current implementations (`tools/fetchFamousImages.ts:522-536`, `tools/expandFamousFromCatalogs.ts:679-712`) return `{}` on missing file AND warn-and-return-`{}` on malformed JSON. The new helper must match that — *not* the spec's looser "throws on parse errors" wording.

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/io/jsonCache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadJsonCache, saveJsonCache } from '../../../../tools/utils/io/jsonCache';

describe('jsonCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jsoncache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('loadJsonCache returns {} for a missing file', () => {
    const result = loadJsonCache<Record<string, string>>(join(dir, 'missing.json'));
    expect(result).toEqual({});
  });

  it('loadJsonCache returns the parsed contents for a well-formed file', () => {
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify({ a: '1', b: '2' }));
    expect(loadJsonCache<Record<string, string>>(path)).toEqual({ a: '1', b: '2' });
  });

  it('loadJsonCache warns and returns {} for malformed JSON', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{not valid json');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = loadJsonCache<Record<string, string>>(path);
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it('saveJsonCache writes 2-space-indented JSON and creates the parent directory', () => {
    const path = join(dir, 'nested', 'sub', 'out.json');
    saveJsonCache(path, { x: 'y' });
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toBe('{\n  "x": "y"\n}');
  });

  it('round-trips through save → load', () => {
    const path = join(dir, 'rt.json');
    const data = { foo: 'bar', baz: 'qux' };
    saveJsonCache(path, data);
    expect(loadJsonCache<Record<string, string>>(path)).toEqual(data);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/io/jsonCache.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/io/jsonCache`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/io/jsonCache.ts`:

```ts
/**
 * Generic JSON-file cache used by the famous-galaxy pipeline.
 *
 * Both current callers (fetchFamousImages, expandFamousFromCatalogs)
 * cache small key→string maps on disk to avoid repeating expensive
 * network lookups between runs.  The behaviour is identical between
 * them and is faithfully preserved here:
 *
 *   - Missing file → `{}` (first-run-friendly: no need to seed).
 *   - Malformed JSON → warn on stderr and return `{}` (matches the
 *     existing warn-and-continue behaviour; throwing would break a
 *     resume after a partial write).
 *   - Save uses 2-space indent for human diffability and creates the
 *     parent directory if absent.
 *
 * Generic over `T extends Record<string, unknown>` to keep the callers'
 * domain types intact (HyperLedaCache, WikipediaCache).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadJsonCache<T extends Record<string, unknown>>(path: string): T {
  if (!existsSync(path)) return {} as T;
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch {
    process.stderr.write(`warn: JSON cache at ${path} is malformed, starting fresh\n`);
    return {} as T;
  }
}

export function saveJsonCache<T extends Record<string, unknown>>(path: string, data: T): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/io/jsonCache.test.ts
```

Expected: `1 file passed`, `5 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/io/jsonCache.ts tests/tools/utils/io/jsonCache.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): add generic loadJsonCache / saveJsonCache helpers

Generic version of loadWikipediaCache + loadHyperLedaCache (and their
save twins) which are duplicated in fetchFamousImages and
expandFamousFromCatalogs today.  Behaviour exactly matches the
existing helpers — missing file → {}, malformed → warn + {} — so
Phase 3 substitution is a pure dedup with no behaviour delta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.8 — `tools/utils/io/readIdSet.ts`

**Behaviour reconciliation:** the spec describes `readIdSet` as "splits on `\n`, trims, filters empties". The actual current code (`tools/fetch2massXsc.ts:54-67` and `tools/fetchHyperLeda.ts:65-88`) is a CSV-cache parser: skip header line, take everything before the first comma, trim, skip empties. The new helper must match the actual code — otherwise Phase 3 substitution would silently drop the header-skip and break resume semantics. The function is therefore named for what it does: read the first CSV column as a Set of IDs, skipping the header.

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/io/readIdSet.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIdSet } from '../../../../tools/utils/io/readIdSet';

describe('readIdSet', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'readidset-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty Set for a missing file', () => {
    const result = readIdSet(join(dir, 'missing.csv'));
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('skips the header line and collects the first CSV column', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n12345,foo\n67890,bar\n');
    const result = readIdSet(path);
    expect([...result].sort()).toEqual(['12345', '67890']);
  });

  it('skips blank lines and lines without a comma', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n\n12345,foo\nnotacsvline\n67890,bar\n');
    const result = readIdSet(path);
    expect([...result].sort()).toEqual(['12345', '67890']);
  });

  it('trims whitespace around the id', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n  42  ,x\n');
    const result = readIdSet(path);
    expect([...result]).toEqual(['42']);
  });

  it('handles CRLF line endings', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\r\n12345,foo\r\n67890,bar\r\n');
    const result = readIdSet(path);
    expect([...result].sort()).toEqual(['12345', '67890']);
  });

  it('returns an empty Set for a header-only file', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n');
    expect(readIdSet(path).size).toBe(0);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/io/readIdSet.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/io/readIdSet`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/io/readIdSet.ts`:

```ts
/**
 * readIdSet — read a CSV-style resume cache and return the set of IDs
 * already processed.
 *
 * Used by the long-running fetch scripts (fetch2massXsc, fetchHyperLeda)
 * to resume after a network drop without re-querying every ID.  The
 * file format is "<id>,<rest>\n" with a one-line header; we parse only
 * the first column.
 *
 * Behaviour preserved from the two original implementations:
 *
 *   - Missing file → empty Set (first-run-friendly).
 *   - Header line (index 0) skipped unconditionally.
 *   - Lines with no comma are skipped (defends against truncated rows).
 *   - IDs are trimmed; empty IDs are dropped.
 *   - CRLF tolerated (Vizier exports use CRLF).
 *
 * Why not a generic line-splitter as the spec suggested?  The two
 * callers both need the header-skip and first-column semantics; a
 * naive `text.split('\n')` would silently include the header string
 * ("id" or "pgc") in the Set and break the "already queried" check.
 */
import { existsSync, readFileSync } from 'node:fs';

export function readIdSet(path: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(path)) return ids;
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes(',')) continue;
    const id = line.slice(0, line.indexOf(',')).trim();
    if (id.length > 0) ids.add(id);
  }
  return ids;
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/io/readIdSet.test.ts
```

Expected: `1 file passed`, `6 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/io/readIdSet.ts tests/tools/utils/io/readIdSet.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): extract readIdSet CSV-resume helper into tools/utils/io

Unifies readExistingIds (fetch2massXsc) and readExistingPgcs
(fetchHyperLeda) into one helper.  Both are CSV-cache parsers that
skip the header and take the first column; matched exactly so Phase 3
substitution is a pure dedup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 1.9 — `tools/utils/cli/args.ts`

**Spec scope check:** the spec specifies `parseFlags(argv, schema)` for bool-only flags. `tools/expandFamousFromCatalogs.ts:665-670` is bool-only (`--no-cache`, `--dry-run`) — fits cleanly. `tools/fetchFamousImages.ts:507-520` is mixed: bool `--force` plus a string-valued `--source-preference wikipedia|desi`. Per the spec we expose ONLY the bool-only API; `fetchFamousImages.ts` keeps its bespoke argv loop in Phase 3 for the `--source-preference` half and uses the generic helper for `--force`. This split is justified in Phase 3 Task 3.4.

- [ ] Create `/Users/rulkens/Development/js/skymap/tests/tools/utils/cli/args.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFlags } from '../../../../tools/utils/cli/args';

describe('parseFlags', () => {
  it('returns all flags false when none are passed', () => {
    const result = parseFlags([], { '--force': 'bool', '--dry-run': 'bool' });
    expect(result).toEqual({ '--force': false, '--dry-run': false });
  });

  it('returns true for a flag present in argv', () => {
    const result = parseFlags(['--force'], { '--force': 'bool', '--dry-run': 'bool' });
    expect(result).toEqual({ '--force': true, '--dry-run': false });
  });

  it('returns true for each flag independently', () => {
    const result = parseFlags(
      ['--no-cache', '--dry-run'],
      { '--no-cache': 'bool', '--dry-run': 'bool' },
    );
    expect(result).toEqual({ '--no-cache': true, '--dry-run': true });
  });

  it('ignores unrelated argv entries', () => {
    const result = parseFlags(
      ['some-positional', '--force', '--other-flag'],
      { '--force': 'bool' },
    );
    expect(result).toEqual({ '--force': true });
  });

  it('returns the same shape as the schema (no extra keys)', () => {
    const result = parseFlags(['--force'], { '--force': 'bool' });
    expect(Object.keys(result)).toEqual(['--force']);
  });
});
```

- [ ] Run and confirm failure:

```bash
npm test -- tests/tools/utils/cli/args.test.ts
```

Expected: failure with `Cannot find module .../tools/utils/cli/args`.

- [ ] Create `/Users/rulkens/Development/js/skymap/tools/utils/cli/args.ts`:

```ts
/**
 * parseFlags — minimal boolean-only argv parser for tool scripts.
 *
 * Scope intentionally tiny: each tool script declares the bool flags
 * it cares about and gets a record mapping flag name → boolean.  We
 * do not handle string-valued flags here because adding them would
 * grow the surface (separator handling, type schema, default values)
 * for a marginal benefit — the only string-valued flag in the codebase
 * (`--source-preference`) stays in its bespoke argv loop.
 *
 * Why a schema parameter rather than auto-detecting flags?  Auto-detect
 * would silently accept typos (`--frce` would parse as a new flag,
 * not a misspelling).  An explicit schema turns typos into "missing
 * key" lookups at the call site, which surfaces in the type checker
 * if the caller indexes through a typed record.
 */
export type FlagSchema = Record<string, 'bool'>;

export function parseFlags<S extends FlagSchema>(
  argv: readonly string[],
  schema: S,
): Record<keyof S, boolean> {
  const result = {} as Record<keyof S, boolean>;
  for (const key of Object.keys(schema) as (keyof S)[]) {
    result[key] = argv.includes(key as string);
  }
  return result;
}
```

- [ ] Run the test and confirm it passes:

```bash
npm test -- tests/tools/utils/cli/args.test.ts
```

Expected: `1 file passed`, `5 tests passed`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/utils/cli/args.ts tests/tools/utils/cli/args.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): add minimal bool-only parseFlags helper

Generic version of the two current parseFlags implementations.
Scope kept to bool flags — fetchFamousImages's string-valued
--source-preference flag will keep its bespoke loop in Phase 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Delete dead code

### Task 2.1 — Delete `tools/csvToBin.ts` and the `csv-to-bin` script

The spec ("Dead code" section) audited this: the only live reference is the npm script; all parsing logic was already lifted into `tools/parsers/sdssCsv.ts`; the multi-survey loader `buildAllBins.ts` supersedes it. A fresh grep confirms no `*.ts`/`*.json`/`*.md` outside `docs/superpowers/plans/completed/` and `docs/code-review-2026-05-03.md` references it.

- [ ] Confirm no live references remain:

```bash
grep -rn "csvToBin\|csv-to-bin" /Users/rulkens/Development/js/skymap/ \
  --include='*.ts' --include='*.json' --include='*.md' 2>/dev/null \
  | grep -v "node_modules\|.claude/worktrees\|completed\|code-review-2026-05-03"
```

Expected: empty output. (If anything appears, stop and re-evaluate — do not delete.)

- [ ] Delete the script:

```bash
git rm tools/csvToBin.ts
```

- [ ] Remove the `csv-to-bin` entry from `/Users/rulkens/Development/js/skymap/package.json`. Open the file and delete the line:

```
    "csv-to-bin": "tsx tools/csvToBin.ts",
```

(It lives between `expand-famous` and `dev` — line 46 currently.)

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the full test suite to confirm nothing depended on the script:

```bash
npm test
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/csvToBin.ts package.json
git commit -m "$(cat <<'EOF'
chore(tools): delete dead csvToBin script

Its parsing logic was lifted into tools/parsers/sdssCsv.ts long ago;
the multi-survey loader buildAllBins.ts is the canonical SDSS → .bin
path.  The only live reference was the npm script, also removed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Update tool scripts to use new utils + drop local copies

Each task in this phase edits ONE tool script: redirect imports to the new utils, delete the local duplicate, run `npm run typecheck` to confirm the cut surface is clean, commit. After all script substitutions are done, Task 3.9 deletes the obsolete `tools/parsers/floatToHalf.ts`.

### Task 3.1 — `tools/buildFilaments.ts` → use `mulberry32` from `src/` and `gaussian` from `tools/utils/`

- [ ] Read the file to locate the current `makeMulberry32` and `gaussian` definitions (around lines 420 and 444). Add the new imports near the top of the imports block:

```ts
import { mulberry32 } from '../src/utils/random/mulberry32';
import { gaussian } from './utils/random/gaussian';
```

- [ ] Delete the local `makeMulberry32` definition (the entire function from its leading block-comment through the closing `}`).

- [ ] Delete the local `gaussian` definition (likewise: comment block + function).

- [ ] Find every call site of `makeMulberry32(...)` in this file and replace it with `mulberry32(...)`. There may be one or two call sites; use Read/Edit to find and replace.

- [ ] Verify no stale references remain:

```bash
grep -n "makeMulberry32" /Users/rulkens/Development/js/skymap/tools/buildFilaments.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the existing buildFilaments test to confirm parseArgs still works:

```bash
npm test -- tests/tools/buildFilaments.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/buildFilaments.ts
git commit -m "$(cat <<'EOF'
refactor(tools): buildFilaments uses shared mulberry32 + gaussian

Drops the local makeMulberry32 (verbatim copy of
src/utils/random/mulberry32) and the local gaussian (now in
tools/utils/random/gaussian).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.2 — `tools/auditCf4Anchors.ts` → use shared math + drop local Mat3/Vec3

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/auditCf4Anchors.ts`. The current local definitions to remove are:
  - `applyMat3` (lines ~37-47)
  - `transpose3` (lines ~49-55)
  - `EQ_TO_SG_MATRIX` constant (line 57) — keep deleted; the new `coordinates` module owns it internally.
  - `eqToSg` (lines ~59-62)
  - `sgToVoxelIndex` (lines ~64-78)
  - `percentileOf` (lines ~109-125)
  - The constants `VOXEL_SIZE_MPC`, `DIMS`, `ORIGIN_MPC` (lines 33-35) — keep deleted; `coordinates.sgToVoxelIndex` hard-codes the equivalents.

- [ ] Replace the import block (lines ~25-31) with:

```ts
import { readFileSync } from 'node:fs';
import { readNpy } from './parsers/npyReader';
import { CLUSTER_ANCHORS, raDecDistToEqCart } from '../src/data/clusterAnchors';
import type { ClusterAnchor } from '../src/@types/data/ClusterAnchor';
import type { Vec3 } from '../src/@types/math/Vec3';
import { eqToSg, sgToVoxelIndex } from './utils/math/coordinates';
import { percentileOf } from './utils/math/percentile';
```

Note: `SG_TO_EQ_MATRIX`, `Mat3`, `applyMat3`, `transpose3` are no longer imported here — the helpers we now call wrap them internally.

- [ ] Delete the helper functions and constants listed above. The file should now jump from imports directly to `function sampleVariant(...)`.

- [ ] Verify no orphan references:

```bash
grep -n "VOXEL_SIZE_MPC\|EQ_TO_SG_MATRIX\|^function applyMat3\|^function transpose3\|^function eqToSg\|^function sgToVoxelIndex\|^function percentileOf" /Users/rulkens/Development/js/skymap/tools/auditCf4Anchors.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/auditCf4Anchors.ts
git commit -m "$(cat <<'EOF'
refactor(tools): auditCf4Anchors uses shared coordinates + percentile utils

Drops local copies of applyMat3, transpose3, eqToSg, sgToVoxelIndex,
percentileOf, and the CF-4 box constants (VOXEL_SIZE_MPC, DIMS,
ORIGIN_MPC).  All now live in tools/utils/math/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.3 — `tools/verifyCf4Scfd.ts` → use shared math + floatHalf

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/verifyCf4Scfd.ts`. The current local definitions to remove are:
  - `transpose3` (lines ~36-42)
  - `EQ_TO_SG` constant (line 44) — keep deleted; lives inside `coordinates`.
  - `applyMat3` (lines ~46-53)
  - `eqToSg` (lines ~55-57)
  - `sgToEq` (lines ~59-61)
  - `eqCartToRaDecDist` (lines ~63-74)
  - `f16BitsToFloat` (lines ~76-84)
  - `percentileOf` (lines ~107-116)
  - `voxelToEqCart` (lines ~118-124)
  - The local `Mat3` type alias is imported but unused after this edit; remove that import line.

- [ ] Replace the import block (lines ~20-31) with:

```ts
import { readFileSync } from 'node:fs';
import { decodeScalarField } from '../src/data/scalarFieldFormat';
import {
  CLUSTER_ANCHORS,
  SUPERCLUSTER_ANCHORS,
  VOID_ANCHORS,
  raDecDistToEqCart,
} from '../src/data/clusterAnchors';
import type { ClusterAnchor } from '../src/@types/data/ClusterAnchor';
import type { Vec3 } from '../src/@types/math/Vec3';
import {
  eqToSg,
  eqCartToRaDecDist,
  voxelToEqCart,
} from './utils/math/coordinates';
import { f16BitsToFloat } from './utils/math/floatHalf';
import { percentileOf } from './utils/math/percentile';
```

- [ ] Delete each helper function and constant listed above. The file should now jump from the `NamedAnchor` type alias straight to `sampleAtAnchor`.

- [ ] Verify no orphan references:

```bash
grep -n "^function transpose3\|^function applyMat3\|^function eqToSg\|^function sgToEq\|^function eqCartToRaDecDist\|^function f16BitsToFloat\|^function percentileOf\|^function voxelToEqCart\|EQ_TO_SG[^_]" /Users/rulkens/Development/js/skymap/tools/verifyCf4Scfd.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/verifyCf4Scfd.ts
git commit -m "$(cat <<'EOF'
refactor(tools): verifyCf4Scfd uses shared math + floatHalf utils

Drops local transpose3, applyMat3, eqToSg, sgToEq, eqCartToRaDecDist,
f16BitsToFloat, percentileOf, voxelToEqCart, and the EQ_TO_SG matrix
constant.  All now live under tools/utils/math/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.4 — `tools/fetchFamousImages.ts` → use jsonCache + partial parseFlags

The bool flag `--force` migrates to the generic `parseFlags`; the string-valued `--source-preference` stays in a small bespoke loop. The `WikipediaCache` type alias is inlined as `Record<string, string>` at the single call site since (a) it's used in exactly one place and (b) keeping it would force a redundant cast against `loadJsonCache<Record<string, string>>`'s already-`Record<string, string>` return type.

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/fetchFamousImages.ts`.

- [ ] In the imports near the top, remove `existsSync, mkdirSync, readFileSync, writeFileSync` from the `node:fs` import if they are no longer used after the helper deletions (verify with a search after the helpers are gone — keep only what survives). Add:

```ts
import { loadJsonCache, saveJsonCache } from './utils/io/jsonCache';
import { parseFlags } from './utils/cli/args';
```

- [ ] Delete the local `loadWikipediaCache` function (lines ~522-531) and `saveWikipediaCache` function (lines ~533-536).

- [ ] Delete the `type WikipediaCache = Record<string, string>;` alias (line 159).

- [ ] Replace the local `parseFlags` (lines ~507-520) with a hybrid:

```ts
function parseCliArgs(argv: readonly string[]): CliFlags {
  const flags = parseFlags(argv, { '--force': 'bool' });
  let sourcePreference: 'wikipedia' | 'desi' = 'wikipedia';
  const idx = argv.indexOf('--source-preference');
  if (idx >= 0 && idx + 1 < argv.length) {
    const v = argv[idx + 1];
    if (v === 'wikipedia' || v === 'desi') {
      sourcePreference = v;
    } else {
      throw new Error(`--source-preference must be "wikipedia" or "desi" (got "${v}")`);
    }
  }
  return { force: flags['--force'], sourcePreference };
}
```

- [ ] Update the single call site inside `main()` from `parseFlags(process.argv.slice(2))` to `parseCliArgs(process.argv.slice(2))`.

- [ ] Update every reference to `WikipediaCache` (3 sites: parameter types in the removed helpers — already gone — plus the call sites in main):
  - At `const wikipediaCache = loadWikipediaCache(wikipediaCachePath);` (line ~551) → `const wikipediaCache = loadJsonCache<Record<string, string>>(wikipediaCachePath);`
  - At `saveWikipediaCache(wikipediaCachePath, wikipediaCache);` (lines ~581, ~653) → `saveJsonCache(wikipediaCachePath, wikipediaCache);` (both call sites).

- [ ] Verify the helper names and the old alias are gone:

```bash
grep -n "loadWikipediaCache\|saveWikipediaCache\|WikipediaCache" /Users/rulkens/Development/js/skymap/tools/fetchFamousImages.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the existing fetchFamousImages test to confirm CLI parsing still works as expected:

```bash
npm test -- tests/tools/fetchFamousImages.test.ts
```

Expected: all tests pass. If the existing test imports `parseFlags` by name, update the import to `parseCliArgs` to match the rename — record this edit in the commit message.

- [ ] Commit:

```bash
git add tools/fetchFamousImages.ts tests/tools/fetchFamousImages.test.ts
git commit -m "$(cat <<'EOF'
refactor(tools): fetchFamousImages uses jsonCache + bool parseFlags

Drops local loadWikipediaCache, saveWikipediaCache, and the
WikipediaCache type alias (inlined as Record<string, string> at the
single call site).  The CLI parser is renamed to parseCliArgs and
splits responsibilities: bool --force flows through tools/utils/cli/args,
the string --source-preference keeps its bespoke loop.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.5 — `tools/expandFamousFromCatalogs.ts` → use jsonCache + parseFlags + delay

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/expandFamousFromCatalogs.ts`.

- [ ] Add imports:

```ts
import { loadJsonCache, saveJsonCache } from './utils/io/jsonCache';
import { parseFlags } from './utils/cli/args';
import { delay } from './utils/async/delay';
```

- [ ] Delete the local `parseFlags` (lines ~665-670). Replace the single call site inside `main()`:

```ts
const flags = parseFlags(process.argv.slice(2), {
  '--no-cache': 'bool',
  '--dry-run': 'bool',
});
const noCache = flags['--no-cache'];
const dryRun = flags['--dry-run'];
```

And update subsequent `flags.noCache` / `flags.dryRun` references to the local consts. (Or alternatively, immediately destructure into the legacy `{ noCache, dryRun }` shape — pick whichever yields the smaller diff. Decide by reading the file first.)

- [ ] Delete the local `loadHyperLedaCache` (lines ~679-688), `saveHyperLedaCache` (lines ~690-693), `loadWikipediaCache` (lines ~697-706), and `saveWikipediaCache` (lines ~708-711) functions.

- [ ] Delete the `type HyperLedaCache = Record<string, string>;` and `type WikipediaCache = Record<string, string>;` aliases. Update the two cache call sites:
  - `loadHyperLedaCache(hyperledaCachePath)` → `loadJsonCache<Record<string, string>>(hyperledaCachePath)`
  - `loadWikipediaCache(wikipediaCachePath)` → `loadJsonCache<Record<string, string>>(wikipediaCachePath)`
  - `saveHyperLedaCache(hyperledaCachePath, hyperledaCache)` → `saveJsonCache(hyperledaCachePath, hyperledaCache)`
  - `saveWikipediaCache(wikipediaCachePath, wikipediaCache)` → `saveJsonCache(wikipediaCachePath, wikipediaCache)`

- [ ] Delete the local `delay` function (lines ~713-715). Existing call sites already say `delay(...)` and pick up the imported version.

- [ ] Verify no orphan references:

```bash
grep -n "loadHyperLedaCache\|saveHyperLedaCache\|loadWikipediaCache\|saveWikipediaCache\|HyperLedaCache\|WikipediaCache\|^async function delay" /Users/rulkens/Development/js/skymap/tools/expandFamousFromCatalogs.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the existing expandFamousFromCatalogs test:

```bash
npm test -- tests/tools/expandFamousFromCatalogs.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/expandFamousFromCatalogs.ts
git commit -m "$(cat <<'EOF'
refactor(tools): expandFamousFromCatalogs uses shared jsonCache + parseFlags + delay

Drops local loadHyperLedaCache, saveHyperLedaCache, loadWikipediaCache,
saveWikipediaCache, parseFlags, and delay implementations in favour
of the new tools/utils helpers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.6 — `tools/fetch2massXsc.ts` → use `readIdSet`

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/fetch2massXsc.ts`.

- [ ] Add import near the top of the imports block:

```ts
import { readIdSet } from './utils/io/readIdSet';
```

- [ ] Delete the local `readExistingIds` function (lines ~46-67, including its doc-comment block).

- [ ] Find every call site `readExistingIds(...)` and rename to `readIdSet(...)`. (There is typically a single call.)

- [ ] Verify:

```bash
grep -n "readExistingIds" /Users/rulkens/Development/js/skymap/tools/fetch2massXsc.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/fetch2massXsc.ts
git commit -m "$(cat <<'EOF'
refactor(tools): fetch2massXsc uses shared readIdSet

Drops local readExistingIds; semantics preserved exactly
(skip header, first comma-separated column, CRLF-tolerant).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.7 — `tools/fetchHyperLeda.ts` → use `readIdSet`

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/fetchHyperLeda.ts`.

- [ ] Add import:

```ts
import { readIdSet } from './utils/io/readIdSet';
```

- [ ] Delete the local `readExistingPgcs` function (lines ~57-77 including its doc-comment block).

- [ ] Find every call site `readExistingPgcs(...)` and rename to `readIdSet(...)`.

- [ ] Verify:

```bash
grep -n "readExistingPgcs" /Users/rulkens/Development/js/skymap/tools/fetchHyperLeda.ts
```

Expected: empty output.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/fetchHyperLeda.ts
git commit -m "$(cat <<'EOF'
refactor(tools): fetchHyperLeda uses shared readIdSet

Drops local readExistingPgcs; same skip-header + first-column
semantics, now centralised.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.8 — Redirect `buildMcpmVolume.ts` and `buildCf4Density.ts` to the new floatHalf path

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/buildMcpmVolume.ts`. Change:

```ts
import { f32ToF16Bits } from './parsers/floatToHalf';
```

to:

```ts
import { f32ToF16Bits } from './utils/math/floatHalf';
```

Also update the file's module-header comment if it mentions `tools/parsers/floatToHalf.ts` — point it at the new location.

- [ ] Open `/Users/rulkens/Development/js/skymap/tools/buildCf4Density.ts`. Change:

```ts
import { f32ToF16Bits } from './parsers/floatToHalf';
```

to:

```ts
import { f32ToF16Bits } from './utils/math/floatHalf';
```

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the related smoke tests:

```bash
npm test -- tests/tools/buildCf4Density.smoke.test.ts tests/tools/buildMcpmVolume.smoke.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/buildMcpmVolume.ts tools/buildCf4Density.ts
git commit -m "$(cat <<'EOF'
refactor(tools): redirect SCFD volume builders to new floatHalf path

Both buildMcpmVolume and buildCf4Density now import f32ToF16Bits from
tools/utils/math/floatHalf instead of tools/parsers/floatToHalf.  The
old file is deleted in the next commit once its test is also moved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3.9 — Delete `tools/parsers/floatToHalf.ts` and its outdated test

The new test at `tests/tools/utils/math/floatHalf.test.ts` (Task 1.3) already covers everything the old test covered plus more. The old test file at `tests/tools/parsers/floatToHalf.test.ts` is now redundant.

- [ ] Confirm no remaining importers of the old path:

```bash
grep -rn "parsers/floatToHalf" /Users/rulkens/Development/js/skymap/tools/ /Users/rulkens/Development/js/skymap/src/ /Users/rulkens/Development/js/skymap/tests/
```

Expected: only the test file `tests/tools/parsers/floatToHalf.test.ts` (which is about to be deleted). If anything else appears, fix it first.

- [ ] Delete both files:

```bash
git rm tools/parsers/floatToHalf.ts tests/tools/parsers/floatToHalf.test.ts
```

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the full test suite to confirm the new util's test is exercising the same behaviour:

```bash
npm test
```

Expected: all tests pass (count is one file fewer than before, but coverage of f32↔f16 is the same — the new test has 6 cases vs the old 4).

- [ ] Commit:

```bash
git add tools/parsers/floatToHalf.ts tests/tools/parsers/floatToHalf.test.ts
git commit -m "$(cat <<'EOF'
chore(tools): delete obsolete tools/parsers/floatToHalf

f32ToF16Bits and its tests now live under tools/utils/math/floatHalf
(joined by f16BitsToFloat).  All consumers were redirected in the
previous commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Folder restructure (`git mv` into subfolders)

One task per destination subfolder. Every move uses `git mv` so `git blame` survives. After each move batch, fix the now-broken relative imports (`./parsers/...` → `../parsers/...`, `./utils/...` → `../utils/...`, etc.). Run `npm run typecheck` after each task; commit per folder.

**Order rationale:** start with `catalog/` (the smallest and most self-contained), then `famous/` (a tight cluster of 4 files), then folders with a single file or no cross-dependencies, then `volumes/` (most cross-imports — easier once `utils/` paths are settled), and finally the unambiguous ones.

### Task 4.1 — Move into `tools/catalog/`

Moves: `buildAllBins.ts`, `crossMatch.ts`, `subsampleByAbsMag.ts`.

- [ ] Create the destination directory (git tracks files, not empty dirs, so an explicit `mkdir` isn't required — `git mv` creates the path):

```bash
git mv tools/buildAllBins.ts tools/catalog/buildAllBins.ts
git mv tools/crossMatch.ts tools/catalog/crossMatch.ts
git mv tools/subsampleByAbsMag.ts tools/catalog/subsampleByAbsMag.ts
```

- [ ] Open each of the three moved files and update relative imports:
  - `./parsers/<x>` → `../parsers/<x>`
  - `./crossMatch` → `./crossMatch` (stays the same — both moved into `catalog/`)
  - `./subsampleByAbsMag` → `./subsampleByAbsMag` (stays the same — both in `catalog/`)
  - `../src/...` → `../../src/...` (one extra `..` because we are one level deeper)

Use Read on each file's import block, then Edit each broken path. Common pattern: every `from '../src/` becomes `from '../../src/`. Be precise — there are no abbreviations in this codebase, so a literal s/`'\.\.\/src\//`'\.\.\/\.\.\/src\//g` is safe per file.

- [ ] Update test imports that target the moved files. Check tests under `/Users/rulkens/Development/js/skymap/tests/tools/`:

```bash
grep -rln "tools/buildAllBins\|tools/crossMatch\|tools/subsampleByAbsMag" /Users/rulkens/Development/js/skymap/tests/
```

For each match, update the import path to the new subfolder (`tools/catalog/<name>`).

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0. If a path is wrong, the error will say "Cannot find module '../...'" — re-read the imports in the offending file.

- [ ] Run the affected tests:

```bash
npm test -- tests/tools/subsampleByAbsMag.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/catalog/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move catalog scripts into tools/catalog/

git mv buildAllBins.ts, crossMatch.ts, subsampleByAbsMag.ts into a
dedicated subfolder.  Updates relative imports (./parsers/ →
../parsers/, ../src/ → ../../src/) and test import paths.  Blame
preserved via git mv.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.2 — Move into `tools/famous/`

Moves: `buildFamous.ts`, `expandFamousFromCatalogs.ts`, `fetchFamousImages.ts`, `famousImageProcessor.ts`.

- [ ] Move the four files:

```bash
git mv tools/buildFamous.ts tools/famous/buildFamous.ts
git mv tools/expandFamousFromCatalogs.ts tools/famous/expandFamousFromCatalogs.ts
git mv tools/fetchFamousImages.ts tools/famous/fetchFamousImages.ts
git mv tools/famousImageProcessor.ts tools/famous/famousImageProcessor.ts
```

- [ ] In each moved file, update relative imports:
  - `./parsers/<x>` → `../parsers/<x>`
  - `./utils/<x>` → `../utils/<x>`
  - `./famousImageProcessor` → `./famousImageProcessor` (still in the same folder)
  - `../src/<x>` → `../../src/<x>`

- [ ] Update test imports:

```bash
grep -rln "tools/buildFamous\|tools/expandFamousFromCatalogs\|tools/fetchFamousImages\|tools/famousImageProcessor" /Users/rulkens/Development/js/skymap/tests/
```

For each match, update to `tools/famous/<name>`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run affected tests:

```bash
npm test -- tests/tools/expandFamousFromCatalogs.test.ts tests/tools/fetchFamousImages.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/famous/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move famous-galaxy scripts into tools/famous/

git mv buildFamous, expandFamousFromCatalogs, fetchFamousImages,
famousImageProcessor.  Updates relative parsers/utils/src imports and
test paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.3 — Move into `tools/filaments/`

Moves: `buildFilaments.ts`.

- [ ] Move:

```bash
git mv tools/buildFilaments.ts tools/filaments/buildFilaments.ts
```

- [ ] Fix imports in `tools/filaments/buildFilaments.ts`:
  - `./parsers/<x>` → `../parsers/<x>`
  - `./utils/<x>` → `../utils/<x>`
  - `../src/<x>` → `../../src/<x>`

- [ ] Update the test import:

```bash
grep -rln "tools/buildFilaments" /Users/rulkens/Development/js/skymap/tests/
```

Change `from '../../tools/buildFilaments'` → `from '../../tools/filaments/buildFilaments'`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the test:

```bash
npm test -- tests/tools/buildFilaments.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/filaments/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move buildFilaments into tools/filaments/

git mv; rewrites parsers/utils/src relative imports for the deeper
nesting; updates the parseArgs test import path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.4 — Move into `tools/volumes/`

Moves: `buildMcpmVolume.ts`, `buildCf4Density.ts`, `buildScalarVolumeFixture.ts`, `auditCf4Anchors.ts`, `verifyCf4Scfd.ts`, `extractMcpmCube.py`.

- [ ] Move the six files:

```bash
git mv tools/buildMcpmVolume.ts tools/volumes/buildMcpmVolume.ts
git mv tools/buildCf4Density.ts tools/volumes/buildCf4Density.ts
git mv tools/buildScalarVolumeFixture.ts tools/volumes/buildScalarVolumeFixture.ts
git mv tools/auditCf4Anchors.ts tools/volumes/auditCf4Anchors.ts
git mv tools/verifyCf4Scfd.ts tools/volumes/verifyCf4Scfd.ts
git mv tools/extractMcpmCube.py tools/volumes/extractMcpmCube.py
```

- [ ] In each moved `.ts` file, update relative imports:
  - `./parsers/<x>` → `../parsers/<x>`
  - `./utils/<x>` → `../utils/<x>`
  - `../src/<x>` → `../../src/<x>`

- [ ] Update test imports:

```bash
grep -rln "tools/buildMcpmVolume\|tools/buildCf4Density\|tools/buildScalarVolumeFixture\|tools/auditCf4Anchors\|tools/verifyCf4Scfd" /Users/rulkens/Development/js/skymap/tests/
```

For each match, update to `tools/volumes/<name>`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run affected tests:

```bash
npm test -- tests/tools/buildCf4Density.smoke.test.ts tests/tools/buildMcpmVolume.smoke.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/volumes/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move volume builders + diagnostics into tools/volumes/

git mv buildMcpmVolume, buildCf4Density, buildScalarVolumeFixture,
auditCf4Anchors, verifyCf4Scfd, and extractMcpmCube.py into one
folder.  Rewrites relative imports for the deeper nesting; updates
test paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.5 — Move into `tools/fonts/`

Moves: `buildFontAtlas.ts`.

- [ ] Move:

```bash
git mv tools/buildFontAtlas.ts tools/fonts/buildFontAtlas.ts
```

- [ ] Fix imports in the moved file: `./parsers/` → `../parsers/`, `../src/` → `../../src/`, `./utils/` → `../utils/` (only if any are present).

- [ ] Update test imports:

```bash
grep -rln "tools/buildFontAtlas" /Users/rulkens/Development/js/skymap/tests/
```

Update to `tools/fonts/buildFontAtlas`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the test:

```bash
npm test -- tests/tools/buildFontAtlas.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/fonts/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move buildFontAtlas into tools/fonts/

git mv; relative-import rewrites for the deeper path; test import
update.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.6 — Move into `tools/site/`

Moves: `makeFavicon.ts`, `makeOgImage.ts`.

- [ ] Move:

```bash
git mv tools/makeFavicon.ts tools/site/makeFavicon.ts
git mv tools/makeOgImage.ts tools/site/makeOgImage.ts
```

- [ ] Fix imports in each moved file (`./parsers/` → `../parsers/`, `../src/` → `../../src/`).

- [ ] Confirm no tests reference these (favicon/og image scripts have no test coverage today):

```bash
grep -rln "tools/makeFavicon\|tools/makeOgImage" /Users/rulkens/Development/js/skymap/tests/
```

Expected: empty output. If anything appears, update those import paths too.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/site/
git commit -m "$(cat <<'EOF'
refactor(tools): move favicon + og-image scripts into tools/site/

git mv makeFavicon and makeOgImage; relative-import rewrites for the
deeper path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.7 — Move into `tools/deploy/`

Moves: `syncR2.ts`, `r2Cors.json`, `r2-static/`.

- [ ] Move the files and the static folder:

```bash
git mv tools/syncR2.ts tools/deploy/syncR2.ts
git mv tools/r2Cors.json tools/deploy/r2Cors.json
git mv tools/r2-static tools/deploy/r2-static
```

- [ ] Fix imports in `tools/deploy/syncR2.ts`: `./parsers/` → `../parsers/`, `../src/` → `../../src/`, `./utils/` → `../utils/` (any that exist).

- [ ] If `syncR2.ts` references `r2-static/` or `r2Cors.json` by relative path, those paths stay the same (still siblings).

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Commit:

```bash
git add tools/deploy/
git commit -m "$(cat <<'EOF'
refactor(tools): co-locate R2 deploy plumbing in tools/deploy/

git mv syncR2.ts, r2Cors.json, and r2-static/ into one folder.  Path
fixes to runtime config (r2-cors npm script + sync-r2 npm script)
land in the Phase 6 package.json update.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 4.8 — Move into `tools/fetch/`

Moves: `fetch2massXsc.ts`, `fetchHyperLeda.ts`, `buildPgcAliases.ts`.

- [ ] Move:

```bash
git mv tools/fetch2massXsc.ts tools/fetch/fetch2massXsc.ts
git mv tools/fetchHyperLeda.ts tools/fetch/fetchHyperLeda.ts
git mv tools/buildPgcAliases.ts tools/fetch/buildPgcAliases.ts
```

- [ ] Fix imports in each moved file (`./parsers/` → `../parsers/`, `./utils/` → `../utils/`, `../src/` → `../../src/`).

- [ ] Update test imports:

```bash
grep -rln "tools/buildPgcAliases\|tools/fetch2massXsc\|tools/fetchHyperLeda" /Users/rulkens/Development/js/skymap/tests/
```

For each match, update to `tools/fetch/<name>`.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the buildPgcAliases test:

```bash
npm test -- tests/tools/buildPgcAliases.test.ts
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add tools/fetch/ tests/tools/
git commit -m "$(cat <<'EOF'
refactor(tools): move fetch-side scripts into tools/fetch/

git mv fetch2massXsc, fetchHyperLeda, and buildPgcAliases (which fits
the cluster — dominant work is PGC chunk download).  Relative-import
rewrites and test path updates included.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Rename `tools/types/` → `tools/vendor-types/`

### Task 5.1 — Rename and verify no consumer references hard-code the old path

- [ ] First, grep for any explicit references to the `tools/types` path. `tsconfig.tools.json` already includes `"tools"` recursively so it should not need a change, but verify:

```bash
grep -rn "tools/types" /Users/rulkens/Development/js/skymap/ \
  --include='*.ts' --include='*.json' --include='*.md' 2>/dev/null \
  | grep -v "node_modules\|.claude/worktrees\|completed"
```

Expected: empty output (the two `.d.ts` files are ambient and picked up by file-system inclusion, not by named import). If anything matches, plan a fix-up before the rename.

- [ ] Rename:

```bash
git mv tools/types tools/vendor-types
```

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0. The `.d.ts` files declare ambient module shims for `msdf-bmfont-xml` and `pngjs`; TypeScript picks them up by their `declare module` syntax regardless of folder name, so the rename is transparent to consumers.

- [ ] Commit:

```bash
git add tools/vendor-types/
git commit -m "$(cat <<'EOF'
refactor(tools): rename tools/types → tools/vendor-types

Disambiguates from src/@types (the canonical type registry).  The
folder only contains ambient .d.ts shims for msdf-bmfont-xml and
pngjs; TypeScript picks them up by declare-module syntax so no
consumer changes are needed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Update `package.json` script paths + smoke verification

### Task 6.1 — Rewrite every `tsx tools/<file>.ts` to its new subfolder path

The mapping (against the current 13 tools-invoking scripts):

| Current | New |
|---|---|
| `tsx tools/buildAllBins.ts` | `tsx tools/catalog/buildAllBins.ts` |
| `tsx tools/buildCf4Density.ts` | `tsx tools/volumes/buildCf4Density.ts` |
| `tsx tools/buildMcpmVolume.ts --all` | `tsx tools/volumes/buildMcpmVolume.ts --all` |
| `tsx tools/buildFamous.ts` | `tsx tools/famous/buildFamous.ts` |
| `tsx tools/buildPgcAliases.ts` | `tsx tools/fetch/buildPgcAliases.ts` |
| `tsx tools/buildFilaments.ts` | `tsx tools/filaments/buildFilaments.ts` |
| `tsx tools/buildFilaments.ts --sources sdss --output ...` | `tsx tools/filaments/buildFilaments.ts --sources sdss --output ...` |
| `tsx tools/buildFilaments.ts --cut 7 --output ...` | `tsx tools/filaments/buildFilaments.ts --cut 7 --output ...` |
| `tsx tools/buildFontAtlas.ts` | `tsx tools/fonts/buildFontAtlas.ts` |
| `tsx tools/expandFamousFromCatalogs.ts` | `tsx tools/famous/expandFamousFromCatalogs.ts` |
| `tsx tools/fetch2massXsc.ts` | `tsx tools/fetch/fetch2massXsc.ts` |
| `tsx tools/fetchFamousImages.ts` | `tsx tools/famous/fetchFamousImages.ts` |
| `tsx tools/fetchHyperLeda.ts` | `tsx tools/fetch/fetchHyperLeda.ts` |
| `tsx tools/syncR2.ts` | `tsx tools/deploy/syncR2.ts` |
| `npx wrangler r2 bucket cors set skymap-data --file tools/r2Cors.json` | `npx wrangler r2 bucket cors set skymap-data --file tools/deploy/r2Cors.json` |

(Note: `tsx tools/buildAllBins.ts` appears twice — for both `build-all` and `build-tiers`. Update both.)

- [ ] Open `/Users/rulkens/Development/js/skymap/package.json` and apply every row in the table above.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Smoke-run one no-network script per cluster to confirm path resolution. The cheapest, least-side-effect-prone are the catalog rebuild (fast, deterministic, no network) and the font atlas build (~3 s, no network). Skip any script that hits the network or modifies R2 unless the user explicitly OKs it.

```bash
npm run build-tiers
```

Expected: prints per-source progress, writes `public/data/sdss-*.bin`, `public/data/glade-*.bin`, `public/data/2mrs.bin`. Exits 0.

```bash
npm run build-fonts
```

Expected: writes `public/fonts/*.png` and `*.json` for the configured fonts. Exits 0. (If fonts aren't installed locally, this may error — that is unrelated to the reorg; record it and move on.)

- [ ] For `sync-r2`, check whether the script supports a dry-run flag. If yes, run `npm run sync-r2 -- --dry-run` and expect output listing the files that *would* be uploaded. If the script does not support `--dry-run`, do NOT invoke it (it would actually push to R2); instead verify only that `tsx tools/deploy/syncR2.ts --help` (or equivalent no-op) starts without a module-resolution error:

```bash
node --check tools/deploy/syncR2.ts 2>&1 || true
```

(node --check is permissive about TS — the goal is just to confirm the file is on disk at the expected path.)

- [ ] Commit:

```bash
git add package.json
git commit -m "$(cat <<'EOF'
build: update package.json scripts to new tools/ subfolder paths

Repoints every tsx tools/<file>.ts invocation (13 scripts) to its
catalog/famous/filaments/volumes/fonts/site/deploy/fetch home, and
fixes the wrangler r2 cors path to tools/deploy/r2Cors.json.
Verified by typecheck + build-tiers smoke run.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Update CLAUDE.md "Where to look" tree

### Task 7.1 — Reflect the new layout

- [ ] Open `/Users/rulkens/Development/js/skymap/CLAUDE.md` and locate the `## Where to look` section (around line 10). The current `tools/` block is:

```
tools/
  buildAllBins.ts     Pipeline: parse raw catalogs → cross-match → write .bin files
  parsers/            SDSS CSV, 2MRS fixed-width, GLADE fixed-width parsers
  crossMatch.ts       Dedup logic across surveys
```

Replace it with:

```
tools/
  catalog/            buildAllBins (the pipeline entry point), crossMatch dedup,
                      subsampleByAbsMag
  famous/             famous-galaxy seed expansion + image fetcher cluster
                      (buildFamous, expandFamousFromCatalogs, fetchFamousImages,
                      famousImageProcessor)
  filaments/          buildFilaments — DisPerSE wrapper
  volumes/            scalar-field volume builders (CF-4, MCPM) + diagnostics
                      (auditCf4Anchors, verifyCf4Scfd, buildScalarVolumeFixture,
                      extractMcpmCube.py)
  fonts/              buildFontAtlas — MSDF multi-font atlas generator
  site/               makeFavicon, makeOgImage
  deploy/             syncR2 + r2Cors.json + r2-static/ static assets
  fetch/              fetch2massXsc, fetchHyperLeda, buildPgcAliases — long-running
                      external-catalog fetchers with on-disk resume caches
  parsers/            SDSS CSV, 2MRS fixed-width, GLADE fixed-width, NPY,
                      ND-skeleton parsers
  utils/              tools-only helpers (math, io, cli, async, random) — see
                      tools/utils/README is intentionally absent; one file per
                      function, deep imports
  vendor-types/       ambient .d.ts shims for msdf-bmfont-xml and pngjs
```

- [ ] Run a quick visual sanity check that the surrounding sections still make sense (the "Data pipeline" mental-model diagram references `tools/buildAllBins.ts` — update its path to `tools/catalog/buildAllBins.ts`).

```bash
grep -n "tools/" /Users/rulkens/Development/js/skymap/CLAUDE.md
```

Expected output: every match either reflects the new path or is documentation of `tools/raw/` (data, not scripts). Update any stale `tools/<flat>` references — common ones: the data-pipeline section, the deploy section ("`syncR2.ts`" → "`tools/deploy/syncR2.ts`"), and the build-pipeline mental-model.

- [ ] Commit:

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md to reflect new tools/ by-domain layout

Updates the "Where to look" tree and any inline tools/<file> path
references in the data-pipeline + deploy sections.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8 — Final verification

### Task 8.1 — Whole-suite green-check + script smoke

- [ ] Run the full typecheck (both tsconfigs):

```bash
npm run typecheck
```

Expected: exits with code 0.

- [ ] Run the full test suite:

```bash
npm test
```

Expected: all tests pass. The total count should be roughly the previous baseline (590+ tests) plus the 8 new utils tests added in Phase 1, minus the 4 tests removed when we deleted `tests/tools/parsers/floatToHalf.test.ts` (Task 3.9). Net delta is roughly +30 tests.

- [ ] Run the catalog smoke again (already exercised in Phase 6, but re-confirms the chain end-to-end after CLAUDE.md updates):

```bash
npm run build-tiers
```

Expected: exits 0; `public/data/*.bin` regenerated.

- [ ] Run `git log --oneline` and confirm one commit per task — no squashes, no amends. Roughly 28 commits total (9 utils + 1 dead-code + 9 import migrations + 8 folder moves + 1 vendor-types + 1 package.json + 1 CLAUDE.md + this verification has no commit of its own).

```bash
git log --oneline -40
```

- [ ] Confirm the unrelated ~199 worktree modifications are still untracked / unstaged (we never staged them):

```bash
git status
```

Expected: the pre-existing modifications still appear under "Changes not staged for commit" or "Untracked files"; nothing this plan introduced should remain unstaged.

- [ ] No commit for this task — verification only. If everything is green, the worktree is ready for `gh pr create` (per the user's "branch + PR, never direct-push to main" convention).

---

## Self-review checklist (verify before marking the plan done)

- [ ] Every row of the spec's "Helper extraction map" table maps to a Phase 1 task (add helper) + Phase 3 task (consume helper).
- [ ] Every entry in the spec's "Target layout" appears in a Phase 4 task.
- [ ] `tools/csvToBin.ts` and its npm script entry are deleted (Phase 2).
- [ ] `tools/parsers/floatToHalf.ts` is moved to `tools/utils/math/floatHalf.ts` and its test is replaced by the new test file (Tasks 1.3 + 3.8 + 3.9).
- [ ] `tools/types/` is renamed to `tools/vendor-types/` (Phase 5).
- [ ] All 13 package.json `tsx tools/<file>.ts` invocations and the `wrangler --file tools/r2Cors.json` invocation are repathed (Phase 6).
- [ ] CLAUDE.md's "Where to look" tree is updated (Phase 7).
- [ ] Every task ends with a `git add <specific-files>` (never `git add -A`/`.`) and a HEREDOC commit with the `Co-Authored-By` trailer.
- [ ] No task uses `--no-verify`, `--amend`, `--author=`, or any destructive git flag.
