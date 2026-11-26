// @vitest-environment jsdom
/**
 * PanelSection keeps a folded body mounted, inert, until its fold-up transition
 * finishes, and unmounts it at once when nothing is running. A new contentKey
 * slides the body, unless motion is reduced.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import PanelSection from '../../../../../../tools/mcpm-workbench/src/ui/panel/PanelSection/PanelSection';

function Harness(): ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <PanelSection title="Stats" icon={null} open={open} onToggle={() => setOpen((v) => !v)}>
      <button type="button">inside</button>
    </PanelSection>
  );
}

const fold = (): void => void fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
const flush = (): Promise<void> => act(async () => {});

/** One fake running transition per fold, finished by hand. */
function fakeTransitions(): { finish: () => void } {
  let finish = (): void => {};
  Element.prototype.getAnimations = function () {
    const finished = new Promise<Animation>((resolve) => {
      finish = () => resolve({} as Animation);
    });
    return [{ finished } as Animation];
  };
  return { finish: () => finish() };
}

afterEach(() => {
  delete (Element.prototype as Partial<Element>).getAnimations;
  delete (Element.prototype as Partial<Element>).animate;
  delete (window as Partial<Window>).matchMedia;
});

describe('PanelSection icon tip', () => {
  it('describes the fold button and stays out of its name', () => {
    render(
      <PanelSection title="Stats" icon={null} iconTip="60 fps" open onToggle={() => {}}>
        <span />
      </PanelSection>,
    );
    expect(screen.getByRole('button', { name: 'Stats', description: '60 fps' })).toBeDefined();
  });
});

describe('PanelSection fold-up', () => {
  it('unmounts at once when no transition runs', async () => {
    render(<Harness />);
    fold();
    await flush();
    expect(screen.queryByText('inside')).toBeNull();
  });

  it('keeps the body mounted and inert until the transition finishes', async () => {
    const transitions = fakeTransitions();
    render(<Harness />);
    fold();
    await flush();
    expect(screen.getByText('inside').closest('[inert]')).not.toBeNull();
    transitions.finish();
    await flush();
    expect(screen.queryByText('inside')).toBeNull();
  });

  it('stays open when unfolded before the fold-up ends', async () => {
    const transitions = fakeTransitions();
    render(<Harness />);
    const inside = screen.getByText('inside');
    fold();
    await flush();
    fold();
    transitions.finish();
    await flush();
    // The same element: kept, not unmounted and mounted afresh.
    expect(screen.getByText('inside')).toBe(inside);
    expect(inside.closest('[inert]')).toBeNull();
  });

  it('plays a running grow backwards on fold and forwards again on unfold', async () => {
    const grow = { reverses: 0 };
    Element.prototype.getAnimations = () => [
      {
        animationName: 'reveal',
        playState: 'running',
        finished: new Promise<Animation>(() => {}),
        reverse: () => void grow.reverses++,
      } as unknown as Animation,
    ];
    render(<Harness />);
    fold();
    await flush();
    expect(grow.reverses).toBe(1);
    fold();
    await flush();
    expect(grow.reverses).toBe(2);
  });
});

describe('PanelSection content slide', () => {
  it('slides only when contentKey changes, and never under reduced motion', () => {
    let slides = 0;
    let reduced = false;
    Element.prototype.animate = () => (slides++, {} as Animation);
    window.matchMedia = () => ({ matches: reduced }) as MediaQueryList;
    const section = (key: string): ReactNode => (
      <PanelSection title="Rendering" icon={null} open onToggle={() => {}} contentKey={key}>
        <span />
      </PanelSection>
    );
    const { rerender } = render(section('raymarch'));
    rerender(section('raymarch'));
    expect(slides).toBe(0);
    rerender(section('agents'));
    expect(slides).toBe(1);
    reduced = true;
    rerender(section('pathTracer'));
    expect(slides).toBe(1);
  });
});
