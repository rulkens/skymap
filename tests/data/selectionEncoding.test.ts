/**
 * Tests for the (sourceCode << 26) | localIdx packed-identity encoding.
 *
 * These cover round-trip correctness, the cleared-pick-texture sentinel
 * convention, and bounds (6-bit source, 26-bit localIdx). The TS↔WESL
 * parity test lives at the bottom.
 */

import { describe, it, expect } from 'vitest';
import type { SourceType } from '../../src/@types/data/SourceType';
import {
  SELECTION_SOURCE_SHIFT,
  SELECTION_LOCAL_IDX_MASK,
  SELECTION_NONE_SENTINEL,
  SELECTION_SOURCE_SENTINEL_CODE,
  PICK_SENTINEL_OFFSET,
  packSelection,
  unpackPick,
} from '../../src/data/selectionEncoding';
import type { PickResult } from '../../src/@types/data/PickResult';
import { Source } from '../../src/data/sources';

describe('selectionEncoding', () => {
  it('exposes the canonical encoding constants', () => {
    expect(SELECTION_SOURCE_SHIFT).toBe(26);
    expect(SELECTION_LOCAL_IDX_MASK).toBe(0x03ffffff);
    expect(SELECTION_NONE_SENTINEL).toBe(0xffffffff);
    expect(SELECTION_SOURCE_SENTINEL_CODE).toBe(63);
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('packs (source, localIdx) into the documented bit layout', () => {
    // Source code 3 (e.g. GLADE) in bits 26..31, localIdx 42 in bits 0..25.
    // Expected: (3 << 26) | 42 = 0x0c000000 | 0x2a = 0x0c00002a.
    expect(packSelection(3, 42)).toBe(0x0c00002a);
  });

  it('packs source code 0 + localIdx 0 to 0', () => {
    // The picker offsets writes by +1 specifically because this packed
    // value collides with the cleared-pick-texture sentinel. The encoding
    // itself does NOT do the offset — that's the picker's job.
    expect(packSelection(0, 0)).toBe(0);
  });

  it('unpacks a real pick value back to (sourceCode, localIdx)', () => {
    // Picker writes `packed + 1`. So a real hit of source=3, localIdx=42
    // arrives as 0x0c00002b. unpackPick subtracts 1 from the bottom 26 bits
    // and returns the decoded identity (classification is downstream).
    expect(unpackPick(0x0c00002b)).toEqual({
      sourceCode: Source.Glade,
      localIdx: 42,
    });
  });

  it('unpacks raw == 0 to null (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('round-trips pack → +1 → unpackPick for any source identity', () => {
    // Codes 0..30 are allocated (unchanged by this widening — no new
    // source is minted here); 62 is the new top of the 6-bit space and
    // 63 deliberately returns null per the sentinel rule. unpackPick
    // decodes them all uniformly.
    const cases: Array<[number, number]> = [
      [0, 1],
      [0, SELECTION_LOCAL_IDX_MASK - 1],
      [1, 0],
      [4, 42],
      [4, SELECTION_LOCAL_IDX_MASK - 1],
      // localIdx caps at MASK - 1, not MASK: the picker's +1 offset on a
      // bare MASK carries out of the 26-bit localIdx field and corrupts
      // sourceCode, so MASK itself is never a recoverable value for any
      // source (not specific to 30). Hand-computed: (30 << 26) |
      // 0x03fffffe = 0x78000000 | 0x03fffffe = 0x7bfffffe; +1 offset =
      // 0x7bffffff.
      [30, SELECTION_LOCAL_IDX_MASK - 1],
      // Hand-computed: source=62 is the new top allocatable code the
      // 6-bit widening exists to free up. (62 << 26) | 12345, +1 offset.
      [62, 12345],
    ];
    for (const [source, localIdx] of cases) {
      const packed = packSelection(source, localIdx);
      const rawPick = (packed + PICK_SENTINEL_OFFSET) >>> 0;
      expect(unpackPick(rawPick)).toEqual({
        sourceCode: source as SourceType,
        localIdx,
      });
    }
    // Hand-computed check for the source=62 case: (62 << 26) | 12345 =
    // 0xf8000000 | 0x3039 = 0xf8003039; +1 = 0xf800303a. (Written as plain
    // hex literals, not a `|` expression, so JS's 32-bit-signed coercion in
    // bitwise ops can't silently flip the sign of a value this large.)
    expect(packSelection(62, 12345)).toBe(0xf8003039);
    expect((packSelection(62, 12345) + PICK_SENTINEL_OFFSET) >>> 0).toBe(0xf800303a);
  });

  it('sentinel does not collide with any allocated packed identity', () => {
    // Source codes 0..30 are allocated (6 bits, 64 slots, top slot 63
    // intentionally unallocated). Packing the largest allocated source
    // with the largest localIdx must remain < SELECTION_NONE_SENTINEL.
    const largestAllocated = packSelection(30, SELECTION_LOCAL_IDX_MASK);
    expect(largestAllocated).toBeLessThan(SELECTION_NONE_SENTINEL);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('selectionEncoding TS↔WESL parity', () => {
  /**
   * Reads the WESL file as text, extracts each
   * `const NAME: u32 = VALUE;` declaration via regex, parses the
   * value (decimal or hex literal, optional 'u' suffix), and returns
   * a `Map<NAME, parsedNumber>`. Throws if a constant we expect to
   * find is missing — the test will then fail with a clear message
   * instead of silently asserting `undefined === expected`.
   *
   * Path is resolved from `process.cwd()` (the repo root under Vitest)
   * to match the project convention — see e.g.
   * `tests/data/scalarFieldFormat.test.ts` and
   * `tests/parsers/famousSeed.test.ts`. `__dirname` would not work
   * under the Vite/Vitest ESM runner used here.
   */
  function parseWeslConstants(): Map<string, number> {
    const path = join(process.cwd(), 'src/services/gpu/shaders/lib/selectionEncoding.wesl');
    const text = readFileSync(path, 'utf-8');

    // Match e.g.  const SELECTION_SOURCE_SHIFT: u32 = 27u;
    //   const FOO: u32 = 0x1234u;
    //   const FOO: u32 = 42;
    const re = /const\s+(\w+)\s*:\s*u32\s*=\s*(0x[0-9a-fA-F]+|\d+)u?\s*;/g;
    const map = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1]!;
      const literal = m[2]!;
      const value = literal.startsWith('0x') ? parseInt(literal, 16) : parseInt(literal, 10);
      map.set(name, value);
    }
    return map;
  }

  it('each TS constant matches the WESL declaration of the same name', () => {
    const wesl = parseWeslConstants();

    // Use a table so a failure on any one constant reports both the
    // name and the mismatch — easier to debug than a bare equality
    // failure on a Map.
    const cases: Array<[string, number]> = [
      ['SELECTION_SOURCE_SHIFT', SELECTION_SOURCE_SHIFT],
      ['SELECTION_LOCAL_IDX_MASK', SELECTION_LOCAL_IDX_MASK],
      ['SELECTION_NONE_SENTINEL', SELECTION_NONE_SENTINEL],
      ['SELECTION_SOURCE_SENTINEL_CODE', SELECTION_SOURCE_SENTINEL_CODE],
      ['PICK_SENTINEL_OFFSET', PICK_SENTINEL_OFFSET],
      // Structure category source codes — mirror of TS Source.Cluster /
      // Source.Supercluster / Source.Void / Source.Group. These appear
      // at the WESL side so the future structure-marker pick fragment can
      // refer to them by name instead of inlining a magic 5u/6u/7u/15u
      // literal.
      ['SOURCE_CODE_CLUSTER', Source.Cluster],
      ['SOURCE_CODE_SUPERCLUSTER', Source.Supercluster],
      ['SOURCE_CODE_VOID', Source.Void],
      ['SOURCE_CODE_GROUP', Source.Group],
      // Survey (Gaia bin) stars — the star pick fragment packs this into the
      // r32uint pick texture; mirror of TS Source.GaiaStars.
      ['SOURCE_GAIA_STARS', Source.GaiaStars],
    ];

    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(
        weslValue,
        `WESL constant ${name} is missing from selectionEncoding.wesl`,
      ).toBeDefined();
      expect(weslValue, `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`).toBe(
        tsValue,
      );
    }
  });
});

describe('unpackPick — decode to (sourceCode, localIdx)', () => {
  // Helper: produce the raw pick texture value the picker would write
  // for a given (sourceCode, localIdx) pair. The picker offsets by
  // PICK_SENTINEL_OFFSET (+1); unpackPick reverses that.
  function rawFor(sourceCode: number, localIdx: number): number {
    return (packSelection(sourceCode, localIdx) + PICK_SENTINEL_OFFSET) >>> 0;
  }

  it('returns null for the reserved all-ones sentinel band', () => {
    // 0xffffffff is representation-independent: it decodes to the top
    // sourceCode of whatever field width SELECTION_SOURCE_SHIFT currently
    // is (63 at 6 bits, was 31 at 5), so this literal did not need to
    // change when the shift widened.
    expect(unpackPick(0xffffffff)).toBeNull();
  });

  it('decodes even unallocated codes — classification is downstream', () => {
    // No warn here — that lives in resolvePick; unpackPick doesn't know
    // which codes are pickable. It just reverses the bits.
    expect(unpackPick(rawFor(14, 5))).toEqual<PickResult>({
      sourceCode: 14 as SourceType,
      localIdx: 5,
    });
  });
});
