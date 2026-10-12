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

function exhibitCard(id: string, overrides: Partial<PaletteCard> = {}): PaletteCard {
  return {
    id,
    label: id,
    blurb: id,
    action: { kind: 'exhibit', exhibitId: 'solarSystem' },
    ...overrides,
  };
}

function tab(id: string, cards: readonly PaletteCard[]): PaletteTab {
  return { id: id as PaletteTab['id'], label: id, cards };
}

describe('selectCaptureTargets', () => {
  it('skips a card whose webp already exists', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(selectCaptureTargets(tabs, [], new Set(['public/images/featured/a.webp']), [])).toEqual(
      [],
    );
  });

  it('--force recaptures a card whose webp exists', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(
      selectCaptureTargets(tabs, [], new Set(['public/images/featured/a.webp']), ['a']),
    ).toEqual([
      {
        cardId: 'a',
        kind: 'focus',
        focusId: 'a',
        capture: {},
        outPath: 'public/images/featured/a.webp',
      },
    ]);
  });

  it('never targets a card with an image override', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a', { image: '/images/famous/a.webp' })])];
    expect(selectCaptureTargets(tabs, [], new Set(), [])).toEqual([]);
  });

  it('targets an exhibit card, mapped onto its exhibitId', () => {
    const tabs: PaletteTab[] = [tab('t1', [exhibitCard('a')])];
    expect(selectCaptureTargets(tabs, [], new Set(), [])).toEqual([
      {
        cardId: 'a',
        kind: 'exhibit',
        exhibitId: 'solarSystem',
        capture: {},
        outPath: 'public/images/featured/a.webp',
      },
    ]);
  });

  it('never targets an exhibit card with an image override', () => {
    const tabs: PaletteTab[] = [tab('t1', [exhibitCard('a', { image: '/images/famous/a.webp' })])];
    expect(selectCaptureTargets(tabs, [], new Set(), [])).toEqual([]);
  });

  it('captures a card listed in two tabs once, at its first position', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a'), focusCard('b')]),
      tab('t2', [focusCard('b'), focusCard('c')]),
    ];
    expect(
      selectCaptureTargets(tabs, [], new Set(['public/images/featured/c.webp']), []).map(
        (t) => t.cardId,
      ),
    ).toEqual(['a', 'b']);
  });

  it('captures a card from the copy without an image override (the m31 case)', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('m31')]),
      tab('t2', [focusCard('m31', { image: '/images/famous/m31.webp' })]),
    ];
    expect(selectCaptureTargets(tabs, [], new Set(), [])).toEqual([
      {
        cardId: 'm31',
        kind: 'focus',
        focusId: 'm31',
        capture: {},
        outPath: 'public/images/featured/m31.webp',
      },
    ]);
  });

  it('forcing an unknown id throws', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    expect(() => selectCaptureTargets(tabs, [], new Set(), ['nope'])).toThrow(/nope/);
  });

  it('forcing an id whose only copy has an image override throws', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a', { image: '/images/famous/a.webp' })])];
    expect(() => selectCaptureTargets(tabs, [], new Set(), ['a'])).toThrow(/a/);
  });

  it('throws when copies of one card carry different capture overrides', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a', { capture: { keepFocus: true } })]),
      tab('t2', [focusCard('a', { capture: { keepFocus: false } })]),
    ];
    expect(() => selectCaptureTargets(tabs, [], new Set(), [])).toThrow(/a/);
  });

  it('throws when an image-overridden copy disagrees on capture with another copy', () => {
    const tabs: PaletteTab[] = [
      tab('t1', [focusCard('a', { capture: { keepFocus: true } })]),
      tab('t2', [focusCard('a', { image: '/images/famous/a.webp' })]),
    ];
    expect(() => selectCaptureTargets(tabs, [], new Set(), [])).toThrow(/a/);
  });

  describe('featured structures', () => {
    const tabs: PaletteTab[] = [tab('t1', [focusCard('a')])];
    const SHOT = 'public/images/structures/galaxy-cluster-x.webp';

    it('adds one keepFocus focus target per structure id, written to the structures dir', () => {
      expect(selectCaptureTargets(tabs, ['galaxy-cluster-x'], new Set(), [])[1]).toEqual({
        cardId: 'galaxy-cluster-x',
        kind: 'focus',
        focusId: 'galaxy-cluster-x',
        capture: { keepFocus: true },
        outPath: SHOT,
      });
    });

    it('skips a structure whose shot exists, and --force brings it back', () => {
      const done = new Set([SHOT, 'public/images/featured/a.webp']);
      expect(selectCaptureTargets(tabs, ['galaxy-cluster-x'], done, [])).toEqual([]);
      expect(
        selectCaptureTargets(tabs, ['galaxy-cluster-x'], done, ['galaxy-cluster-x']).map(
          (t) => t.outPath,
        ),
      ).toEqual([SHOT]);
    });

    it('forcing an id shared with an image-overridden card recaptures the structure alone', () => {
      const shared = [
        tab('t1', [focusCard('void-x', { image: '/images/structures/void-x.webp' })]),
      ];
      const out = selectCaptureTargets(shared, ['void-x'], new Set(), ['void-x']);
      expect(out.map((t) => t.outPath)).toEqual(['public/images/structures/void-x.webp']);
    });
  });
});
