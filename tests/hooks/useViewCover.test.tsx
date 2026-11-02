// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useRef } from 'react';
import { useViewCover } from '../../src/hooks/useViewCover';
import { createTestStore } from '../support/createTestStore';
import { viewCoverRoute } from '../../src/store/constants';
import type { CoverEdge } from '../../src/@types/layout/CoverEdge';

function Panel({ edge, active }: { edge: CoverEdge; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewCover('phoneBottom', ref, edge, active);
  return <div ref={ref} />;
}

function setup(edge: CoverEdge, active: boolean) {
  const { store } = createTestStore();
  const view = render(
    <Provider store={store}>
      <Panel edge={edge} active={active} />
    </Provider>,
  );
  const rerender = (next: boolean) =>
    view.rerender(
      <Provider store={store}>
        <Panel edge={edge} active={next} />
      </Provider>,
    );
  return { row: () => store.getState()[viewCoverRoute].phoneBottom, rerender };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useViewCover', () => {
  it('reports the reach from its edge', () => {
    vi.stubGlobal('innerHeight', 1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 859.6,
    } as DOMRect);
    const { row } = setup('bottom', true);
    expect(row()).toEqual({ edge: 'bottom', reachPx: 140 });
  });

  it('clears its row when it turns inactive', () => {
    const { row, rerender } = setup('bottom', true);
    expect(row()).toBeDefined();
    rerender(false);
    expect(row()).toBeUndefined();
  });
});
