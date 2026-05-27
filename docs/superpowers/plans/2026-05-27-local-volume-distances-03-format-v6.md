# Local-Volume Distances — 03 · Bin Format v6 (`spectroscopicZ` Field)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `spectroscopicZ: Float32` at byte offset 54 of the per-galaxy record (consuming 4 of the 10 v5 padding bytes), bump the version magic from 5 to 6, update encoder/decoder, extend the `GalaxyCatalog` type, and confirm the v5→v6 transition surfaces as the documented "regenerate" error on stale clients.

**Architecture:** Single-file format change (`src/data/galaxyCatalogFormat.ts`) plus its co-located test (`tests/data/galaxyCatalogFormat.test.ts`) plus a small type extension. No callers wired yet — that happens in sub-plan 04. The format change is independently testable in isolation.

**Tech Stack:** Vanilla TypeScript with typed-array views; Vitest for round-trip tests.

---

## File Structure

- **Modify:** `src/data/galaxyCatalogFormat.ts` — VERSION 5 → 6, `spectroscopicZ` encode/decode at byte offset 54
- **Modify:** `src/@types/data/GalaxyCatalog.d.ts` — add `spectroscopicZ: Float32Array` field with docstring
- **Modify:** `tests/data/galaxyCatalogFormat.test.ts` — add round-trip + version-rejection coverage for v6
- **Modify:** `tools/catalog/buildAllBins.ts` — extend `recordsToCloud` to populate the new field (placeholder NaN-fill in this sub-plan; sub-plan 04 wires the real value)

---

## Why v6, not "v5 with a new field at the same offset"

The v5 docstring is explicit:

> v4 files are rejected with the documented "regenerate via `npm run build-tiers`" error — the magic + version header is the single source of truth for "do I understand this file?".

Silently overlaying a new field on v5's reserved padding would violate that contract. A user with a stale `2mrs.bin` deployed to R2 would load it into a client that now expects `spectroscopicZ` to be a real measurement, but the stale bytes would decode as either zeros (if the buffer was zero-initialised on encode) or arbitrary noise (if the encoder happened to write garbage there). Decision #5 in the spec says spectroscopic z is now a **distinct concept** from position — it deserves the version bump that marks it as a first-class field.

The loader's existing error path is exactly what we want:

```typescript
// galaxyCatalogFormat.ts:142-146
if (version !== VERSION) {
  throw new Error(
    `unsupported version: ${version} — please regenerate the .bin via "npm run build-tiers"`,
  );
}
```

Confirmed: stale clients get this error loudly, the cure is documented in the message itself, the build pipeline is the cure.

---

## Task 1 — Add `spectroscopicZ` to `GalaxyCatalog` type

**Files:**
- Modify: `src/@types/data/GalaxyCatalog.d.ts`

- [ ] **Step 1: Add the field**

Open `src/@types/data/GalaxyCatalog.d.ts`. The type already has `objIDs`, `positions`, five magnitude arrays, `axisRatio`, `positionAngleDeg`, `diameterKpc`, `classByte`, `parentSurveyByte`. Add `spectroscopicZ` after `diameterKpc` (logical grouping: physical-quantity floats first, then enum bytes):

```typescript
  /**
   * Per-galaxy spectroscopic redshift z — length === count.
   *
   * Carries the *catalogued* redshift, NOT the value implied by the
   * stored 3-D position. The two diverge for galaxies inside ~30 Mpc
   * where the build pipeline overrides the cz-derived position with a
   * Cosmicflows-4 (or HyperLEDA `mod0`) measured distance — see
   * docs/superpowers/specs/2026-05-27-local-volume-distances.md.
   *
   * For rows that DON'T get the local-volume override, `spectroscopicZ`
   * equals the redshift used to derive the position (modulo float32
   * precision), so the InfoCard's "Redshift z" line and the rendered
   * point's distance remain self-consistent.
   *
   * Negative values are legal and preserved: the ~25 nearby galaxies
   * with peculiar-velocity-dominated blueshifts (M31, M86, etc.)
   * really do have z < 0 in their original catalogs, and the InfoCard
   * shows the catalog value rather than the linear-sign-mirrored
   * position-derived approximation.
   *
   * NaN is the "no spectroscopic measurement" sentinel — used for
   * Famous Galaxy records that have a measured distance but no
   * published spectroscopic redshift (rare; mostly Local Group dwarfs).
   * Consumers fall back to the cartesian-derived value in that case.
   */
  spectroscopicZ: Float32Array;
```

