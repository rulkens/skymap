import { describe, expect, it } from 'vitest';

import { stellarStreamsSelectionRow } from '../../../../src/layers/stellarStreams/selection/stellarStreamsSelectionRow';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import type { StellarStreamsRuntime } from '../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { StellarStreamSelectionRow } from '../../../../src/layers/stellarStreams/selection/@types/StellarStreamSelectionRow';
import { STREAM_META, GD_1 } from '../fixtures/streamMeta';

// Not 0 or 1: the row must pack the code its runtime holds.
const PICK_CODE = 41;
// Meta committed, bin never loaded: what a cold deep link sees.
const runtime = {
  meta: () => STREAM_META,
  pickCode: PICK_CODE,
  renderer: { hasData: () => false },
} as unknown as StellarStreamsRuntime;
const row = stellarStreamsSelectionRow(runtime);

describe('stellarStreamsSelectionRow', () => {
  it('resolvePick and encodePick round-trip every stream', () => {
    for (const m of STREAM_META) {
      const ref = { type: 'stellarStream', slug: m.id } as const;
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBe(PICK_CODE);
      expect(row.resolvePick(pick)).toEqual(ref);
    }
  });

  it('a deep-link ref resolves with the bin unloaded', () => {
    const ref = row.focusId!.decode('stream-gd-1')!;
    const extracted = row.extractRow(ref, 0) as StellarStreamSelectionRow;
    expect(extracted.names).toEqual(GD_1.names);
    expect(extracted.positionMpc).toEqual(GD_1.anchorMpc);
    expect(extracted.radiusMpc).toBeCloseTo(GD_1.lengthKpc / 2 / 1000, 9);
  });

  it('focusId decodes stream-gd-1 and refuses other prefixes', () => {
    expect(row.focusId!.decode('stream-gd-1')).toEqual({ type: 'stellarStream', slug: 'gd-1' });
    expect(row.focusId!.encode({ type: 'stellarStream', slug: 'gd-1' })).toBe('stream-gd-1');
    expect(row.focusId!.claims('stream-gd-1')).toBe(true);
    expect(row.focusId!.claims('streams-gd-1')).toBe(false);
    expect(row.focusId!.claims('body-earth')).toBe(false);
    expect(row.focusId!.claims('stream-')).toBe(false);
  });
});
