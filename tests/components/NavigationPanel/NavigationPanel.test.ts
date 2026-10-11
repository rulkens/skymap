// @vitest-environment jsdom
/**
 * Keyboard-binding label sync canary: if a shortcut is rebound in App.tsx but
 * the cheatsheet is forgotten, this is what fails.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import NavigationPanel from '../../../src/components/NavigationPanel/NavigationPanel';

describe('NavigationPanel', () => {
  it('lists the keyboard shortcuts', () => {
    render(createElement(NavigationPanel, {}));
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText(/search galaxies/i)).toBeInTheDocument();
  });
});