- [ ] **Step 2: Run typecheck — expect failure**

Run: `npm run typecheck`
Expected: FAIL — `encodeGalaxyCatalog` and `decodeGalaxyCatalog` are missing the new field. That's by design; the next tasks fix it.

- [ ] **Step 3: No commit yet**

The next task makes the codebase compile again; commit once typecheck passes.

---

## Task 2 — Bump `VERSION` and add encode/decode for `spectroscopicZ`

**Files:**
- Modify: `src/data/galaxyCatalogFormat.ts`

- [ ] **Step 1: Update the file-level docstring**

Replace the layout comment at the top of `src/data/galaxyCatalogFormat.ts`. The new docstring documents v6 cleanly:

```typescript
/**
 * Binary on-disk format for a `GalaxyCatalog` — version 6.
 *
 * v6 consumes 4 of v5's 10 trailing padding bytes for a new per-record
 * float field:
 *
 *   - `spectroscopicZ` (offset 54, float32): the *catalogued*
 *     spectroscopic redshift, stored independently of the cartesian
 *     position so the InfoCard can display the real catalog value
 *     instead of the value implied by |position| / Hubble-distance.
 *
 *     Needed because v5's `positions` field is computed at build time
 *     from either cz (the default) or a redshift-independent catalog
 *     distance (CF4 / HyperLEDA for galaxies inside ~30 Mpc).
 *     Inverting the cartesian distance back to a z works for the
 *     cz-derived rows but produces nonsense for the catalog-overridden
 *     rows (e.g. M31 at |pos|=0.78 Mpc inverts to z=+0.00018, not
 *     the published −0.001).
 *
 *     NaN is the "no spectroscopic z available" sentinel. Consumers
 *     that need a fallback fall back to the position-derived value.
 *
 * Other than the new field, the per-record layout is identical to v5
 * (which itself reuses the v4 64-byte stride). The remaining 6 bytes
 * of tail padding stay reserved for future per-record metadata that
 * fits in the existing stride.
 *
 * v5 (and earlier) files are rejected with the documented "regenerate
 * via `npm run build-tiers`" error — the magic + version header is
 * the single source of truth for "do I understand this file?".
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 6 (uint32)
 *     8       4     count    = number of galaxies (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-GALAXY RECORD (64 bytes) ───────────────────────────────────────
 *     0       8     objID            (uint64)
 *     8       4     x                (float32, Mpc)
 *     12      4     y                (float32)
 *     16      4     z                (float32)
 *     20      4     magU             (float32)
 *     24      4     magG             (float32)
 *     28      4     magR             (float32)
 *     32      4     magI             (float32)
 *     36      4     magZ             (float32)
 *     40      4     axisRatio        (float32) — b/a in [0,1] or NaN
 *     44      4     positionAngleDeg (float32) — PA in [0,180) or NaN
 *     48      4     diameterKpc      (float32) — physical diameter in kpc
 *     52      1     classByte        (uint8)  — per-source enum
 *     53      1     parentSurveyByte (uint8)  — Milliquas-only
 *     54      4     spectroscopicZ   (float32) — NEW in v6
 *     58      6     padding          (zeroed)
 *
 * Total file size: 16 + count × 64.
 */
```

- [ ] **Step 2: Bump the `VERSION` constant**

```typescript
const VERSION = 6;
```

- [ ] **Step 3: Add encoding of the new field**

In `encodeGalaxyCatalog`, find the destructuring at the top:

```typescript
const {
  count,
  objIDs,
  positions,
  // ... existing fields ...
  classByte,
  parentSurveyByte,
  spectroscopicZ,        // ← add
} = catalog;
```

