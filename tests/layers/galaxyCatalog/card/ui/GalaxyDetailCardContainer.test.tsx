// @vitest-environment jsdom
//
// A famous galaxy's card opens named (the compiled-in table) and fills in its sidecar prose,
// the description and morphology, the moment the Layer's `famousMeta` fact lands.

import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import GalaxyDetailCardContainer from '../../../../../src/layers/galaxyCatalog/card/ui/GalaxyDetailCardContainer';
import { galaxyCatalogSelectionKinds } from '../../../../../src/layers/galaxyCatalog/selection/kinds';
import { extractGalaxyRow } from '../../../../../src/layers/galaxyCatalog/records/present/extractGalaxyRow';
import { placedGalaxyRow } from '../../../../../src/layers/galaxyCatalog/selection/utils/placedGalaxyRow';
import { FAMOUS_GALAXY_NAMES } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated';
import { createTestStore } from '../../../../support/createTestStore';
import { factsReported, layerFactsSeeded } from '../../../../../src/state/engine/engineSlice';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { Source } from '../../../../../src/data/source';
import type { FamousGalaxyMetaEntry } from '../../../../../src/@types/loading/FamousGalaxyMetaEntry';

const m31Index = FAMOUS_GALAXY_NAMES.findIndex((name) => name.id === 'm31');
const m31Meta: FamousGalaxyMetaEntry = {
  ...FAMOUS_GALAXY_NAMES[m31Index]!,
  names: [...FAMOUS_GALAXY_NAMES[m31Index]!.names],
  description: 'The nearest large spiral galaxy.',
  type: 'SBb',
};
const row = extractGalaxyRow(
  makeGalaxyCatalog(FAMOUS_GALAXY_NAMES.length),
  m31Index,
  Source.FamousGalaxy,
)!;
const target = galaxyCatalogSelectionKinds[0]!.toFocusable(placedGalaxyRow(row));

describe('GalaxyDetailCardContainer', () => {
  it('names a famous galaxy at once and adds its prose when the sidecar fact lands', () => {
    const { store } = createTestStore();
    const facts = {
      famousMeta: [],
      provenanceCounts: {},
      aliasIndex: [],
      structureMemberCount: null,
    };
    store.dispatch(layerFactsSeeded({ layer: 'galaxyCatalog', facts }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    render(createElement(GalaxyDetailCardContainer, { target, isPinned: true }), { wrapper });
    expect(screen.getByText('Andromeda Galaxy')).toBeInTheDocument();
    expect(screen.queryByText(m31Meta.description)).toBeNull();

    act(() => {
      store.dispatch(factsReported({ layer: 'galaxyCatalog', patch: { famousMeta: [m31Meta] } }));
    });
    expect(screen.getByText(m31Meta.description)).toBeInTheDocument();
    expect(screen.getByText('Barred spiral (SBb)')).toBeInTheDocument();
  });
});
