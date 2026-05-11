# Column-Major Matrices + Vec/Mat Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every matrix in the codebase column-major and introduce `Vec2`/`Vec3`/`Vec4`/`Mat3`/`Mat4` types in `src/@types/` so every linear-algebra value uses the same conventions.

**Architecture:** Two new type files under `src/@types/` define flat tuple aliases — `Mat3` is a 9-tuple, `Mat4` is a 16-tuple, both column-major by convention (documented in JSDoc; not branded). The lone row-major export in the codebase (`SG_TO_EQ_MATRIX` as a nested 3×3 in `src/data/superGalacticTransform.ts`) flips to a flat column-major `Mat3`; every helper in that file (`buildSgToGal`, `buildGalToEq`, `multiply3x3`, `reorthonormalise`, `matrixToQuaternion`, `sgCartesianToEquatorial`) rewrites against the new layout. WGSL shaders and gl-matrix call sites are already column-major and need no changes. Inline `readonly [number, number, number]` tuples across `src/@types/`, `src/data/`, and `src/services/` get swapped for the new `Vec3`/`Vec4` aliases — pure rename, no logic change.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, gl-matrix (already column-major), WebGPU/WGSL (already column-major).

---

## File Structure

### New files

- `src/@types/Vec.d.ts` — `Vec2`, `Vec3`, `Vec4` flat number tuples.
- `src/@types/Mat.d.ts` — `Mat3` (9-tuple), `Mat4` (16-tuple), both column-major.

### Modified files

- `src/@types/index.d.ts` — add barrel exports for the two new files.
- `src/@types/OrbitCameraInit.d.ts` — `target: Vec3`.
- `src/@types/ScalarCube.d.ts` — `dims: Vec3`, `origin: Vec3`, `rotation: Vec4`.
- `src/data/galacticCenter.ts` — `MILKY_WAY_CENTER_WORLD: Vec3`.
- `src/data/clusterAnchors.ts` — `raDecDistToEqCart(...): Vec3`.
- `src/data/superGalacticTransform.ts` — full internal rewrite to column-major `Mat3`; `sgCartesianToEquatorial` input/output → `Vec3`; `SG_TO_EQ_QUATERNION` → `Vec4`; `SG_TO_EQ_MAT4_COL_MAJOR` → `Mat4`. Delete local `Row3` and local nested `Mat3` typedefs.
- `src/services/gpu/renderers/milkyWayRenderer.ts` — `centerWorld?: Vec3`.
- `src/services/camera/orbitCamera.ts` — `tgt` cast → `Vec3`.
- `src/services/engine/subsystems/poiSubsystem.ts` — `worldPos: Vec3`, `labelColor: Vec4`, `lineColor: Vec4`.
- `src/services/engine/subsystems/youAreHereSubsystem.ts` — `LABEL_COLOR: Vec4`, `LINE_COLOR: Vec4`.
- `tools/auditCf4Anchors.ts` — flat-Mat3 indexing, drop local nested-matrix typedef.
- `tools/verifyCf4Scfd.ts` — flat-Mat3 indexing for its `transpose3`, `eqToSg`, `sgToEq` helpers (uses the same row-major nested access pattern as the audit script).
- `tests/data/superGalacticTransform.test.ts` — rewrite shape assertions for flat 9-tuple Mat3; rewrite orthonormality to operate on columns; update mat4-vs-mat3 cross-check.

### Untouched

- WGSL files (already `mat4x4<f32>` column-major).
- gl-matrix call sites in `pointRenderer.ts`, `scalarVolumeRenderer.ts`, etc. (already column-major).
- Uniform-buffer writers (already column-major byte order).

---

### Task 1: Add Vec types in @types

**Files:**
- Create: `src/@types/Vec.d.ts`
- Modify: `src/@types/index.d.ts`
- Test: `tests/types/vecMat.test-d.ts` (new — type-only smoke test)

- [ ] **Step 1: Write the failing type-only test**

Create `tests/types/vecMat.test-d.ts`:

```ts
/**
 * Type-only smoke test for the Vec/Mat tuple aliases.  Vitest runs this
 * file like any other test — but the `expectTypeOf` calls are checked
 * by the TS compiler, not at runtime.  A wrong tuple length here is a
 * typecheck failure, not a runtime failure.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Vec2, Vec3, Vec4 } from '../../src/@types/Vec';

describe('Vec tuple aliases', () => {
  it('Vec2 is a 2-element tuple of number', () => {
    expectTypeOf<Vec2>().toEqualTypeOf<readonly [number, number]>();
  });
  it('Vec3 is a 3-element tuple of number', () => {
    expectTypeOf<Vec3>().toEqualTypeOf<readonly [number, number, number]>();
  });
  it('Vec4 is a 4-element tuple of number', () => {
    expectTypeOf<Vec4>().toEqualTypeOf<readonly [number, number, number, number]>();
  });
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `npm run typecheck`
Expected: FAIL with "Cannot find module '../../src/@types/Vec'".

- [ ] **Step 3: Create the Vec types**

Write `src/@types/Vec.d.ts`:

```ts
/**
 * Vec2/Vec3/Vec4 — flat, readonly, number-tuple aliases for the small
 * vectors that show up everywhere in renderer code (positions, colors,
 * sizes, screen coords).  Defined as `readonly` tuples so callers
 * cannot mutate a value they don't own; pass a mutable array if you
 * really need to write back.
 *
 * These are the only vector tuple types in the project.  Prefer them
 * over inline `readonly [number, number, ...]` so every site speaks
 * the same language and a search for `Vec3` finds them all.
 */

