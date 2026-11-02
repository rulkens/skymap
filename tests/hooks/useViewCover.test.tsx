// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useViewCover } from '../../src/hooks/useViewCover';
import type { CoverEdge } from '../../src/@types/layout/CoverEdge';
import type { ViewCover } from '../../src/@types/layout/ViewCover';

type OnCover = (cover: ViewCover | null) => void;

function Panel({ edge, active, onCover }: { edge: CoverEdge; active: boolean; onCover: OnCover }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewCover(ref, edge, active, onCover);
  return <div ref={ref} />;
}

function setup(edge: CoverEdge, active: boolean) {
  const onCover = vi.fn<OnCover>();
  const view = render(<Panel edge={edge} active={active} onCover={onCover} />);
  const rerender = (next: boolean) =>
    view.rerender(<Panel edge={edge} active={next} onCover={onCover} />);
  return { onCover, rerender };
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
    const { onCover } = setup('bottom', true);
    expect(onCover).toHaveBeenLastCalledWith({ edge: 'bottom', reachPx: 140 });
  });

  it('reports null when it turns inactive', () => {
    const { onCover, rerender } = setup('bottom', true);
    expect(onCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'bottom' }));
    rerender(false);
    expect(onCover).toHaveBeenLastCalledWith(null);
  });
});
