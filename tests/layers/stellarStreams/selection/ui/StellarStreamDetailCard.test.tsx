// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import StellarStreamDetailCard from '../../../../../src/layers/stellarStreams/selection/ui/StellarStreamDetailCard/StellarStreamDetailCard';
import { stellarStreamsSelectionKinds } from '../../../../../src/layers/stellarStreams/selection/kinds';
import type { StellarStreamSelectionRow } from '../../../../../src/layers/stellarStreams/selection/@types/StellarStreamSelectionRow';
import { SAGITTARIUS } from '../../fixtures/streamMeta';

const { anchorMpc, ...rest } = SAGITTARIUS;
const row: StellarStreamSelectionRow = {
  ...rest,
  type: 'stellarStream',
  positionMpc: [anchorMpc[0], anchorMpc[1], anchorMpc[2]],
  radiusMpc: 0.137,
};

describe('StellarStreamDetailCard', () => {
  it('the detail card shows the N-body kind line for Sagittarius and the width dash', () => {
    const target = stellarStreamsSelectionKinds[0]!.toFocusable(row);
    render(createElement(StellarStreamDetailCard, { target }));
    expect(screen.getByText('Dwarf-galaxy debris, N-body model')).toBeTruthy();
    expect(screen.getByText('Extent')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