/** Two-element vector, e.g. screen-space size or 2D coord. */
export type Vec2 = readonly [number, number];

/** Three-element vector, e.g. world position, RGB color, axis. */
export type Vec3 = readonly [number, number, number];

/** Four-element vector, e.g. RGBA color, quaternion (x, y, z, w). */
export type Vec4 = readonly [number, number, number, number];
```

- [ ] **Step 4: Add to barrel**

Edit `src/@types/index.d.ts` — append after the last existing line:

```ts
export type * from './Vec';
```

- [ ] **Step 5: Run typecheck and tests**

Run: `npm run typecheck && npm test -- tests/types/vecMat.test-d.ts`
Expected: PASS (typecheck green, vitest reports the file).

- [ ] **Step 6: Commit**

```bash
git add src/@types/Vec.d.ts src/@types/index.d.ts tests/types/vecMat.test-d.ts
git commit -m "feat(types): add Vec2/Vec3/Vec4 tuple aliases in @types"
```

---

### Task 2: Migrate inline Vec tuples across the codebase

**Files:**
- Modify: `src/@types/OrbitCameraInit.d.ts` (line 15)
- Modify: `src/@types/ScalarCube.d.ts` (lines 35, 41, 45 — note: line 45 becomes `Vec4`)
- Modify: `src/data/galacticCenter.ts` (line 55)
- Modify: `src/data/clusterAnchors.ts` (line 60 — function return)
- Modify: `src/services/gpu/renderers/milkyWayRenderer.ts` (lines 158, 277)
- Modify: `src/services/camera/orbitCamera.ts` (line 232)
- Modify: `src/services/engine/subsystems/poiSubsystem.ts` (lines 46, 58, 59)
- Modify: `src/services/engine/subsystems/youAreHereSubsystem.ts` (lines 36, 37)

The full test suite is the test for this task — any incorrect substitution fails typecheck.

- [ ] **Step 1: Run baseline to confirm green**

Run: `npm run typecheck && npm test`
Expected: PASS (1115+ tests pass, 0 type errors).

- [ ] **Step 2: Substitute in `src/@types/OrbitCameraInit.d.ts`**

At the top of the file, add the import:

```ts
import type { Vec3 } from './Vec';
```

Replace line 15:

```ts
  target: [number, number, number];
```

With:

```ts
  target: Vec3;
```

Note: `Vec3` is `readonly`; the existing field was mutable. Make sure consumers don't write to `target` after construction. (Survey: `grep -rn "\.target\[" src/` — if any reassignment exists, switch the field to a mutable triple type instead; do not silently allow a write-through-readonly error.)

- [ ] **Step 3: Substitute in `src/@types/ScalarCube.d.ts`**

At the top of the file, add:

```ts
import type { Vec3, Vec4 } from './Vec';
```

Replace lines 35, 41, 45 — change each `readonly [number, number, number]` → `Vec3` and the rotation tuple `readonly [number, number, number, number]` → `Vec4`.

- [ ] **Step 4: Substitute in `src/data/galacticCenter.ts`**

Add import at top:

```ts
import type { Vec3 } from '../@types/Vec';
```

Replace `readonly [number, number, number]` on line 55 with `Vec3`.

- [ ] **Step 5: Substitute in `src/data/clusterAnchors.ts`**

Add import:

```ts
import type { Vec3 } from '../@types/Vec';
```

Replace the return type on line 60: `): readonly [number, number, number]` → `): Vec3`.

- [ ] **Step 6: Substitute in `src/services/gpu/renderers/milkyWayRenderer.ts`**

Add import:

```ts
import type { Vec3 } from '../../../@types/Vec';
```

Replace `centerWorld?: readonly [number, number, number]` on lines 158 and 277 with `centerWorld?: Vec3`.

- [ ] **Step 7: Substitute in `src/services/camera/orbitCamera.ts`**

Add import:

```ts
import type { Vec3 } from '../../@types/Vec';
```

Replace the type cast on line 232 (`as readonly [number, number, number]`) with `as Vec3`.

- [ ] **Step 8: Substitute in `src/services/engine/subsystems/poiSubsystem.ts`**

Add import:

```ts
import type { Vec3, Vec4 } from '../../../@types/Vec';
```

Replace:
- line 46: `readonly worldPos: readonly [number, number, number];` → `readonly worldPos: Vec3;`
- lines 58, 59: `readonly labelColor: readonly [number, number, number, number];` → `readonly labelColor: Vec4;` and same for `lineColor`.

- [ ] **Step 9: Substitute in `src/services/engine/subsystems/youAreHereSubsystem.ts`**

Add import:

```ts
import type { Vec4 } from '../../../@types/Vec';
```

Replace `LABEL_COLOR` and `LINE_COLOR` annotations on lines 36, 37:

```ts
const LABEL_COLOR: Vec4 = [1, 1, 1, 1];
const LINE_COLOR: Vec4 = [0.85, 0.85, 0.85, 1];
```

- [ ] **Step 10: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS (all 1115+ tests; zero type errors).

- [ ] **Step 11: Confirm no remaining inline 3/4-tuples in src/**

Run: `grep -rEn "readonly \[number,\s*number,\s*number(,\s*number)?\]" src/ --include="*.ts"`
Expected: empty output (every site now uses `Vec3` / `Vec4`).

If output is non-empty, the lines printed are the ones the survey missed. Update each to the matching `VecN` alias and re-run typecheck.

- [ ] **Step 12: Commit**

```bash
git add src/
git commit -m "refactor(types): use Vec3/Vec4 aliases for all inline number tuples"
```

---

### Task 3: Add Mat types in @types

**Files:**
- Create: `src/@types/Mat.d.ts`
- Modify: `src/@types/index.d.ts`
- Modify: `tests/types/vecMat.test-d.ts` (extend with Mat checks)

- [ ] **Step 1: Extend the type-only test for Mat**

Append to `tests/types/vecMat.test-d.ts`:

```ts
import type { Mat3, Mat4 } from '../../src/@types/Mat';

