// @vitest-environment jsdom
//
// jsdom has no stylesheet from CSS modules, so looks are eyeballed in shots; what this pins
// is the wiring: the hide toggle (the only control that survives `hidden`) and the notes
// cover it takes away, the section scale's jumps and its `aria-current`, and Exit.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExhibitOverlay from '../../../src/components/ExhibitOverlay/ExhibitOverlay';
import styles from '../../../src/components/ExhibitOverlay/ExhibitOverlay.module.css';
import type { ExhibitSection } from '../../../src/@types/exhibits/ExhibitSection';
import type { ViewCover } from '../../../src/@types/layout/ViewCover';

const NOTE: ExhibitSection = { kind: { Component: () => <p>A note</p> }, data: null };

function setup(body: readonly ExhibitSection[] = []) {
  const onNotesCover = vi.fn<(cover: ViewCover | null) => void>();
  const onExit = vi.fn<() => void>();
  render(
    <ExhibitOverlay
      label="Voyager"
      lede="Two probes"
      body={body}
      enterDelaySec={0}
      learnedGestures={{ look: false, zoom: false }}
      onExit={onExit}
      onNotesCover={onNotesCover}
      onCaptionCover={vi.fn<(cover: ViewCover | null) => void>()}
    />,
  );
  return { onNotesCover, onExit };
}

describe('ExhibitOverlay hide toggle', () => {
  it('flips its label on click, and back', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Hide text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show text' }));
    expect(screen.getByRole('button', { name: 'Hide text' })).toBeInTheDocument();
  });

  it('keeps the toggle outside the faded content, so only it survives hidden', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Hide text' }));
    const content = document.querySelector(`.${styles.content}`);
    expect(content).toContainElement(screen.getByText('Voyager'));
    expect(content).toContainElement(screen.getByText('Exit view'));
    expect(content).not.toContainElement(screen.getByRole('button', { name: 'Show text' }));
    expect(document.querySelector(`.${styles.root}`)).toHaveClass(styles.hidden as string);
  });

  it('clears the notes cover while hidden and restores it when shown again', () => {
    const { onNotesCover } = setup([NOTE]);
    expect(onNotesCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide text' }));
    expect(onNotesCover).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Show text' }));
    expect(onNotesCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'right' }));
  });
});

const SECTIONS: readonly ExhibitSection[] = ['One', 'Two', 'Three'].map((text) => ({
  kind: { Component: () => <h2>{text}</h2> },
  data: null,
}));

const sectionGroup = (text: string): Element => screen.getByText(text).parentElement!;
const tick = (n: number): HTMLElement => screen.getByRole('button', { name: `Section ${n} of 3` });

function placeTop(el: Element, top: number): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
}

/** A scroller with room left below, so a scroll is never read as being at its end. */
function scrollerMidway(): Element {
  const scroller = sectionGroup('One').parentElement!;
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
  Object.defineProperty(scroller, 'clientHeight', { value: 300 });
  placeTop(scroller, 40);
  return scroller;
}

describe('ExhibitOverlay section scale', () => {
  const scrollIntoView = vi.fn<(arg?: ScrollIntoViewOptions | boolean) => void>();
  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockClear();
    vi.restoreAllMocks();
  });

  it('marks the first section current before any scroll', () => {
    setup(SECTIONS);
    expect(tick(1)).toHaveAttribute('aria-current', 'step');
    expect(tick(2)).not.toHaveAttribute('aria-current');
  });

  it('jumps to a section and marks it current at once', () => {
    setup(SECTIONS);
    fireEvent.click(tick(3));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(sectionGroup('Three'));
    expect(tick(3)).toHaveAttribute('aria-current', 'step');
    expect(tick(1)).not.toHaveAttribute('aria-current');
  });

  it('follows the reader as the notes scroll past each heading', () => {
    setup(SECTIONS);
    const scroller = scrollerMidway();
    placeTop(sectionGroup('One'), -300);
    placeTop(sectionGroup('Two'), 60);
    placeTop(sectionGroup('Three'), 400);
    fireEvent.scroll(scroller);
    expect(tick(2)).toHaveAttribute('aria-current', 'step');
  });

  it('holds a jumped-to section through the scroll it causes, until the reader scrolls', () => {
    setup(SECTIONS);
    const scroller = scrollerMidway();
    placeTop(sectionGroup('One'), -600);
    placeTop(sectionGroup('Two'), -300);
    placeTop(sectionGroup('Three'), 60);
    fireEvent.click(tick(2));
    fireEvent.scroll(scroller);
    expect(tick(2)).toHaveAttribute('aria-current', 'step');
    fireEvent.wheel(scroller);
    fireEvent.scroll(scroller);
    expect(tick(3)).toHaveAttribute('aria-current', 'step');
  });

  it('marks the last section once its box is scrolled to the end', () => {
    setup(SECTIONS);
    const scroller = scrollerMidway();
    placeTop(sectionGroup('One'), -300);
    placeTop(sectionGroup('Two'), 60);
    placeTop(sectionGroup('Three'), 200);
    Object.defineProperty(scroller, 'scrollTop', { value: 700 });
    fireEvent.scroll(scroller);
    expect(tick(3)).toHaveAttribute('aria-current', 'step');
  });

  it('leaves Exit and Escape as they were: the button exits, Escape still reaches the document', () => {
    const { onExit } = setup(SECTIONS);
    const keys = vi.fn<(e: KeyboardEvent) => void>();
    document.addEventListener('keydown', keys);
    tick(2).focus();
    fireEvent.keyDown(tick(2), { key: 'Escape' });
    document.removeEventListener('keydown', keys);
    expect(keys).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    fireEvent.click(screen.getByRole('button', { name: /Exit view/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
