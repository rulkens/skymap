// @vitest-environment jsdom
/**
 * Tests for NavigationPanel.
 *
 * NavigationPanel is a static cheatsheet — no props (or just isMobile),
 * no callbacks.  Its collapse state lives in the shared Panel
 * component (covered by Panel's own tests).  These tests function as
 * a "keyboard-binding label sync canary": if someone rebinds a
 * shortcut in App.tsx but forgets the cheatsheet, this surface is
 * what catches it.
 *
 * Pre-jsdom this used `>Esc<` substring matches over SSR markup to
 * pin Esc to a left-column key cell rather than picking up the letter
 * "E" inside random labels.  jsdom + getByText with a regex anchored
 * to a single-token string fills the same role with a more readable
 * selector.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import NavigationPanel, {
  type NavigationPanelProps,
} from '../../../src/components/NavigationPanel/NavigationPanel';

describe('NavigationPanel', () => {
  it('renders the NAVIGATION header', () => {
    render(createElement(NavigationPanel, {}));
    expect(
      screen.getByRole('button', { name: /NAVIGATION/i }),
    ).toBeInTheDocument();
  });

  it('renders every gesture/key on the left column', () => {
    render(createElement(NavigationPanel, {}));
    expect(screen.getByText('Drag')).toBeInTheDocument();
    expect(screen.getByText('Wheel')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
    // Cmd / Ctrl / slash hint for the command palette — accept any of
    // the three glyphs the panel might surface.
    expect(screen.getByText(/⌘K|Ctrl\+K|\//)).toBeInTheDocument();
  });

  it('renders every action label on the right column', () => {
    render(createElement(NavigationPanel, {}));
    expect(screen.getByText(/orbit camera/i)).toBeInTheDocument();
    expect(screen.getByText(/zoom/i)).toBeInTheDocument();
    expect(screen.getByText(/home view/i)).toBeInTheDocument();
    expect(screen.getByText(/focus selected/i)).toBeInTheDocument();
    expect(screen.getByText(/clear selection/i)).toBeInTheDocument();
    expect(screen.getByText(/search galaxies/i)).toBeInTheDocument();
  });

  it('mounts open by default (Panel aria-expanded="true")', () => {
    render(createElement(NavigationPanel, {}));
    expect(
      screen.getByRole('button', { name: /NAVIGATION/i }),
    ).toHaveAttribute('aria-expanded', 'true');
    // Body content visible — pick a row that's load-bearing for "open".
    expect(screen.getByText(/orbit camera/i)).toBeInTheDocument();
  });

  it('shows touch gestures and hides keyboard shortcuts when isMobile=true', () => {
    // Typed variable rather than inline object literal: TS's
    // React.createElement overloads sometimes resolve to the no-props
    // signature when the component has destructured-with-default props,
    // which makes inline `{ isMobile: true }` look like a stray Attribute.
    const props: NavigationPanelProps = { isMobile: true };
    render(createElement(NavigationPanel, props));
    expect(screen.getByText(/One-finger drag/i)).toBeInTheDocument();
    expect(screen.getByText(/Two-finger pinch/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap a galaxy/i)).toBeInTheDocument();
    expect(screen.getByText(/× on info card/i)).toBeInTheDocument();
    // Keyboard-only shortcuts should NOT appear on the mobile
    // cheatsheet — they'd be misleading because phones have no Esc /
    // F / H keys.  Use queryByText (not get) so absence doesn't throw.
    expect(screen.queryByText('Esc')).not.toBeInTheDocument();
    expect(screen.queryByText(/search galaxies/i)).not.toBeInTheDocument();
  });
});
