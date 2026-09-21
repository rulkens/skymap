// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import CommandPalette from '../../../src/components/CommandPalette/CommandPalette';
import { Source } from '../../../src/data/sources';
import type { CommandPaletteProps } from '../../../src/components/CommandPalette/CommandPalette';
import type { FamousGalaxyMetaEntry } from '../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';
import type { PaletteTab } from '../../../src/@types/palette/PaletteTab';
import type { PaletteAction } from '../../../src/@types/palette/PaletteAction';

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

// Two tabs, one card each — enough to exercise tab filtering/switching
// without depending on the real (75-card) FEATURED_TABS.
const FIXTURE_TABS: readonly PaletteTab[] = [
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
      {
        id: 'body-saturn',
        label: 'Saturn',
        blurb: 'A ringed planet.',
        action: { kind: 'focus', focusId: 'body-saturn' },
      },
      {
        id: 'solarSystem',
        label: 'Solar System',
        blurb: 'Coming soon',
        action: { kind: 'view', viewId: 'solarSystem' },
      },
    ],
  },
  {
    id: 'missions',
    label: 'Missions',
    cards: [
      {
        id: 'body-hubble',
        label: 'Hubble',
        blurb: 'A telescope.',
        action: { kind: 'focus', focusId: 'body-hubble' },
      },
    ],
  },
];

const DEFAULTS: CommandPaletteProps = {
  entries: [],
  tabs: FIXTURE_TABS,
  tab: 'highlights',
  onTabChange: () => {},
  open: true,
  onClose: () => {},
  onSelect: () => {},
};

function renderPalette(overrides: Partial<CommandPaletteProps> = {}) {
  return render(createElement(CommandPalette, { ...DEFAULTS, ...overrides }));
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPalette({ entries: [M31], open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('reveals matching alias rows when the user types', async () => {
    const user = userEvent.setup();
    renderPalette({ entries: [M31], aliasIndex: [NGC4565] });
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
    renderPalette({ entries: [M31], onSelect });
    // Typing hides the featured grid (Q1), so the only 'M31' node left is
    // the results-list row — no ambiguity with the grid's own card.
    const input = screen.getByPlaceholderText(/search galaxies/i);
    await user.type(input, 'M31');
    await user.click(await screen.findByText('M31'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'm31' });
  });

  it('surfaces a structure when searched and routes it to onSelect by its durable id', async () => {
    const onSelect = vi.fn<(action: PaletteAction) => void>();
    const user = userEvent.setup();
    renderPalette({ structures: [COMA], onSelect });
    const input = screen.getByPlaceholderText(/search galaxies/i);
    // Search by the Abell number to also exercise the abell→names fold.
    await user.type(input, 'A1656');
    await user.click(await screen.findByText('Coma Cluster'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'cluster-coma' });
  });

  it('calls onClose when the user presses Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette({ entries: [M31], onClose });
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
    renderPalette({ onSelect });
    await user.click(screen.getByRole('button', { name: 'Earth' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'body-earth' });
  });

  it('a card whose image fails shows its label as a text tile', () => {
    renderPalette();
    const card = screen.getByRole('button', { name: 'Earth' });
    const img = card.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('Earth');
  });

  it('clicking a tab asks for it', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    renderPalette({ onTabChange });
    await user.click(screen.getByRole('tab', { name: 'Missions' }));
    expect(onTabChange).toHaveBeenCalledWith('missions');
  });

  it('ArrowRight then Enter selects the second card', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderPalette({ onSelect });
    screen.getByPlaceholderText(/search galaxies/i).focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'focus', focusId: 'body-saturn' });
  });

  it('Alt+ArrowRight asks for the next tab and wraps from the last', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const first = renderPalette({ onTabChange });
    screen.getByPlaceholderText(/search galaxies/i).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onTabChange).toHaveBeenCalledWith('missions');
    first.unmount();

    onTabChange.mockClear();
    renderPalette({ tab: 'missions', onTabChange });
    screen.getByPlaceholderText(/search galaxies/i).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onTabChange).toHaveBeenCalledWith('highlights');
  });

  it('a card’s failed image does not carry over to the same card in another tab', () => {
    // Same card id ('m31') in two tabs: Highlights uses the convention path
    // (no `image` override, so it 404s in the real app); Galaxies overrides it.
    const tabsWithSharedM31: readonly PaletteTab[] = [
      {
        id: 'highlights',
        label: 'Highlights',
        cards: [
          {
            id: 'm31',
            label: 'Andromeda Galaxy',
            blurb: '',
            action: { kind: 'focus', focusId: 'm31' },
          },
        ],
      },
      {
        id: 'galaxies',
        label: 'Galaxies',
        cards: [
          {
            id: 'm31',
            label: 'Andromeda Galaxy',
            blurb: '',
            image: '/images/famous/m31.webp',
            action: { kind: 'focus', focusId: 'm31' },
          },
        ],
      },
    ];
    const onTabChange = vi.fn();
    const { rerender } = renderPalette({ tabs: tabsWithSharedM31, tab: 'highlights', onTabChange });
    const img = screen.getByRole('button', { name: 'Andromeda Galaxy' }).querySelector('img');
    fireEvent.error(img as HTMLImageElement);
    expect(
      screen.getByRole('button', { name: 'Andromeda Galaxy' }).querySelector('img'),
    ).toBeNull();

    rerender(
      createElement(CommandPalette, {
        ...DEFAULTS,
        tabs: tabsWithSharedM31,
        tab: 'galaxies',
        onTabChange,
      }),
    );
    const switchedImg = screen
      .getByRole('button', { name: 'Andromeda Galaxy' })
      .querySelector('img');
    expect(switchedImg).not.toBeNull();
    expect(switchedImg).toHaveAttribute('src', '/images/famous/m31.webp');
  });

  it('Enter on a focused tab button switches tab instead of selecting the highlighted card', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const onSelect = vi.fn();
    renderPalette({ onTabChange, onSelect });
    // Let the open-time rAF focus the input first, or it can fire during the
    // keypress and pull focus off the tab (a slow-runner race).
    await waitFor(() => expect(screen.getByPlaceholderText(/search galaxies/i)).toHaveFocus());
    screen.getByRole('tab', { name: 'Missions' }).focus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('missions');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ArrowRight ArrowRight then Enter selects a view card', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderPalette({ onSelect });
    screen.getByPlaceholderText(/search galaxies/i).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'view', viewId: 'solarSystem' });
  });

  it('clicking a view card selects its action and closes', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette({ onSelect, onClose });
    await user.click(screen.getByRole('button', { name: 'Solar System' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'view', viewId: 'solarSystem' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
