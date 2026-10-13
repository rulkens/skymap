// @vitest-environment jsdom
//
// The hide toggle is the only control that survives `hidden`. jsdom has no
// stylesheet from CSS modules, so the visual fade is eyeballed; what this pins
// is the wiring: the click, aria-pressed, and the wrapper the stylesheet keys on.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExhibitOverlay from '../../../src/components/ExhibitOverlay/ExhibitOverlay';
import styles from '../../../src/components/ExhibitOverlay/ExhibitOverlay.module.css';

function setup() {
  return render(
    <ExhibitOverlay
      label="Voyager"
      lede="Two probes"
      body={[]}
      enterDelaySec={0}
      onExit={vi.fn<() => void>()}
    />,
  );
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
});