describe('Mat tuple aliases', () => {
  it('Mat3 is a 9-element tuple of number', () => {
    expectTypeOf<Mat3>().toEqualTypeOf<
      readonly [
        number, number, number,
        number, number, number,
        number, number, number,
      ]
    >();
  });
  it('Mat4 is a 16-element tuple of number', () => {
    expectTypeOf<Mat4>().toEqualTypeOf<
      readonly [
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
      ]
    >();
  });
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `npm run typecheck`
Expected: FAIL with "Cannot find module '../../src/@types/Mat'".

- [ ] **Step 3: Create the Mat types**

Write `src/@types/Mat.d.ts`:

```ts
/**
 * Mat3/Mat4 — flat, readonly, number-tuple aliases for the only two
 * matrix shapes this project uses: 3×3 rotations and 4×4 model/view
 * matrices.  Both are **column-major** by convention, matching:
 *
 *   - gl-matrix (every `mat3.*` / `mat4.*` operation reads / writes
 *     column-major);
 *   - WebGPU / WGSL (the spec stores `mat3x3<f32>` and `mat4x4<f32>`
 *     as columns of `vec3<f32>` / `vec4<f32>`);
 *   - GLSL (the historical convention from which both the above derive).
 *
 * ### Column-major index map
 *
 *   Mat3 cell at row r, column c:  m[c*3 + r]
 *   Mat4 cell at row r, column c:  m[c*4 + r]
 *
 * For a Mat4 with translation in the right-most column:
 *
 *   m[ 0]  m[ 4]  m[ 8]  m[12]      r0c0  r0c1  r0c2   tx
 *   m[ 1]  m[ 5]  m[ 9]  m[13]      r1c0  r1c1  r1c2   ty
 *   m[ 2]  m[ 6]  m[10]  m[14]      r2c0  r2c1  r2c2   tz
 *   m[ 3]  m[ 7]  m[11]  m[15]       0     0     0      1
 *
 * ### Why not branded types?
 *
 * Branding (`Mat4 = readonly [...] & { __order: 'column' }`) would force
 * every gl-matrix interop call to cast.  We pay attention to which
 * matrices end up here instead — the convention is enforced by code
 * review and the SG_TO_EQ_MAT4_COL_MAJOR anti-drift tests, not the
 * compiler.
 */

/** 3×3 matrix, column-major (9 elements). */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** 4×4 matrix, column-major (16 elements). */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];
```

- [ ] **Step 4: Add to barrel**

Edit `src/@types/index.d.ts` — append after the `Vec` line:

```ts
export type * from './Mat';
```

- [ ] **Step 5: Run typecheck and tests**

Run: `npm run typecheck && npm test -- tests/types/vecMat.test-d.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/@types/Mat.d.ts src/@types/index.d.ts tests/types/vecMat.test-d.ts
git commit -m "feat(types): add Mat3/Mat4 column-major tuple aliases"
```

---

### Task 4: Convert SG_TO_EQ_MATRIX and its helpers to column-major Mat3

This is the meat of the refactor. The current `SG_TO_EQ_MATRIX` is a nested `[Row3, Row3, Row3]` stored row-major. After this task it is a flat 9-element column-major `Mat3` from `@types`. Every internal helper (`buildSgToGal`, `buildGalToEq`, `multiply3x3`, `reorthonormalise`, `matrixToQuaternion`) and the public `sgCartesianToEquatorial` must change accordingly. `SG_TO_EQ_MAT4_COL_MAJOR` is already column-major flat; it just needs its source-of-truth indexing updated to the new layout, and its type narrowed to `Mat4`.

**Index translation table:**

| Old row-major access | New column-major flat access |
|---|---|
| `m[0][0]` | `m[0]` |
| `m[1][0]` | `m[1]` |
| `m[2][0]` | `m[2]` |
| `m[0][1]` | `m[3]` |
| `m[1][1]` | `m[4]` |
| `m[2][1]` | `m[5]` |
| `m[0][2]` | `m[6]` |
| `m[1][2]` | `m[7]` |
| `m[2][2]` | `m[8]` |

General rule: `m[r][c]` (old) → `m[c * 3 + r]` (new).

**Files:**
- Modify: `src/data/superGalacticTransform.ts` (full internal rewrite, exports preserve names)
- Modify: `tests/data/superGalacticTransform.test.ts` (shape assertions update; mat4 cross-check uses new flat index)

- [ ] **Step 1: Rewrite the existing test file for the new layout**

Replace `tests/data/superGalacticTransform.test.ts` entirely with:

```ts
/**
 * Anchored unit tests for the supergalactic → equatorial Cartesian
 * rotation. Validates against published positions of nearby clusters
 * (Virgo, Coma) plus geometric invariants (quaternion unit-norm,
 * matrix orthonormal). Tolerance is ~1° on RA/Dec — enough to confirm
 * the convention is right; precision below that is dominated by the
 * cluster-position uncertainties themselves.
 *
 * `SG_TO_EQ_MATRIX` is a flat **column-major** 9-tuple (`Mat3` from
 * `@types`).  Element at row r, column c is `m[c * 3 + r]`.
 */
import { describe, expect, it } from 'vitest';
import {
  SG_TO_EQ_MATRIX,
  SG_TO_EQ_MAT4_COL_MAJOR,
  SG_TO_EQ_QUATERNION,
  sgCartesianToEquatorial,
} from '../../src/data/superGalacticTransform';

const RAD = Math.PI / 180;

/** Convert an equatorial Cartesian (Mpc) to (RA degrees, Dec degrees, distance Mpc). */
function eqCartesianToRaDecDist(eq: readonly [number, number, number]): {
  ra: number;
  dec: number;
  dist: number;
} {
  const [x, y, z] = eq;
  const dist = Math.hypot(x, y, z);
  const ra = ((Math.atan2(y, x) / RAD) + 360) % 360;
  const dec = Math.asin(z / dist) / RAD;
  return { ra, dec, dist };
}

/** Read column c of a column-major flat 9-tuple. */
function col(m: typeof SG_TO_EQ_MATRIX, c: 0 | 1 | 2): readonly [number, number, number] {
  return [m[c * 3 + 0]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
}

describe('superGalacticTransform', () => {
  it('exports a flat 9-element column-major Mat3 and a 4-element quaternion', () => {
    expect(SG_TO_EQ_MATRIX).toHaveLength(9);
    expect(SG_TO_EQ_QUATERNION).toHaveLength(4);
  });

  it('quaternion is unit-norm', () => {
    const [x, y, z, w] = SG_TO_EQ_QUATERNION;
    const norm = Math.hypot(x, y, z, w);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('matrix is orthonormal (columns have unit length, dot products are zero)', () => {
    const c0 = col(SG_TO_EQ_MATRIX, 0);
    const c1 = col(SG_TO_EQ_MATRIX, 1);
    const c2 = col(SG_TO_EQ_MATRIX, 2);
    expect(Math.hypot(...c0)).toBeCloseTo(1, 6);
    expect(Math.hypot(...c1)).toBeCloseTo(1, 6);
    expect(Math.hypot(...c2)).toBeCloseTo(1, 6);
    const dot = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(c0, c1)).toBeCloseTo(0, 6);
    expect(dot(c0, c2)).toBeCloseTo(0, 6);
    expect(dot(c1, c2)).toBeCloseTo(0, 6);
  });

  it('maps origin to origin', () => {
    expect(sgCartesianToEquatorial([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('maps Virgo (SGX≈-2.5, SGY≈+10.0, SGZ≈-1.0 Mpc/h) to RA≈187°, Dec≈+12°, dist≈10 Mpc/h', () => {
    const eq = sgCartesianToEquatorial([-2.5, 10.0, -1.0]);
    const { ra, dec, dist } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(184);
    expect(ra).toBeLessThan(190);
    expect(dec).toBeGreaterThan(9);
    expect(dec).toBeLessThan(15);
    expect(dist).toBeCloseTo(Math.hypot(-2.5, 10.0, -1.0), 5);
  });

  it('maps Coma (SGX≈+0.6, SGY≈+71.5, SGZ≈+12 Mpc/h) to RA≈195°, Dec≈+27°', () => {
    const eq = sgCartesianToEquatorial([0.6, 71.5, 12]);
    const { ra, dec } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(192);
    expect(ra).toBeLessThan(198);
    expect(dec).toBeGreaterThan(24);
    expect(dec).toBeLessThan(30);
  });

  describe('SG_TO_EQ_MAT4_COL_MAJOR', () => {
    // Anti-drift anchor: any consumer that reads the mat4 form must get
    // the same rotation as `sgCartesianToEquatorial`, `raDecDistToEqCart`,
    // and `SG_TO_EQ_QUATERNION`.  An earlier draft of scalarVolumeRenderer
    // kept a private hardcoded mat4 with values that diverged ~1.9 in
    // some elements — cluster labels and cube voxels rendered under
    // different rotations.  These tests catch that on any single change
    // to either side.

    it('is a 16-element column-major layout', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR).toHaveLength(16);
    });

    it('upper-left 3x3 (column-major) equals SG_TO_EQ_MATRIX', () => {
      // Mat4 index c*4 + r equals Mat3 index c*3 + r for the rotation block.
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          expect(SG_TO_EQ_MAT4_COL_MAJOR[c * 4 + r]).toBeCloseTo(
            SG_TO_EQ_MATRIX[c * 3 + r]!,
            10,
          );
        }
      }
    });

    it('translation column is zero, w corner is 1', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR[12]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[13]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[14]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[15]).toBe(1);
    });

    it('homogeneous w-row of upper 3 columns is zero', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR[3]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[7]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[11]).toBe(0);
    });

    it('applied as a column-major mat4, rotates Coma SG to expected EQ', () => {
      const sg: readonly [number, number, number] = [0, 93.8, 7.8];
      const eq: [number, number, number] = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        eq[r] =
          SG_TO_EQ_MAT4_COL_MAJOR[0 * 4 + r]! * sg[0] +
          SG_TO_EQ_MAT4_COL_MAJOR[1 * 4 + r]! * sg[1] +
          SG_TO_EQ_MAT4_COL_MAJOR[2 * 4 + r]! * sg[2];
      }
      const eq3x3 = sgCartesianToEquatorial(sg);
      for (let r = 0; r < 3; r++) {
        expect(eq[r]).toBeCloseTo(eq3x3[r]!, 6);
      }
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails against the current row-major implementation**

Run: `npm test -- tests/data/superGalacticTransform.test.ts`
Expected: FAIL — at minimum the "9 elements" length check fails because the current export is a nested array (length 3).

- [ ] **Step 3: Rewrite `src/data/superGalacticTransform.ts` against column-major Mat3**

Replace the entire body of `src/data/superGalacticTransform.ts` with:

```ts
/**
 * superGalacticTransform — pure rotation from supergalactic Cartesian
 * to equatorial Cartesian, both expressed in the same length unit
 * (rotations preserve length).
 *
 * The SG axis convention is Lahav 1991 / NED: SGX-axis points to
 * galactic (l, b) = (137.37°, 0°), SGZ-axis points to (l, b) = (47.37°, +6.32°).
 * We compose SG → galactic → equatorial via two well-known rotations:
 *
 *   1.  R_SG_to_GAL: rotate so SGX → (l=137.37°, b=0°), SGZ → galactic pole-ish.
 *       Standard form: a 3×3 with COLUMNS being the galactic-Cartesian unit
 *       vectors of SGX, SGY, SGZ.
 *
 *   2.  R_GAL_to_EQ: rotate galactic Cartesian → equatorial Cartesian.
 *       The galactic north pole is at equatorial (RA=192.8595°, Dec=+27.1283°);
 *       the galactic centre is at (RA=266.4051°, Dec=−28.9362°).
 *       Standard form: a 3×3 with COLUMNS being the equatorial-Cartesian
 *       unit vectors of (galactic X, Y, Z).
 *
 * Composition: R_SG_to_EQ = R_GAL_to_EQ · R_SG_to_GAL.
 *
 * ### Layout: column-major, flat 9-tuple Mat3 (from @types/Mat)
 *
 *   Cell at row r, column c is `m[c * 3 + r]`.  This matches the
 *   project-wide convention (column-major everywhere), gl-matrix, and
 *   WGSL.  The column-major form is also more natural for "build a
 *   rotation whose columns are the image axes": each axis is three
 *   contiguous elements rather than a stride-3 walk through nested
 *   rows.
 */

import type { Mat3, Mat4, Vec3, Vec4 } from '../@types';

const RAD = Math.PI / 180;

/** Galactic Cartesian unit vector for galactic coords (l, b). */
function galLBtoCart(lDeg: number, bDeg: number): Vec3 {
  const l = lDeg * RAD;
  const b = bDeg * RAD;
  return [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)];
}

/** Equatorial Cartesian unit vector for equatorial coords (RA, Dec). */
function eqRaDecToCart(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}

/** Euclidean length of a 3-vector. */
function len3(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/** Build a column-major Mat3 from three column vectors. */
function fromColumns(c0: Vec3, c1: Vec3, c2: Vec3): Mat3 {
  return [
    c0[0], c0[1], c0[2],
    c1[0], c1[1], c1[2],
    c2[0], c2[1], c2[2],
  ];
}

/**
 * R_SG_to_GAL: columns are the galactic-Cartesian unit vectors of SGX,
 * SGY, SGZ.  Because the matrix is column-major flat, each axis is a
 * contiguous 3-element span — no juggling required.
 *
 * SGX axis is at (l=137.37°, b=0°). SGZ axis is at (l=47.37°, b=+6.32°).
 * SGY = SGZ × SGX (right-handed), then renormalised against numerical drift.
 */
function buildSgToGal(): Mat3 {
  const sgx = galLBtoCart(137.37, 0);
  const sgz = galLBtoCart(47.37, 6.32);
  const sgyX = sgz[1] * sgx[2] - sgz[2] * sgx[1];
  const sgyY = sgz[2] * sgx[0] - sgz[0] * sgx[2];
  const sgyZ = sgz[0] * sgx[1] - sgz[1] * sgx[0];
  const norm = Math.sqrt(sgyX * sgyX + sgyY * sgyY + sgyZ * sgyZ);
  const sgy: Vec3 = [sgyX / norm, sgyY / norm, sgyZ / norm];
  return fromColumns(sgx, sgy, sgz);
}

/**
 * R_GAL_to_EQ: columns are the equatorial-Cartesian unit vectors of
 * galactic X, Y, Z.  Galactic X (l=0, b=0) → galactic centre at
 * (RA=266.4051°, Dec=−28.9362°).  Galactic Z (north pole) at
 * (RA=192.8595°, Dec=+27.1283°).  Galactic Y = galZ × galX.
 */
function buildGalToEq(): Mat3 {
  const gx = eqRaDecToCart(266.4051, -28.9362);
  const gz = eqRaDecToCart(192.8595, 27.1283);
  const gyX = gz[1] * gx[2] - gz[2] * gx[1];
  const gyY = gz[2] * gx[0] - gz[0] * gx[2];
  const gyZ = gz[0] * gx[1] - gz[1] * gx[0];
  const norm = Math.sqrt(gyX * gyX + gyY * gyY + gyZ * gyZ);
  const gy: Vec3 = [gyX / norm, gyY / norm, gyZ / norm];
  return fromColumns(gx, gy, gz);
}

/**
 * 3×3 column-major matrix multiplication: result = a · b.
 *
 *   result[c*3 + r] = Σ_k a[k*3 + r] · b[c*3 + k]
 */
function multiply3x3(a: Mat3, b: Mat3): Mat3 {
  const cell = (r: 0 | 1 | 2, c: 0 | 1 | 2): number =>
    a[0 * 3 + r]! * b[c * 3 + 0]! +
    a[1 * 3 + r]! * b[c * 3 + 1]! +
    a[2 * 3 + r]! * b[c * 3 + 2]!;
  return [
    cell(0, 0), cell(1, 0), cell(2, 0),
    cell(0, 1), cell(1, 1), cell(2, 1),
    cell(0, 2), cell(1, 2), cell(2, 2),
  ];
}

/**
 * Re-orthonormalise a column-major Mat3 using a single Gram-Schmidt pass
 * applied to its columns.  Two successive builds and one multiplication
 * each accumulate ~1e-16 FP error per element; without this pass the
 * column dot products can reach ~1.4e-6 — just outside the 5e-7 bound
 * the unit tests enforce.  One pass pulls it back below 1e-15.
 *
 * Columns are the natural Gram-Schmidt target here because each column
 * is contiguous in memory and represents one image axis of the rotation.
 */
function reorthonormalise(m: Mat3): Mat3 {
  // Column 0: normalise as-is.
  let c0x = m[0]!, c0y = m[1]!, c0z = m[2]!;
  const n0 = Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z);
  c0x /= n0; c0y /= n0; c0z /= n0;

  // Column 1: subtract projection onto column 0, then normalise.
  let c1x = m[3]!, c1y = m[4]!, c1z = m[5]!;
  const d01 = c1x * c0x + c1y * c0y + c1z * c0z;
  c1x -= d01 * c0x; c1y -= d01 * c0y; c1z -= d01 * c0z;
  const n1 = Math.sqrt(c1x * c1x + c1y * c1y + c1z * c1z);
  c1x /= n1; c1y /= n1; c1z /= n1;

  // Column 2: recompute as c0 × c1 (avoids accumulated error).
  const c2x = c0y * c1z - c0z * c1y;
  const c2y = c0z * c1x - c0x * c1z;
  const c2z = c0x * c1y - c0y * c1x;

  return [c0x, c0y, c0z, c1x, c1y, c1z, c2x, c2y, c2z];
}

/**
 * Convert a column-major 3×3 rotation matrix to a unit quaternion
 * (x, y, z, w).  Shepperd's method, indexed for column-major:
 * cell row r col c is `m[c * 3 + r]`.
 */
function matrixToQuaternion(m: Mat3): Vec4 {
  // Diagonal elements: m[0], m[4], m[8] (rows 0,1,2 of columns 0,1,2).
  const m00 = m[0]!, m11 = m[4]!, m22 = m[8]!;
  // Off-diagonals: m[r][c] in row-major → m[c*3 + r] here.
  const m01 = m[3]!, m02 = m[6]!;
  const m10 = m[1]!, m12 = m[7]!;
  const m20 = m[2]!, m21 = m[5]!;

  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / n, y / n, z / n, w / n];
}

