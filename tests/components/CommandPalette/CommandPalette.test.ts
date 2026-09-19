// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import CommandPalette from '../../../src/components/CommandPalette/CommandPalette';
import { Source } from '../../../src/data/sources';
import type { FamousGalaxyMetaEntry } from '../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';

// The empty-query grid renders this one fixture tab instead of the real
// (75-card) FEATURED_TABS, so a card lookup by name is unambiguous.
vi.mock('../../../src/data/palette/featuredTabs', () => ({
  FEATURED_TABS: [
    {
      id: 'highlights',
      label: 'Highlights',
      cards: [
        {
          id: 'body-earth',
          label: 'Earth',
          blurb: 'A rocky planet.',
          action: { kind: 'focus', focusId: 'body-earth' },
        },
      ],
    },
  ],
}));

const M31: FamousGalaxyMetaEntry = {
  id: 'm31',
  names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
  description: 'The nearest large spiral galaxy.',
  type: 'Sb',
};

const NGC4565: AliasIndexEntry = {
  pgc: 42038,
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
        entries: [M31],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    // Typing hides the featured grid (Q1), so the only 'M31' node left is
    // the results-list row — no ambiguity with the grid's own card.
    const input = screen.getByPlaceholderText(/search galaxies/i);
    await user.type(input, 'M31');
    await user.click(await screen.findByText('M31'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'm31' });
  });

  it('surfaces a structure when searched and routes it to onSelect by its durable id', async () => {
    const onSelect = vi.fn<(action: { kind: 'focus'; focusId: string }) => void>();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [],
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
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'cluster-coma' });
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

  it('clicking a card selects its action', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(CommandPalette, {
        entries: [],
        open: true,
        onClose: () => {},
        onSelect,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Earth' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'body-earth' });
  });

  it('a card whose image fails shows its label as a text tile', () => {
    render(
      createElement(CommandPalette, {
        entries: [],
        open: true,
        onClose: () => {},
        onSelect: () => {},
      }),
    );
    const card = screen.getByRole('button', { name: 'Earth' });
    const img = card.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('Earth');
  });
});
