// @vitest-environment jsdom
//
// StructureDetailCardContainer — store-boundary coverage for the pinned
// structure card's live "Galaxies" row.
//
// The container's whole job is to read the galaxyCatalog Layer's published
// `structureMemberCount` fact and hand it to the pure card as `memberCount`.
// These tests drive a real store (createAppStore + <Provider>), seed and patch
// the fact via `layerFactsSeeded`/`factsReported` (the same actions the Layer's
// frame reconcile dispatches), and assert the rendered row tracks it while the
// identity rows (name, distance) stay put.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import StructureDetailCardContainer from '../../../src/components/containers/StructureDetailCardContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { layerFactsSeeded, factsReported } from '../../../src/state/engine/engineSlice';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// Render probe: wrap the real StructureDetailCard so we can count how many
// times the container actually renders it. A same-count fact patch must leave
// the counter untouched — that's the memo/selector suppression, proven by
// mechanism rather than by output stability alone. The `mock` prefix lets
// vitest's hoisted factory reference the counter.
const mockCardRenderProbe = { count: 0 };
vi.mock('../../../src/components/InfoCard/StructureDetailCard/StructureDetailCard', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/components/InfoCard/StructureDetailCard/StructureDetailCard')
  >('../../../src/components/InfoCard/StructureDetailCard/StructureDetailCard');
  return {
    ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => {
      mockCardRenderProbe.count += 1;
      return createElement(actual.default, props);
    },
  };
});

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function seedMemberCount(store: ReturnType<typeof createAppStore>['store'], count: number | null) {
  store.dispatch(
    layerFactsSeeded({
      layer: 'galaxyCatalog',
      facts: { famousMeta: [], provenanceCounts: {}, aliasIndex: [], structureMemberCount: count },
    }),
  );
}

describe('StructureDetailCardContainer', () => {
  it('Galaxies row updates from the structureMemberCount fact', () => {
    const { store } = createAppStore();
    seedMemberCount(store, 3);

    render(createElement(StructureDetailCardContainer, { target: virgo, pinned: true }), {
      wrapper: makeWrapper(store),
    });

    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    act(() => {
      store.dispatch(factsReported({ layer: 'galaxyCatalog', patch: { structureMemberCount: 7 } }));
    });

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
  });

  it('identity rows do not re-render when the fact patch repeats the same count', () => {
    const { store } = createAppStore();
    seedMemberCount(store, 3);

    render(createElement(StructureDetailCardContainer, { target: virgo, pinned: true }), {
      wrapper: makeWrapper(store),
    });

    const rendersBeforeTick = mockCardRenderProbe.count;

    act(() => {
      store.dispatch(factsReported({ layer: 'galaxyCatalog', patch: { structureMemberCount: 3 } }));
    });

    expect(mockCardRenderProbe.count).toBe(rendersBeforeTick);
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('drops the Galaxies row when the count is not yet computable', () => {
    render(createElement(StructureDetailCardContainer, { target: virgo, pinned: true }), {
      wrapper: makeWrapper(createAppStore().store),
    });

    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    expect(screen.queryByText('Galaxies')).toBeNull();
  });
});