const R_SG_TO_GAL = buildSgToGal();
const R_GAL_TO_EQ = buildGalToEq();

/**
 * Rotation matrix taking supergalactic Cartesian → equatorial Cartesian,
 * stored as a flat column-major 9-tuple `Mat3`.
 */
export const SG_TO_EQ_MATRIX: Mat3 = reorthonormalise(multiply3x3(R_GAL_TO_EQ, R_SG_TO_GAL));

/** Same rotation as a unit quaternion (x, y, z, w). For SCFD header. */
export const SG_TO_EQ_QUATERNION: Vec4 = matrixToQuaternion(SG_TO_EQ_MATRIX);

/**
 * Same rotation as a 16-element column-major Mat4 (rotation in the
 * upper-left 3x3, identity translation, w=1).  Ready to pass through
 * `mat4.fromValues(...SG_TO_EQ_MAT4_COL_MAJOR)` or to construct a
 * `Float32Array` for direct GPU upload.
 *
 * ### Why a separate export and not "build it in the renderer"
 *
 * The scalar-volume renderer previously kept a private hardcoded
 * mat4 of the SG→EQ rotation, with element values that diverged from
 * the canonical 3x3 by ~1.9 magnitude in places.  Cluster labels
 * (which use `raDecDistToEqCart` → canonical 3x3) ended up at
 * different world positions from the cube's voxels (which used the
 * renderer's local hardcoded mat4).  This export is the canonical
 * column-major form derived from `SG_TO_EQ_MATRIX` once, at module
 * init; every consumer must import it rather than reconstruct.
 *
 * Column-major layout (matches gl-matrix and WebGPU mat4x4):
 *   index    0  4  8 12   col 0   col 1   col 2   col 3
 *            1  5  9 13   row 0   row 0   row 0   row 0
 *            2  6 10 14   row 1   row 1   row 1   row 1
 *            3  7 11 15   row 2   row 2   row 2   row 2
 *
 * i.e. column c row r lives at index c*4 + r.
 */
