// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import StellarStreamDetailCard from '../../../../../src/layers/stellarStreams/selection/ui/StellarStreamDetailCard/StellarStreamDetailCard';
import { stellarStreamsSelectionKinds } from '../../../../../src/layers/stellarStreams/selection/kinds';
import type { StellarStreamSelectionRow } from '../../../../../src/layers/stellarStreams/selection/@types/StellarStreamSelectionRow';
import type { StellarStreamMeta } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import { GD_1, SAGITTARIUS, SHORT } from '../../fixtures/streamMeta';

function rowOf({ anchorMpc, ...rest }: StellarStreamMeta): StellarStreamSelectionRow {
  return {
    ...rest,
    type: 'stellarStream',
    positionMpc: [anchorMpc[0], anchorMpc[1], anchorMpc[2]],
    radiusMpc: 0.137,
    focusRegion: 'subjectOnly',
  };
}
const renderCard = (meta: StellarStreamMeta) =>
  render(
    createElement(StellarStreamDetailCard, {
      target: stellarStreamsSelectionKinds[0]!.toFocusable(rowOf(meta)),
    }),
  );

describe('StellarStreamDetailCard', () => {
  it('the detail card shows the N-body kind line for Sagittarius, and no Width row without a width', () => {
    renderCard(SAGITTARIUS);
    expect(screen.getByText('Dwarf-galaxy debris, N-body model')).toBeTruthy();
    expect(screen.getByText('Extent')).toBeTruthy();
    expect(screen.queryByText('Width')).toBeNull();
    cleanup();
    renderCard(GD_1);
    expect(screen.getByText('0.2°')).toBeTruthy();
  });

  it('a measured [Fe/H] gets a Metallicity row with its source; a defaulted one gets none', () => {
    renderCard(SHORT);
    expect(screen.getByText('[Fe/H] \u22121.41 (Harris 1996, 2010 ed.)')).toBeTruthy();
    cleanup();
    renderCard(SAGITTARIUS);
    expect(screen.queryByText('Metallicity')).toBeNull();
  });

  it('a published stellar mass gets a Stellar mass row, "≥" when partial; none gets no row', () => {
    renderCard(GD_1);
    expect(screen.getByText('≥ 2 × 10⁴ M☉ (Koposov+ 2010)')).toBeTruthy();
    cleanup();
    renderCard({ ...GD_1, stellarMass: { massMsun: 1.4e3, ref: 'X+ 2020', partial: false } });
    expect(screen.getByText('1.4 × 10³ M☉ (X+ 2020)')).toBeTruthy();
    cleanup();
    renderCard(SAGITTARIUS);
    expect(screen.queryByText('Stellar mass')).toBeNull();
  });

  it('a stream with an article gets a Wikipedia link and its blurb; one without gets neither', () => {
    renderCard(SAGITTARIUS);
    expect(screen.getByText('The tidal debris of the Sagittarius dwarf galaxy.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Wikipedia' }).getAttribute('href')).toBe(
      'https://en.wikipedia.org/wiki/Sagittarius_Stream',
    );
    cleanup();
    renderCard(GD_1);
    expect(screen.queryByText('Learn more')).toBeNull();
  });
});
