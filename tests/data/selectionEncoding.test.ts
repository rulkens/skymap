/**
 * Tests for the (sourceCode << 27) | localIdx packed-identity encoding.
 *
 * These cover round-trip correctness, the cleared-pick-texture sentinel
 * convention, and bounds (5-bit source, 27-bit localIdx). The TS↔WESL
 * parity test lives at the bottom and is added in a later task.
 */

import { describe, it, expect } from 'vitest';
import type { SourceType } from '../../src/@types/data/SourceType';
import {
  SELECTION_SOURCE_SHIFT,
  SELECTION_LOCAL_IDX_MASK,
  SELECTION_NONE_SENTINEL,
  PICK_SENTINEL_OFFSET,
  packSelection,
  unpackPick,
} from '../../src/data/selectionEncoding';
import type { PickResult } from '../../src/data/selectionEncoding';
import { Source } from '../../src/data/sources';

describe('selectionEncoding', () => {
  it('exposes the canonical encoding constants', () => {
    expect(SELECTION_SOURCE_SHIFT).toBe(27);
    expect(SELECTION_LOCAL_IDX_MASK).toBe(0x07ffffff);
    expect(SELECTION_NONE_SENTINEL).toBe(0xffffffff);
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('packs (source, localIdx) into the documented bit layout', () => {
    // Source code 3 (e.g. SDSS) in bits 27..31, localIdx 42 in bits 0..26.
    // Expected: (3 << 27) | 42 = 0x18000000 | 0x2a = 0x1800002a.
    expect(packSelection(3, 42)).toBe(0x1800002a);
  });

  it('packs source code 0 + localIdx 0 to 0', () => {
    // The picker offsets writes by +1 specifically because this packed
    // value collides with the cleared-pick-texture sentinel. The encoding
    // itself does NOT do the offset — that's the picker's job.
    expect(packSelection(0, 0)).toBe(0);
  });

  it('unpacks a real pick value back to (sourceCode, localIdx)', () => {
    // Picker writes `packed + 1`. So a real hit of source=3, localIdx=42
    // arrives as 0x1800002b. unpackPick subtracts 1 from the bottom 27 bits
    // and returns the decoded identity (classification is downstream).
    expect(unpackPick(0x1800002b)).toEqual({
      sourceCode: Source.Glade,
      localIdx: 42,
    });
  });

  it('unpacks raw == 0 to null (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('round-trips pack → +1 → unpackPick for any source identity', () => {
    // Codes 0..30 are allocated; 31 deliberately returns null per the
    // sentinel rule. unpackPick decodes them all uniformly.
    const cases: Array<[number, number]> = [
      [0, 1],
      [0, 0x07fffffe],
      [1, 0],
      [4, 42],
      [4, 0x07fffffe],
    ];
    for (const [source, localIdx] of cases) {
      const packed = packSelection(source, localIdx);
      const rawPick = (packed + PICK_SENTINEL_OFFSET) >>> 0;
      expect(unpackPick(rawPick)).toEqual({
        sourceCode: source as SourceType,
        localIdx,
      });
    }
  });

  it('sentinel does not collide with any allocated packed identity', () => {
    // Source codes 0..30 are allocated (5 bits, 32 slots, top slot 31
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
      ['PICK_SENTINEL_OFFSET', PICK_SENTINEL_OFFSET],
      // POI category source codes — mirror of TS Source.Cluster /
      // Source.Supercluster / Source.Void / Source.Group. These appear
      // at the WESL side so the future cluster-marker pick fragment can
      // refer to them by name instead of inlining a magic 5u/6u/7u/15u
      // literal.
      ['SOURCE_CODE_CLUSTER', Source.Cluster],
      ['SOURCE_CODE_SUPERCLUSTER', Source.Supercluster],
      ['SOURCE_CODE_VOID', Source.Void],
      ['SOURCE_CODE_GROUP', Source.Group],
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

  it('decodes the source code and local index for any allocated code', () => {
    // unpackPick is pure bit-decode now — classifying the code (survey vs
    // structure vs not-pickable) is pickToSelection's job. Every allocated
    // code round-trips as { sourceCode, localIdx }, regardless of category.
    const codes: SourceType[] = [
      Source.Synthetic,
      Source.SDSS,
      Source.Cluster,
      Source.Void,
      Source.Group,
      Source.Milliquas,
    ];
    for (const code of codes) {
      expect(unpackPick(rawFor(code, 42))).toEqual<PickResult>({ sourceCode: code, localIdx: 42 });
    }
  });

  it('reverses the +PICK_SENTINEL_OFFSET so localIdx 0 round-trips', () => {
    expect(unpackPick(rawFor(Source.Cluster, 0))).toEqual<PickResult>({
      sourceCode: Source.Cluster,
      localIdx: 0,
    });
  });

  it('returns null for raw==0 (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('returns null for source code 31 (the all-ones sentinel band)', () => {
    expect(unpackPick(0xffffffff)).toBeNull();
  });

  it('decodes even unallocated codes — classification is downstream', () => {
    // No warn here any more (that moved to pickToSelection); unpackPick
    // doesn't know which codes are pickable. It just reverses the bits.
    expect(unpackPick(rawFor(14, 5))).toEqual<PickResult>({
      sourceCode: 14 as SourceType,
      localIdx: 5,
    });
  });
});
