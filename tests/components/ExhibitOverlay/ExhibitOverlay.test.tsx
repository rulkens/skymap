// @vitest-environment jsdom
//
// The hide toggle is the only control that survives `hidden`. jsdom has no
// stylesheet from CSS modules, so the visual fade is eyeballed; what this pins
// is the wiring: the click, aria-pressed, the wrapper the stylesheet keys on,
// and the notes cover the toggle takes away with the copy.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExhibitOverlay from '../../../src/components/ExhibitOverlay/ExhibitOverlay';
import styles from '../../../src/components/ExhibitOverlay/ExhibitOverlay.module.css';
import type { ExhibitSection } from '../../../src/@types/exhibits/ExhibitSection';
import type { ViewCover } from '../../../src/@types/layout/ViewCover';

const NOTE: ExhibitSection = { kind: { Component: () => <p>A note</p> }, data: null };

function setup(body: readonly ExhibitSection[] = []) {
  const onNotesCover = vi.fn<(cover: ViewCover | null) => void>();
  render(
    <ExhibitOverlay
      label="Voyager"
      lede="Two probes"
      body={body}
      enterDelaySec={0}
      onExit={vi.fn<() => void>()}
      onNotesCover={onNotesCover}
      onCaptionCover={vi.fn<(cover: ViewCover | null) => void>()}
    />,
  );
  return { onNotesCover };
}

describe('ExhibitOverlay hide toggle', () => {
  it('flips aria-pressed and the label on click, and back', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Hide exhibit' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    const shown = screen.getByRole('button', { name: 'Show exhibit' });
    expect(shown).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(shown);
    expect(screen.getByRole('button', { name: 'Hide exhibit' })).toBeInTheDocument();
  });

  it('keeps the toggle outside the faded content, so only it survives hidden', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Hide exhibit' }));
    const content = document.querySelector(`.${styles.content}`);
    expect(content).toContainElement(screen.getByText('Voyager'));
    expect(content).toContainElement(screen.getByText('Exit view'));
    expect(content).not.toContainElement(screen.getByRole('button', { name: 'Show exhibit' }));
    expect(document.querySelector(`.${styles.root}`)).toHaveClass(styles.hidden as string);
  });

  it('clears the notes cover while hidden and restores it when shown again', () => {
    const { onNotesCover } = setup([NOTE]);
    expect(onNotesCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide exhibit' }));
    expect(onNotesCover).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Show exhibit' }));
    expect(onNotesCover).toHaveBeenLastCalledWith(expect.objectContaining({ edge: 'right' }));
  });
});
