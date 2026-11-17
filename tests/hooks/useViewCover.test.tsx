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

// The callback ref runs before the hook's effect, so the measure sees the scroll.
function ScrolledPanel({ scrollTop, onCover }: { scrollTop: number; onCover: OnCover }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewCover(ref, 'bottom', true, onCover);
  const column = (el: HTMLDivElement | null) => {
    if (el) Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  };
  return (
    <div ref={column}>
      <div ref={ref} />
    </div>
  );
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
  it('reports the reach from its edge and the span along it', () => {
    vi.stubGlobal('innerHeight', 1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 859.6,
      left: 20.4,
      right: 300.2,
    } as DOMRect);
    const { onCover } = setup('bottom', true);
    expect(onCover).toHaveBeenLastCalledWith({ edge: 'bottom', reachPx: 140, spanPx: [20, 300] });
  });

  it("measures a side panel's span down from the top", () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      bottom: 900,
      right: 320,
    } as DOMRect);
    const { onCover } = setup('left', true);
    expect(onCover).toHaveBeenLastCalledWith({ edge: 'left', reachPx: 320, spanPx: [500, 900] });
  });

  it('reports the same reach from a scrolled column as from an unscrolled one', () => {
    vi.stubGlobal('innerHeight', 1000);
    const reachAt = (scrollTop: number) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 600 - scrollTop,
        left: 0,
        right: 400,
      } as DOMRect);
      const onCover = vi.fn<OnCover>();
      render(<ScrolledPanel scrollTop={scrollTop} onCover={onCover} />).unmount();
      return onCover.mock.calls[0]?.[0];
    };
    expect(reachAt(0)).toEqual({ edge: 'bottom', reachPx: 400, spanPx: [0, 400] });
    expect(reachAt(250)).toEqual({ edge: 'bottom', reachPx: 400, spanPx: [0, 400] });
  });

  it('reports null when it turns inactive', () => {
    const { onCover, rerender } = setup('bottom', true);
    expect(onCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'bottom' }));
    rerender(false);
    expect(onCover).toHaveBeenLastCalledWith(null);
  });
});
