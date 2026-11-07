// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import StellarStreamDetailCard from '../../../../../src/layers/stellarStreams/selection/ui/StellarStreamDetailCard/StellarStreamDetailCard';
import { stellarStreamsSelectionKinds } from '../../../../../src/layers/stellarStreams/selection/kinds';
import type { StellarStreamSelectionRow } from '../../../../../src/layers/stellarStreams/selection/@types/StellarStreamSelectionRow';
import type { StellarStreamMeta } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import { SAGITTARIUS, SHORT } from '../../fixtures/streamMeta';

function rowOf({ anchorMpc, ...rest }: StellarStreamMeta): StellarStreamSelectionRow {
  return {
    ...rest,
    type: 'stellarStream',
    positionMpc: [anchorMpc[0], anchorMpc[1], anchorMpc[2]],
    radiusMpc: 0.137,
  };
}
const renderCard = (meta: StellarStreamMeta) =>
  render(
    createElement(StellarStreamDetailCard, {
      target: stellarStreamsSelectionKinds[0]!.toFocusable(rowOf(meta)),
    }),
  );

describe('StellarStreamDetailCard', () => {
  it('the detail card shows the N-body kind line for Sagittarius and the width dash', () => {
    renderCard(SAGITTARIUS);
    expect(screen.getByText('Dwarf-galaxy debris, N-body model')).toBeTruthy();
    expect(screen.getByText('Extent')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('a measured [Fe/H] gets a Metallicity row with its source; a defaulted one gets none', () => {
    renderCard(SHORT);
    expect(screen.getByText('[Fe/H] \u22121.41 (Harris 1996, 2010 ed.)')).toBeTruthy();
    cleanup();
    renderCard(SAGITTARIUS);
    expect(screen.queryByText('Metallicity')).toBeNull();
  });
});
