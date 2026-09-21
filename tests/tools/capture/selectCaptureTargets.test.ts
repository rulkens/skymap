import { describe, expect, it } from 'vitest';

import { selectCaptureTargets } from '../../../tools/capture/selectCaptureTargets';
import type { PaletteTab } from '../../../src/@types/palette/PaletteTab';
import type { PaletteCard } from '../../../src/@types/palette/PaletteCard';

function focusCard(id: string, overrides: Partial<PaletteCard> = {}): PaletteCard {
  return {
    id,
    label: id,
    blurb: id,
    action: { kind: 'focus', focusId: id },
    ...overrides,
  };
}

function viewCard(id: string, overrides: Partial<PaletteCard> = {}): PaletteCard {
  return {
    id,
    label: id,
    blurb: id,
    action: { kind: 'view', viewId: 'solarSystem' },
    ...overrides,
  };
}

function tab(id: string, cards: readonly PaletteCard[]): PaletteTab {
  return { id: id as PaletteTab['id'], label: id, cards };
}

describe('selectCaptureTargets', () => {
  it('skips a card whose webp already exists', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(selectCaptureTargets(tabs, new Set(['a']), [])).toEqual([]);
  });

  it('--force recaptures a card whose webp exists', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(selectCaptureTargets(tabs, new Set(['a']), ['a'])).toEqual([
      { cardId: 'a', kind: 'focus', focusId: 'a', capture: {} },
    ]);
  });

  it('never targets a card with an image override', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a', { image: '/images/famous/a.webp' })])];
    expect(selectCaptureTargets(tabs, new Set(), [])).toEqual([]);
  });

  it('targets a view card, mapped onto its viewId', () => {
    const tabs: PaletteTab[] = [tab('t1', [viewCard('a')])];
    expect(selectCaptureTargets(tabs, new Set(), [])).toEqual([
      { cardId: 'a', kind: 'view', viewId: 'solarSystem', capture: {} },
    ]);
  });

  it('never targets a view card with an image override', () => {
    const tabs: PaletteTab[] = [tab('t1', [viewCard('a', { image: '/images/famous/a.webp' })])];
    expect(selectCaptureTargets(tabs, new Set(), [])).toEqual([]);
  });

  it('captures a card listed in two tabs once, at its first position', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a'), focusCard('b')]),
      tab('t2', [focusCard('b'), focusCard('c')]),
    ];
    expect(selectCaptureTargets(tabs, new Set(['c']), []).map((t) => t.cardId)).toEqual(['a', 'b']);
  });

  it('captures a card from the copy without an image override (the m31 case)', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('m31')]),
      tab('t2', [focusCard('m31', { image: '/images/famous/m31.webp' })]),
    ];
    expect(selectCaptureTargets(tabs, new Set(), [])).toEqual([
      { cardId: 'm31', kind: 'focus', focusId: 'm31', capture: {} },
    ]);
  });

  it('forcing an unknown id throws', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(() => selectCaptureTargets(tabs, new Set(), ['nope'])).toThrow(/nope/);
  });

  it('forcing an id whose only copy has an image override throws', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a', { image: '/images/famous/a.webp' })])];
    expect(() => selectCaptureTargets(tabs, new Set(), ['a'])).toThrow(/a/);
  });

  it('throws when copies of one card carry different capture overrides', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a', { capture: { keepFocus: true } })]),
      tab('t2', [focusCard('a', { capture: { keepFocus: false } })]),
    ];
    expect(() => selectCaptureTargets(tabs, new Set(), [])).toThrow(/a/);
  });

  it('throws when an image-overridden copy disagrees on capture with another copy', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a', { capture: { keepFocus: true } })]),
      tab('t2', [focusCard('a', { image: '/images/famous/a.webp' })]),
    ];
    expect(() => selectCaptureTargets(tabs, new Set(), [])).toThrow(/a/);
  });
});