export const SG_TO_EQ_MAT4_COL_MAJOR: Mat4 = Object.freeze([
  // Column 0: SG_TO_EQ_MATRIX column 0 + 0 in the homogeneous w-row.
  SG_TO_EQ_MATRIX[0]!, SG_TO_EQ_MATRIX[1]!, SG_TO_EQ_MATRIX[2]!, 0,
  // Column 1.
  SG_TO_EQ_MATRIX[3]!, SG_TO_EQ_MATRIX[4]!, SG_TO_EQ_MATRIX[5]!, 0,
  // Column 2.
  SG_TO_EQ_MATRIX[6]!, SG_TO_EQ_MATRIX[7]!, SG_TO_EQ_MATRIX[8]!, 0,
  // Column 3: translation = none, w = 1.
  0, 0, 0, 1,
]) as Mat4;

/**
 * Apply the SG → equatorial rotation to a vector. Length is preserved.
 *
 *   eq[r] = Σ_c m[c*3 + r] · sg[c]
 */
export function sgCartesianToEquatorial(sg: Vec3): Vec3 {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0]! * sg[0] + m[3]! * sg[1] + m[6]! * sg[2],
    m[1]! * sg[0] + m[4]! * sg[1] + m[7]! * sg[2],
    m[2]! * sg[0] + m[5]! * sg[1] + m[8]! * sg[2],
  ];
}
```

Note: `Row3` and the local nested `Mat3` typedef are deleted. Every consumer now imports `Mat3`, `Mat4`, `Vec3`, `Vec4` from `@types`.

- [ ] **Step 4: Run the test suite to confirm green**

Run: `npm test -- tests/data/superGalacticTransform.test.ts`
Expected: PASS (every test in the file passes).

- [ ] **Step 5: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS. If consumers break (likely candidates: `tools/auditCf4Anchors.ts`, the scalar-volume renderer build calls, the SCFD header writer), note each error — they are fixed in Task 5.

If errors are limited to `tools/auditCf4Anchors.ts`, that is expected and Task 5 fixes them. If a `src/` file errors, the new `SG_TO_EQ_MATRIX` shape escaped through an unguarded consumer — read the error, add the consumer to the fix list for Task 5, and proceed.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS for all tests except those that depend on the old `tools/` shape — keep that error visible; Task 5 fixes it. If any `src/` or unrelated `tests/` file fails, debug before continuing.

- [ ] **Step 7: Commit (even if tools/ still has compile errors — those land in Task 5)**

```bash
git add src/data/superGalacticTransform.ts tests/data/superGalacticTransform.test.ts
git commit -m "refactor(sg): make SG_TO_EQ_MATRIX a flat column-major Mat3"
```

---

### Task 5: Fix `tools/auditCf4Anchors.ts` and `tools/verifyCf4Scfd.ts` for the new flat-Mat3 layout

Two tools read `SG_TO_EQ_MATRIX[i][j]` (nested row-major) directly. After Task 4 that indexing is wrong. Rewrite both for flat column-major.

**Files:**
- Modify: `tools/auditCf4Anchors.ts`
- Modify: `tools/verifyCf4Scfd.ts`

- [ ] **Step 1: Rewrite the matrix helpers and the EQ_TO_SG_MATRIX derivation**

Replace lines 38–66 of `tools/auditCf4Anchors.ts` with:

```ts
import type { Mat3, Vec3 } from '../src/@types';

