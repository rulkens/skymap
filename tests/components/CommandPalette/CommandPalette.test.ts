// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import CommandPalette from '../../../src/components/CommandPalette/CommandPalette';
import { Source } from '../../../src/data/sources';
import type { FamousGalaxyMetaEntry } from '../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';

const M31: FamousGalaxyMetaEntry = {
  id: 'm31',
  names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
  description: 'The nearest large spiral galaxy.',
  type: 'Sb',
};

// A famous entry whose id is NOT in FEATURED_IDS, so the empty-query
// state renders only the results list (no featured grid).  Avoids
// duplicate clickable nodes when we want to assert a single click
// dispatches selection exactly once.
const NGC1300: FamousGalaxyMetaEntry = {
  id: 'ngc1300',
  names: ['NGC 1300'],
  description: 'A barred spiral.',
  type: 'SBbc',
};

const NGC4565: AliasIndexEntry = {
  pgc: 42038n,
  names: ['NGC 4565', 'UGC 7772'],
  source: Source.Glade,
  localIdx: 1234,
};

const COMA: StructureSearchEntry = {
  id: 'cluster-coma',
  name: 'Coma Cluster',
  category: 'cluster',
  abell: 'A1656',
  description: 'X-ray cluster · z = 0.023',
};

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      createElement(CommandPalette, {
        entries: [M31],
        open: false,
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the famous list (not the alias list) when query is empty', () => {
    render(
      createElement(CommandPalette, {
        entries: [M31],
        aliasIndex: [NGC4565],
        open: true,
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    // The featured-grid button surfaces the proper name "Andromeda
    // Galaxy" via its aria-label, so we assert that as the canary that
    // the famous branch is rendering.
    expect(screen.getByRole('button', { name: /Focus Andromeda Galaxy/i })).toBeInTheDocument();
    // Alias rows are NOT shown for empty queries — confirms the 48k-row
    // perf guardrail still holds.
    expect(screen.queryByText('NGC 4565')).not.toBeInTheDocument();
  });

  it('reveals matching alias rows when the user types', async () => {
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [M31],
        aliasIndex: [NGC4565],
        open: true,
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    // The input has no explicit role override; the default role for
    // an <input> with no `type` attribute is "textbox".  Querying by
    // placeholder is the most stable selector since the placeholder
    // doubles as the documented affordance ("Search galaxies …").
    const input = screen.getByPlaceholderText(/search galaxies/i);
    await user.type(input, 'NGC 4565');
    expect(await screen.findByText('NGC 4565')).toBeInTheDocument();
  });

  it('calls onSelect when the user clicks a result', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [NGC1300],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    // NGC 1300 isn't in FEATURED_IDS, so the only clickable row that
    // surfaces its name is the results-list <li>.  This sidesteps the
    // ambiguity we'd hit with M31 (which shows up in BOTH the featured
    // grid button and the results-list row).
    await user.click(screen.getByText('NGC 1300'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('ngc1300');
  });

  it('routes the alias row to onSelect with its pgc- focus id', async () => {
    const onSelect = vi.fn<(focusId: string) => void>();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [M31],
        aliasIndex: [NGC4565],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    const input = screen.getByPlaceholderText(/search galaxies/i);
    await user.type(input, 'NGC 4565');
    await user.click(await screen.findByText('NGC 4565'));
    // The alias carries pgc 42038n → the durable id is the shared ladder's
    // 'pgc-<n>' rung; the container fires requestFocus(focusId) with it.
    expect(onSelect).toHaveBeenCalledWith('pgc-42038');
  });

  it('surfaces a structure when searched and routes it to onSelect by its durable id', async () => {
    const onSelect = vi.fn<(focusId: string) => void>();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [NGC1300],
        structures: [COMA],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    const input = screen.getByPlaceholderText(/search galaxies/i);
    // Search by the Abell number to also exercise the abell→names fold.
    await user.type(input, 'A1656');
    await user.click(await screen.findByText('Coma Cluster'));
    expect(onSelect).toHaveBeenCalledWith('cluster-coma');
  });

  it('does not show structure rows for an empty query', () => {
    render(
      createElement(CommandPalette, {
        entries: [NGC1300],
        structures: [COMA],
        open: true,
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    expect(screen.queryByText('Coma Cluster')).not.toBeInTheDocument();
  });

  it('routes the Milky Way row to onSelect with the Milky-Way focus id', async () => {
    const onSelect = vi.fn<(focusId: string) => void>();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [NGC1300],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    // The MW row is always present (empty query heads the list with it).
    await user.click(screen.getByTestId('milky-way-row'));
    expect(onSelect).toHaveBeenCalledWith('milkyWay');
  });

  it('surfaces the Milky Way command when searching "milky way"', async () => {
    const onSelect = vi.fn<(focusId: string) => void>();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [M31],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    const input = screen.getByPlaceholderText(/search galaxies/i);
    await user.type(input, 'milky way');
    const row = await screen.findByTestId('milky-way-row');
    expect(row).toBeInTheDocument();
    await user.click(row);
    expect(onSelect).toHaveBeenCalledWith('milkyWay');
  });

  it('calls onClose when the user presses Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [M31],
        open: true,
        onClose,
        onSelect: () => {},
      }),
    );
    // The keydown handler is bound to the backdrop div; focus needs
    // to be inside the dialog for the event to bubble up to it.  The
    // input auto-focuses on open via requestAnimationFrame, but that
    // doesn't run in jsdom timing — focus the input explicitly.
    screen.getByPlaceholderText(/search galaxies/i).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