Add a length-check sibling alongside the existing checks:

```typescript
if (spectroscopicZ.length !== count) throw new Error('spectroscopicZ length mismatch');
```

In the per-record write loop, after the two byte-view writes, write the float at offset 54. The cleanest path is via the existing `floatView` (which uses the `byteBase + 8` / 4 offset trick) — but offset 54 is not aligned to 8 within the record (4-byte aligned is fine for float32, but `(byteBase + 54) / 4` would need `(HEADER_BYTES + i*64 + 54) / 4` which is integer only when `HEADER_BYTES + i*64 + 54` is divisible by 4. `HEADER_BYTES = 16` and `i*64` are both divisible by 4, plus `54 = 13*4 + 2`, so the result is NOT 4-aligned and the `floatView` shortcut breaks).

Use `dv.setFloat32` directly — it has no alignment requirement:

```typescript
dv.setFloat32(byteBase + 54, spectroscopicZ[i]!, true);
```

- [ ] **Step 4: Add decoding of the new field**

In `decodeGalaxyCatalog`, allocate the new typed array alongside the others:

```typescript
const spectroscopicZ = new Float32Array(count);
```

In the per-record read loop, read offset 54 via `dv.getFloat32` (same alignment caveat as the encoder):

```typescript
spectroscopicZ[i] = dv.getFloat32(byteBase + 54, true);
```

Add to the returned object:

```typescript
return {
  count,
  objIDs,
  positions,
  // ... existing fields ...
  classByte,
  parentSurveyByte,
  spectroscopicZ,        // ← add
};
```

- [ ] **Step 5: Update `emptyGalaxyCatalog`**

```typescript
export function emptyGalaxyCatalog(): GalaxyCatalog {
  return {
    count: 0,
    objIDs: new BigUint64Array(0),
    positions: new Float32Array(0),
    magU: new Float32Array(0),
    magG: new Float32Array(0),
    magR: new Float32Array(0),
    magI: new Float32Array(0),
    magZ: new Float32Array(0),
    axisRatio: new Float32Array(0),
    positionAngleDeg: new Float32Array(0),
    diameterKpc: new Float32Array(0),
    classByte: new Uint8Array(0),
    parentSurveyByte: new Uint8Array(0),
    spectroscopicZ: new Float32Array(0),  // ← add
  };
}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — `galaxyCatalogFormat.ts` now matches the extended `GalaxyCatalog` type.

There may be downstream errors in callers that construct `GalaxyCatalog` objects (notably `recordsToCloud` in `buildAllBins.ts`). Those are addressed by Task 5 (and sub-plan 04). For this commit, only the format file should be touched — the engineer fixes the build-pipeline gap in Task 5.

- [ ] **Step 7: Don't run tests yet**

The existing test fixture in `tests/data/galaxyCatalogFormat.test.ts` constructs a `GalaxyCatalog` without `spectroscopicZ`, so vitest will fail on typecheck inside the test until Task 3. That's expected.

- [ ] **Step 8: No commit yet**

Combine the format change + test update + builder shim into one commit at the end of Task 5, so the repo never has a half-broken state on disk.

---

## Task 3 — Extend the format round-trip test

**Files:**
- Modify: `tests/data/galaxyCatalogFormat.test.ts`

- [ ] **Step 1: Extend `makeCatalog`**

Find `function makeCatalog(count: number): GalaxyCatalog` near the top of the file. Add the new field to the returned object:

```typescript
function makeCatalog(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),  // ← add
  };
}
```

- [ ] **Step 2: Add a `spectroscopicZ` round-trip test**

Append a new `it` block to the existing `describe('encode/decode galaxy catalog v5', …)` block (rename to v6 in Step 4):

```typescript
  it('round-trips spectroscopicZ for every record including negatives and NaN', () => {
    const cat = makeCatalog(4);
    cat.spectroscopicZ[0] = 0.0234;     // typical SDSS row
    cat.spectroscopicZ[1] = -0.00094;   // M31 (real blueshift)
    cat.spectroscopicZ[2] = 0;          // intentional zero (e.g. local fixture)
    cat.spectroscopicZ[3] = NaN;        // no spec-z available

    const buf = encodeGalaxyCatalog(cat);
    const out = decodeGalaxyCatalog(buf);

    expect(out.spectroscopicZ[0]).toBeCloseTo(0.0234, 5);
    expect(out.spectroscopicZ[1]).toBeCloseTo(-0.00094, 5);
    expect(out.spectroscopicZ[2]).toBe(0);
    expect(Number.isNaN(out.spectroscopicZ[3])).toBe(true);
  });