/**
 * Apply a column-major Mat3 to a Vec3.
 *   result[r] = Σ_c m[c*3 + r] · v[c]
 */
function applyMat3(m: Mat3, v: Vec3): Vec3 {
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
function transpose3(m: Mat3): Mat3 {
  return [
    m[0]!, m[3]!, m[6]!,
    m[1]!, m[4]!, m[7]!,
    m[2]!, m[5]!, m[8]!,
  ];
}

const EQ_TO_SG_MATRIX: Mat3 = transpose3(SG_TO_EQ_MATRIX);

/** Eq Cartesian → SG Cartesian (Mpc, length-preserving). */
function eqToSg(eq: Vec3): Vec3 {
  return applyMat3(EQ_TO_SG_MATRIX, eq);
}
```

Note: the local `getSgToEqMatrix()` helper and its cast are gone — `SG_TO_EQ_MATRIX` is now strictly typed as `Mat3` at the source, no cast needed.

- [ ] **Step 2: Audit the rest of the file for other tuple types**

Run: `grep -n "readonly \[number, number, number\]" tools/auditCf4Anchors.ts`
For each line printed, replace with `Vec3` and add the import to the top of the file if not already there (the import was added in Step 1).

- [ ] **Step 2b: Rewrite `tools/verifyCf4Scfd.ts` helpers for flat column-major**

The current file has these helpers around lines 34–60:

```ts
function transpose3(m: typeof SG_TO_EQ_MATRIX): typeof SG_TO_EQ_MATRIX {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

const EQ_TO_SG = transpose3(SG_TO_EQ_MATRIX);

function eqToSg(eq: readonly [number, number, number]): [number, number, number] {
  const m = EQ_TO_SG;
  return [
    m[0][0] * eq[0] + m[0][1] * eq[1] + m[0][2] * eq[2],
    m[1][0] * eq[0] + m[1][1] * eq[1] + m[1][2] * eq[2],
    m[2][0] * eq[0] + m[2][1] * eq[1] + m[2][2] * eq[2],
  ];
}

function sgToEq(sg: readonly [number, number, number]): [number, number, number] {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0][0] * sg[0] + m[0][1] * sg[1] + m[0][2] * sg[2],
    m[1][0] * sg[0] + m[1][1] * sg[1] + m[1][2] * sg[2],
    m[2][0] * sg[0] + m[2][1] * sg[1] + m[2][2] * sg[2],
  ];
}
```

Replace the entire block with:

```ts
import type { Mat3, Vec3 } from '../src/@types';

