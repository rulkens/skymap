// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import CollapsibleSection from '../../../src/components/SettingsPanel/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('toggles aria-expanded on the header button when clicked', async () => {
    // Why aria-expanded rather than visibility?  The body is a CSS-Grid
    // child whose `grid-template-rows` animates from 0fr to 1fr — the
    // body element stays mounted in both states.  CSS-modules class
    // names don't actually load styles in jsdom, so visibility checks
    // would lie either way.  aria-expanded is the stable, intent-level
    // contract: assistive tech reads it; we should test it.
    const user = userEvent.setup();
    render(
      createElement(CollapsibleSection, {
        title: 'Display',
        defaultOpen: false,
        children: createElement('p', null, 'body content'),
      }),
    );
    const header = screen.getByRole('button', { name: /display/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a header whose initial aria-expanded reflects defaultOpen', () => {
    render(
      createElement(CollapsibleSection, {
        title: 'Display',
        defaultOpen: true,
        children: 'body',
      }),
    );
    expect(screen.getByRole('button', { name: /display/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('honors the headerToggleIndeterminate prop on the master checkbox', () => {
    // The DOM IDL for HTMLInputElement.indeterminate is settable but
    // not reflected as an attribute, so it only shows up in a real DOM.
    // The component sets it imperatively in useEffect against a ref;
    // jsdom exercises that effect.
    //
    // The master checkbox only renders when BOTH headerToggle and
    // onHeaderToggleChange are supplied, so this test wires both.
    render(
      createElement(CollapsibleSection, {
        title: 'Display',
        defaultOpen: true,
        headerToggle: false,
        onHeaderToggleChange: () => {},
        headerToggleIndeterminate: true,
        children: 'body',
      }),
    );
    const toggle = screen.getByRole('checkbox', {
      name: /toggle display/i,
    }) as HTMLInputElement;
    expect(toggle.indeterminate).toBe(true);
  });

  it('calls onHeaderToggleChange when the master checkbox is flipped', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(CollapsibleSection, {
        title: 'Display',
        defaultOpen: true,
        headerToggle: false,
        onHeaderToggleChange: onChange,
        children: 'body',
      }),
    );
    await user.click(screen.getByRole('checkbox', { name: /toggle display/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps collapse independent of the master checkbox click', async () => {
    // The component stops propagation on the checkbox events so a click
    // on the checkbox doesn't bubble to the surrounding header <button>
    // and toggle the section open/closed.
    const user = userEvent.setup();
    render(
      createElement(CollapsibleSection, {
        title: 'Display',
        defaultOpen: true,
        headerToggle: false,
        onHeaderToggleChange: () => {},
        children: 'body',
      }),
    );
    const header = screen.getByRole('button', { name: /display/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('checkbox', { name: /toggle display/i }));
    // Section stays open; only the checkbox flipped.
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('a disabled CollapsibleSection does not fire its header toggle on click', () => {
    // Controlled checkbox: use fireEvent.click, the click's default action is
    // what we're asserting gets blocked (see the component's onClick guard).
    const onChange = vi.fn();
    render(
      createElement(CollapsibleSection, {
        title: 'HDR',
        defaultOpen: true,
        headerToggle: false,
        onHeaderToggleChange: onChange,
        disabled: true,
        disabledHint: 'Needs a display with HDR range',
        children: 'body',
      }),
    );
    const toggle = screen.getByRole('checkbox', { name: /toggle hdr/i }) as HTMLInputElement;
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAttribute('title', 'Needs a display with HDR range');
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
    expect(toggle.checked).toBe(false);
  });
});
