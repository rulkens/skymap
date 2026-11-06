// @vitest-environment jsdom
//
// A cold `#focus=star-sirius` link opens the card before the famous-star sidecar lands, and the
// selection row is never re-extracted. The curated block must arrive through the Layer's fact.

import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import StarDetailCardContainer from '../../../../../src/layers/starCatalog/card/ui/StarDetailCardContainer';
import { createTestStore } from '../../../../support/createTestStore';
import { factsReported, layerFactsSeeded } from '../../../../../src/state/engine/engineSlice';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import type { FamousStarMetaEntry } from '../../../../../src/@types/loading/FamousStarMetaEntry';
import type { StarCatalogTarget } from '../../../../../src/layers/starCatalog/@types/StarCatalogTarget';

const siriusMeta: FamousStarMetaEntry = {
  id: 'sirius',
  names: ['Sirius', 'Alpha Canis Majoris'],
  constellation: 'Canis Major',
  spectralType: 'A1V',
  distancePc: 2.64,
  magV: -1.46,
  absMag: 1.42,
  radiusSolar: 1.71,
  temperatureK: 9940,
  description: 'The brightest star in the night sky.',
};

const sirius: StarCatalogTarget = {
  type: 'starCatalog',
  ref: { type: 'starCatalog', source: Source.FamousStar, index: 3 },
  source: Source.FamousStar,
  index: 3,
  id: 'sirius',
  displayName: 'Sirius',
  x: 2.64 * SCALE_UNITS.PC_TO_MPC,
  y: 0,
  z: 0,
  distancePc: 2.64,
  detail: { kind: 'none' },
};

describe('StarDetailCardContainer', () => {
  it('fills in the curated block when the sidecar fact lands after the card opened', () => {
    const { store } = createTestStore();
    const facts = { famousStarsMeta: [], chunkSlotsError: null };
    store.dispatch(layerFactsSeeded({ layer: 'starCatalog', facts }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    render(createElement(StarDetailCardContainer, { target: sirius, isPinned: true }), {
      wrapper,
    });
    expect(screen.getByText('Sirius')).toBeInTheDocument();
    expect(screen.queryByText(siriusMeta.description)).toBeNull();

    const patch = { famousStarsMeta: [siriusMeta] };
    act(() => {
      store.dispatch(factsReported({ layer: 'starCatalog', patch }));
    });
    expect(screen.getByText(siriusMeta.description)).toBeInTheDocument();
    expect(screen.getByText('A1V')).toBeInTheDocument();
  });
});