/**
 * Transpose of a column-major Mat3.  For an orthonormal rotation this
 * is its inverse.  m[c*3 + r] → m'[r*3 + c].
 */
function transpose3(m: Mat3): Mat3 {
  return [
    m[0]!, m[3]!, m[6]!,
    m[1]!, m[4]!, m[7]!,
    m[2]!, m[5]!, m[8]!,
  ];
}

const EQ_TO_SG: Mat3 = transpose3(SG_TO_EQ_MATRIX);

/** Apply a column-major Mat3 to a Vec3: result[r] = Σ_c m[c*3 + r] · v[c]. */
function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}

function eqToSg(eq: Vec3): Vec3 {
  return applyMat3(EQ_TO_SG, eq);
}

function sgToEq(sg: Vec3): Vec3 {
  return applyMat3(SG_TO_EQ_MATRIX, sg);
}
```

Then audit the rest of the file: `grep -n "readonly \[number, number, number\]" tools/verifyCf4Scfd.ts`. Replace each occurrence with `Vec3`.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the audit script as a smoke test (optional — skip if no CF-4 data on disk)**

If `data/raw/d_mean_CF4pp.npy` exists locally:

Run: `npx tsx tools/auditCf4Anchors.ts`
Expected: The "data layout confirmed" output similar to before (5/6 anchors at 95th+ percentile). If percentile rankings differ from the historical baseline, the matrix conversion broke something — debug before continuing.

If the file does not exist, skip this step.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS for all 1115+ tests.

- [ ] **Step 6: Commit**

```bash
git add tools/auditCf4Anchors.ts tools/verifyCf4Scfd.ts
git commit -m "refactor(tools): port CF-4 audit/verify scripts to flat column-major Mat3"
```

---

### Task 6: Final sweep — typecheck, tests, and grep audits

**Files:** No source changes; verification only.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (zero errors in both `src/` and `tools/` tsconfigs).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS for all 1115+ tests.

- [ ] **Step 3: Run a final grep for inline tuple types in src/**

Run: `grep -rEn "readonly \[number,\s*number,\s*number(,\s*number)?\]" src/ --include="*.ts"`
Expected: empty output.

If any output appears, it indicates a leak — open each line, decide whether `Vec3` or `Vec4` fits, replace, re-run typecheck.

- [ ] **Step 4: Run a final grep for nested-array matrix shapes**

Run: `grep -rEn "\[\[\s*number" src/ tools/ --include="*.ts"`
Expected: empty output.

If output appears, that file still holds a row-major nested matrix — convert per the index translation table in Task 4's preamble.

- [ ] **Step 5: Run a final grep for the old SG_TO_EQ_MATRIX nested access pattern**

Run: `grep -rEn "SG_TO_EQ_MATRIX\[\d+\]\[\d+\]" src/ tools/ tests/ --include="*.ts"`
Expected: empty output.

If output appears, that site is reading the old nested form — convert to flat indexing (`m[c * 3 + r]`).

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: PASS (vite build succeeds, no TS errors).

- [ ] **Step 7: Final commit (if any cleanup happened in Steps 3-5)**

If the grep audits found anything and you fixed it:

```bash
git add -A
git commit -m "refactor(types): finish migration to Vec/Mat aliases"
```

Otherwise, nothing to commit — the migration is already complete.

---

## Self-Review

**Spec coverage:**
- ✅ Vec2/3/4 types in `@types` (Task 1).
- ✅ Mat3/4 types in `@types`, column-major by convention (Task 3).
- ✅ All row-major matrices converted to column-major: `SG_TO_EQ_MATRIX` is the only one (Task 4).
- ✅ All inline tuple types migrated to `Vec3`/`Vec4` (Task 2, audited again in Task 6).
- ✅ Consumers updated: `tools/auditCf4Anchors.ts` (Task 5); `SG_TO_EQ_MAT4_COL_MAJOR` derivation (Task 4); tests (Task 4).
- ✅ Cross-cutting verification: typecheck + tests + greps (Task 6).

**Placeholder scan:** No "TBD", "TODO", or "fill in later" — every step shows complete code or an exact command with expected output.

**Type consistency:** Every reference to `Mat3` after Task 3 is the flat 9-tuple from `@types/Mat`; every reference to `Vec3` from Task 1 onward is the readonly 3-tuple from `@types/Vec`. The transition point is Task 4 — before it, `SG_TO_EQ_MATRIX` is nested row-major; after it, flat column-major. Tasks 5 and 6 assume the post-Task-4 shape, which is correct because tasks execute in order.