```

- [ ] **Step 3: Add a v5-rejection test**

The existing test file probably already has a v4-rejection test. Add v5 rejection. Look near the existing version-rejection test (probably `'rejects v4 buffers with the regenerate error'`) and add a sibling:

```typescript
  it('rejects v5 buffers with the regenerate error', () => {
    // Hand-build a v5 buffer header (16 bytes: magic + version=5 + count=0 + reserved).
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // SKMP magic
    dv.setUint32(4, 5, true);          // version 5
    dv.setUint32(8, 0, true);          // count 0
    dv.setUint32(12, 0, true);

    expect(() => decodeGalaxyCatalog(buf)).toThrow(/unsupported version: 5/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });
```

- [ ] **Step 4: Rename the `describe` block**

Change `describe('encode/decode galaxy catalog v5', …)` to `describe('encode/decode galaxy catalog v6', …)`. Update the test-file's top-of-file docstring similarly (`v5` → `v6`).

- [ ] **Step 5: Run vitest**

Run: `npx vitest run tests/data/galaxyCatalogFormat.test.ts`
Expected: PASS — round-trip + v5-rejection both green.

If a test fails on the `spectroscopicZ` round trip with a "not aligned" or similar message, the encoder/decoder are routing through `floatView` instead of `dv.getFloat32`. Verify they use the DataView path per Task 2 Steps 3–4.

- [ ] **Step 6: No commit yet — Task 5 finishes the chain.**

---

## Task 4 — Confirm the version-bump error surfaces correctly in real loaders

**Files:** none (verification step)

- [ ] **Step 1: Inspect the runtime loader**

There's a runtime path that fetches `.bin` files from `/data/*` and calls `decodeGalaxyCatalog`. Find it: `grep -rn "decodeGalaxyCatalog" src/`. Confirm the call site does *not* swallow the thrown error — it should bubble out so the UI shows a load failure (or at minimum logs to the console).

- [ ] **Step 2: Document the behaviour**

In `galaxyCatalogFormat.ts`, the existing decoder throw is the contract. No code change needed. Add a one-line comment above the version check:

```typescript
// Mismatch surfaces as the documented "regenerate" error.  Stale .bin
// files (last built before this format version landed) trigger this on
// every reload until `npm run build-tiers` is re-run.  The error
// message itself is the cure — keep it instructive.
```

- [ ] **Step 3: No commit — included in Task 5's commit.**

---

## Task 5 — Wire `spectroscopicZ` through `recordsToCloud` (placeholder)

**Files:**
- Modify: `tools/catalog/buildAllBins.ts`

This sub-plan focuses on the format. Sub-plan 04 will fill `spectroscopicZ[i]` from the actual catalogued z. For now, we just need `recordsToCloud` to populate the array so the build compiles — using `r.z` is fine as a placeholder, because today every record's `z` is the catalogued redshift (the override hasn't been wired yet).

- [ ] **Step 1: Add the typed-array allocation**

In `recordsToCloud`, find the `GalaxyCatalog` object literal allocation block:

```typescript
const cloud: GalaxyCatalog = {
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
  classByte: new Uint8Array(count),
  parentSurveyByte: new Uint8Array(count),
  spectroscopicZ: new Float32Array(count),  // ← add
};
```

- [ ] **Step 2: Populate in the fill loop (placeholder)**

In the `for (let i = 0; i < count; i++)` body, just before or after the existing field-copy lines:

```typescript
// Spectroscopic z: today this is the same z used to compute position.
// Sub-plan 04 splits the two when CF4 overrides the position, but the
// stored z stays catalogued.
cloud.spectroscopicZ[i] = r.z;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. The full codebase compiles with the v6 format change.

- [ ] **Step 4: Run vitest**

Run: `npm test`
Expected: PASS. Format tests are green; no consumer reads `spectroscopicZ` yet, so the rest of the suite is unaffected.

If a test fails in `tests/catalog/buildAllBins.milliquas.test.ts` or similar with "spectroscopicZ length mismatch" or related, audit those tests for hand-constructed `GalaxyCatalog`s that need the new field. Add `spectroscopicZ: new Float32Array(count)` to each fixture and re-run.

- [ ] **Step 5: Commit the full chain**

```bash
git add src/data/galaxyCatalogFormat.ts src/@types/data/GalaxyCatalog.d.ts tests/data/galaxyCatalogFormat.test.ts tools/catalog/buildAllBins.ts
git commit -m "$(cat <<'EOF'
feat(format): bump GalaxyCatalog .bin to v6 with spectroscopicZ field

Adds a Float32 spectroscopicZ slot at byte offset 54, consuming
4 of v5's 10 trailing padding bytes. Stride stays 64 bytes/record;
six bytes of padding remain reserved. v5 buffers now surface the
documented "regenerate via npm run build-tiers" error on load.

Today recordsToCloud populates spectroscopicZ with the same r.z it
already uses for position derivation; the CF4 override (which makes
the two diverge for local-volume rows) lands in sub-plan 04.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Audit other `GalaxyCatalog` constructors for the new field

**Files:**
- Modify: any other site that constructs `GalaxyCatalog` literals

- [ ] **Step 1: Find them**

Run: `grep -rn "objIDs:.*BigUint64Array\|new BigUint64Array.*count" src/ tests/ tools/ --include="*.ts" --include="*.tsx"`

You're looking for object literals shaped `{ count, objIDs: ..., positions: ..., ... }` that create a `GalaxyCatalog`. Common locations:

- The synthetic-catalog generator (`src/data/syntheticCatalog.ts` or similar)
- `emptyGalaxyCatalog` (already done in Task 2)
- Test fixtures under `tests/data/` and `tests/services/`

- [ ] **Step 2: Add `spectroscopicZ` to each**

For every constructor, add `spectroscopicZ: new Float32Array(count)` (or populate with real values if the fixture is testing redshift behaviour specifically).

- [ ] **Step 3: Run typecheck + vitest**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -- src/ tests/ tools/  # Stage only the modified TS files
# Use `git status` first to confirm only intended files are staged.
git commit -m "$(cat <<'EOF'
chore(format): backfill spectroscopicZ into remaining GalaxyCatalog constructors

Synthetic catalogs, test fixtures, and helper builders gain an empty
spectroscopicZ Float32Array so the type-checker is satisfied. None
of these paths populate the field with meaningful data — only the
real build pipeline (sub-plan 04) does.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- [x] v6 bump is loud (decoder throws on v5+), matching the spec's "old bins fail loudly with a regenerate error" expectation.
- [x] Field offset (byte 54) is chosen so the existing `floatView` shortcut is bypassed (alignment-correct via DataView) — encoder/decoder both use `dv.setFloat32` / `dv.getFloat32` rather than the misaligned typed-array view.
- [x] Six bytes of padding remain (bytes 58..63) for future per-record fields without another version bump.
- [x] Negative + NaN round-trips are tested — the M31 blueshift and "no spec-z" cases are first-class.
- [x] `recordsToCloud` placeholder populates the field with `r.z` (the existing catalogued redshift) so the build compiles before sub-plan 04 wires the override.
- [x] Type-checking gates the change at every step; no half-typed intermediate commits.
- [x] All other `GalaxyCatalog` constructors are swept in Task 6 so no test silently keeps an unmodified shape.
