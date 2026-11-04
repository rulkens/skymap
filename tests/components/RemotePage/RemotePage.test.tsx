// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import RemotePage from '../../../src/components/RemotePage/RemotePage';
import { createLocalTransport } from '../../../src/services/remote/createLocalTransport';
import { REMOTE_PROTOCOL_VERSION } from '../../../src/data/remote/remoteProtocolVersion';
import { HELLO_INTERVAL_MS } from '../../../src/data/remote/helloIntervalMs';
import { SHEET_LEAVE_MS } from '../../../src/data/remote/sheetLeaveMs';
import type { DomeStatus } from '../../../src/@types/remote/DomeStatus';
import type { RemoteLinkStatus } from '../../../src/@types/remote/RemoteLinkStatus';

vi.mock('../../../src/services/remote/createLocalTransport', () => ({
  createLocalTransport: vi.fn(),
}));

const status: DomeStatus = {
  focus: null,
  takeover: { kind: 'tour', id: 'grandTour', beatIndex: 2, beatCount: 9, paused: true },
  time: { simDays: 2_451_545, rateIndex: 3, direction: 1, paused: false, mode: 'manual' },
  controls: { scheme: 'skymap' },
  toggles: [{ id: 'constellations', label: 'Constellations', enabled: false }],
  layers: [
    { id: 'survey', label: 'Galaxies', enabled: true },
    { id: 'flow', label: 'Flow', enabled: false },
  ],
};

// One listener per rendered page, in render order.
const delivers: ((text: string) => void)[] = [];
const deliver = (text: string): void => delivers.at(-1)!(text);
let reportStatus: (status: RemoteLinkStatus) => void;
let resizePad: () => void;
// Like a socket: sends made before the link reports `open` are dropped.
let linkOpen: boolean;
const sent: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  delivers.length = 0;
  linkOpen = true;
  window.scrollTo = vi.fn();
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      resizePad = callback;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  location.hash = '#ABCD2345';
  vi.mocked(createLocalTransport).mockReturnValue({
    host: () => {
      throw new Error('a remote never hosts');
    },
    open: () => ({
      send: (text) => void (linkOpen && sent.push(text)),
      onText: (listener) => {
        delivers.push(listener);
        return () => {};
      },
      onStatus: (listener) => {
        reportStatus = listener;
        return () => {};
      },
      close: () => {},
    }),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

const menu = {
  tours: [{ id: 'grandTour', label: 'The Long Way Out' }],
  exhibits: [{ id: 'cosmicWeb', label: 'Cosmic Web' }],
  clips: [{ id: 'flyout', label: 'Fly to Horizon' }],
};
const v = REMOTE_PROTOCOL_VERSION;
const sendMenu = (): void => act(() => deliver(JSON.stringify({ v, kind: 'menu', menu })));
const sendStatus = (
  scheme: 'skymap' | 'openspace' = 'skymap',
  sentV = v,
  focus: DomeStatus['focus'] = null,
): void =>
  act(() =>
    deliver(
      JSON.stringify({
        v: sentV,
        kind: 'status',
        status: { ...status, focus, controls: { scheme } },
      }),
    ),
  );
const sendWith = (patch: Partial<DomeStatus>): void =>
  act(() => deliver(JSON.stringify({ v, kind: 'status', status: { ...status, ...patch } })));
const openSheet = (name: string, scope: Pick<typeof screen, 'getByRole'> = screen): void =>
  void fireEvent.click(scope.getByRole('button', { name }));
const closeSheet = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
};
const messages = (kind: string): Record<string, unknown>[] =>
  sent.map((s) => JSON.parse(s)).filter((m) => m.kind === kind);
const commands = (): unknown[] => messages('command').map((m) => m.command);

describe('RemotePage', () => {
  it('a running tour shows its label and beat, and Pause sends tourTogglePause', () => {
    render(<RemotePage />);
    sendMenu();
    sendWith({
      takeover: { kind: 'tour', id: 'grandTour', beatIndex: 5, beatCount: 14, paused: false },
    });
    expect(screen.getByRole('heading', { name: 'The Long Way Out' })).toBeTruthy();
    expect(screen.getByText('Tour 6/14')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(commands()).toContainEqual({ name: 'tourTogglePause', payload: null });
    sendStatus();
    expect(screen.getByText('Tour 3/9, paused')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('Stop on a running exhibit sends exitTakeover', () => {
    render(<RemotePage />);
    sendMenu();
    sendWith({ takeover: { kind: 'exhibit', id: 'cosmicWeb' } });
    expect(screen.getByRole('heading', { name: 'Cosmic Web' })).toBeTruthy();
    expect(screen.getByText('Exhibit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop exhibit' }));
    expect(commands()).toContainEqual({ name: 'exitTakeover', payload: null });
  });

  it('a running item the menu lacks is titled by its kind', () => {
    render(<RemotePage />);
    sendWith({ takeover: { kind: 'clip', id: 'flyout' } });
    expect(screen.getByRole('heading', { name: 'Clip' })).toBeTruthy();
  });

  it('the clock is only in the Time sheet: Pause time sends timePause, Play time timeResume', () => {
    render(<RemotePage />);
    sendWith({ takeover: null });
    expect(screen.queryByRole('region', { name: 'Now running' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause time' })).toBeNull();
    openSheet('Time');
    fireEvent.click(screen.getByRole('button', { name: 'Pause time' }));
    expect(commands()).toContainEqual({ name: 'timePause', payload: null });
    sendWith({ takeover: null, time: { ...status.time, paused: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Play time' }));
    expect(commands()).toContainEqual({ name: 'timeResume', payload: null });
  });

  it('the Time readout runs on from when the status arrived, not from when the sheet opened', () => {
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    render(<RemotePage />);
    // J2000 noon at 10 min/s: 6.3 s later the dome's clock reads 13:03.
    sendWith({ takeover: null });
    nowMs += 6_300;
    openSheet('Time');
    expect(screen.getByText('2000-01-01 13:03')).toBeTruthy();
  });

  it('Escape shuts an open speed list first, and leaves the Time sheet open', () => {
    render(<RemotePage />);
    sendWith({ takeover: null });
    openSheet('Time');
    fireEvent.click(screen.getByRole('button', { name: 'Speed 10 min/s' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '1 yr/s' }), { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(screen.queryByRole('list', { name: 'Speeds' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Time' })).toBeTruthy();
  });

  it('the header names the focus the dome reports', () => {
    render(<RemotePage />);
    sendStatus('skymap', v, { name: 'Andromeda' });
    expect(screen.getByText('Andromeda')).toBeTruthy();
    sendStatus();
    expect(screen.getByText('Nothing focused')).toBeTruthy();
  });

  it('the running exhibit is marked in Exhibits and not in Clips, though they share its id', () => {
    render(<RemotePage />);
    act(() =>
      deliver(
        JSON.stringify({
          v,
          kind: 'menu',
          menu: {
            ...menu,
            exhibits: [{ id: 'cosmicFlows', label: 'Cosmic Flows' }],
            clips: [{ id: 'cosmicFlows', label: 'Cosmic Flows' }],
          },
        }),
      ),
    );
    sendWith({ takeover: { kind: 'exhibit', id: 'cosmicFlows' } });
    const marked = (): HTMLElement[] =>
      screen
        .getByRole('dialog')
        .querySelectorAll<HTMLElement>('[aria-current]') as unknown as HTMLElement[];
    openSheet('Exhibits');
    expect(marked()).toHaveLength(1);
    closeSheet();
    openSheet('Clips');
    expect(marked()).toHaveLength(0);
  });

  it("a show row sends its kind's start command and closes its sheet, and waits for the menu", () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Exhibits');
    expect(screen.getByText("Waiting for the dome's lists")).toBeTruthy();
    sendMenu();
    const startFrom = (sheet: string, row: string): void => {
      openSheet(sheet);
      fireEvent.click(screen.getByRole('button', { name: row }));
      act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: sheet }));
    };
    fireEvent.click(screen.getByRole('button', { name: 'Cosmic Web' }));
    expect(commands()).toContainEqual({
      name: 'goTo',
      payload: { kind: 'exhibit', exhibitId: 'cosmicWeb' },
    });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(screen.queryByRole('dialog')).toBeNull();
    startFrom('Clips', 'Fly to Horizon');
    expect(commands()).toContainEqual({ name: 'clipStart', payload: { clipId: 'flyout' } });
    startFrom('Tours', 'The Long Way Out');
    expect(commands()).toContainEqual({
      name: 'goTo',
      payload: { kind: 'tour', tourId: 'grandTour' },
    });
  });

  it('a tile opens its sheet with focus inside, and Escape closes it with focus back on the tile', () => {
    render(<RemotePage />);
    sendStatus();
    const tile = screen.getByRole('button', { name: 'Exhibits' });
    fireEvent.click(tile);
    const sheet = screen.getByRole('dialog', { name: 'Exhibits' });
    expect(sheet.contains(document.activeElement)).toBe(true);
    // The pad and Home stay live under an open sheet; the tiles do not.
    expect(tile.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Home' }).closest('[inert]')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tile.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('a tile scrolls the page back to the top, so the sheet sits under the pad it must leave live', () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Exhibits');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('the search tile opens with the search field focused', () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Search');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('Escape in a filled search field clears it and keeps the sheet; in an empty one, or while composing, only the empty one closes', () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Search');
    const field = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'andro' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(field.value).toBe('');
    expect(screen.queryByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(screen.queryByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    act(() => void vi.advanceTimersByTime(SHEET_LEAVE_MS));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("a reopened search starts empty, without the last search's results", () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Search');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'andro' } });
    act(() => void vi.advanceTimersByTime(200));
    act(() =>
      deliver(
        JSON.stringify({
          v,
          kind: 'searchResults',
          requestId: messages('search')[0]!.requestId,
          matches: [
            { name: 'Andromeda', kind: 'galaxy', action: { kind: 'focus', focusId: 'm31' } },
          ],
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: /Andromeda/ })).toBeTruthy();
    closeSheet();
    openSheet('Search');
    expect(screen.queryByRole('button', { name: /Andromeda/ })).toBeNull();
  });

  it('a dome with no label toggles says so in the Labels sheet', () => {
    render(<RemotePage />);
    sendWith({ toggles: [] });
    openSheet('Labels');
    expect(screen.getByText('The dome lists no labels')).toBeTruthy();
  });

  it('the Layers sheet counts the Layers on, and a switch sends layerSet', () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Layers');
    expect(screen.getByText('1 of 2 on')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Flow' }));
    expect(commands()).toContainEqual({ name: 'layerSet', payload: { id: 'flow', enabled: true } });
  });

  it('three seconds without a status shows dome not there, with a way back to the code', () => {
    render(<RemotePage />);
    sendStatus();
    expect(screen.getByText('Connected')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText('Dome not there')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change code' }));
    expect(screen.getByLabelText(/Room code/)).toBeTruthy();
  });

  it('a dome of another version names the page to reload, not dome not there', () => {
    render(<RemotePage />);
    sendStatus('skymap', v - 1);
    expect(screen.getByText('Dome needs a reload')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/older Skymap than this remote/);
    expect(screen.queryByRole('button', { name: 'Change code' })).toBeNull();
    // A dome that keeps answering at another version is there, so silence never takes over.
    act(() => void vi.advanceTimersByTime(2000));
    sendStatus('skymap', v + 1);
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText('Remote needs a reload')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
    sendStatus();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the deck is inert under both version notices', () => {
    render(<RemotePage />);
    sendStatus();
    const tile = screen.getByRole('button', { name: 'Exhibits' });
    expect(tile.closest('[inert]')).toBeNull();
    sendStatus('skymap', v - 1);
    expect(tile.closest('[inert]')).not.toBeNull();
    sendStatus();
    expect(tile.closest('[inert]')).toBeNull();
    sendStatus('skymap', v + 1);
    expect(tile.closest('[inert]')).not.toBeNull();
  });

  it('every message the page sends carries the protocol version', () => {
    linkOpen = false;
    render(<RemotePage />);
    act(() => resizePad());
    linkOpen = true;
    act(() => reportStatus('open'));
    act(() => void vi.advanceTimersByTime(HELLO_INTERVAL_MS));
    sendStatus();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    openSheet('Search');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'andro' } });
    act(() => void vi.advanceTimersByTime(200));
    const all = sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    expect(new Set(all.map((m) => m.kind))).toEqual(
      new Set(['hello', 'device', 'command', 'search']),
    );
    expect(all.filter((m) => m.v !== v)).toEqual([]);
  });

  it('hold buttons show only under openspace, and a held axis rides the next press only', () => {
    const { container } = render(<RemotePage />);
    sendStatus();
    expect(screen.queryByRole('button', { name: 'Hold to look around' })).toBeNull();
    sendStatus('openspace');
    const look = screen.getByRole('button', { name: 'Hold to look around' });
    const pad = container.querySelector('[class*="pad"]')!;
    const downs = (): { mods: { ctrl: boolean } }[] =>
      messages('device')
        .map((m) => m.event as { kind: string; mods: { ctrl: boolean } })
        .filter((e) => e.kind === 'down');
    fireEvent.pointerDown(look, { pointerId: 2 });
    expect(look.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 1, clientY: 1 });
    expect(downs()).toHaveLength(1);
    expect(downs()[0]!.mods.ctrl).toBe(true);
    fireEvent.pointerUp(pad, { pointerId: 1 });
    fireEvent.pointerUp(look, { pointerId: 2 });
    expect(look.getAttribute('aria-pressed')).toBe('false');
    fireEvent.pointerDown(pad, { pointerId: 3, clientX: 1, clientY: 1 });
    expect(downs()).toHaveLength(2);
    expect(downs()[1]!.mods.ctrl).toBe(false);
    sendStatus();
    expect(screen.queryByRole('button', { name: 'Hold to look around' })).toBeNull();
  });

  it('a cancelled button press returns to orbit, and the button alone emits no device event', () => {
    render(<RemotePage />);
    sendStatus('openspace');
    const before = messages('device').length;
    const roll = screen.getByRole('button', { name: 'Hold to roll' });
    fireEvent.pointerDown(roll, { pointerId: 2 });
    fireEvent.pointerMove(roll, { pointerId: 2, clientX: 40, clientY: 40 });
    expect(roll.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerCancel(roll, { pointerId: 2 });
    expect(roll.getAttribute('aria-pressed')).toBe('false');
    expect(messages('device').slice(before)).toEqual([]);
  });

  it('the scheme switch sends controlSchemeSet', () => {
    render(<RemotePage />);
    sendStatus();
    fireEvent.click(screen.getByRole('radio', { name: 'OpenSpace' }));
    expect(commands()).toContainEqual({
      name: 'controlSchemeSet',
      payload: { scheme: 'openspace' },
    });
  });

  it('toggling a row sends toggleSet', () => {
    render(<RemotePage />);
    sendStatus();
    openSheet('Labels');
    fireEvent.click(screen.getByRole('switch', { name: 'Constellations' }));
    expect(commands()).toContainEqual({
      name: 'toggleSet',
      payload: { id: 'constellations', enabled: true },
    });
  });

  it('the red-light switch turns the palette red, and a reloaded page keeps it', () => {
    const first = render(<RemotePage />);
    sendStatus();
    expect(document.documentElement.dataset.light).toBeUndefined();
    openSheet('Setup');
    fireEvent.click(screen.getByRole('switch', { name: 'Red light' }));
    expect(document.documentElement.dataset.light).toBe('red');
    first.unmount();
    expect(document.documentElement.dataset.light).toBeUndefined();
    render(<RemotePage />);
    expect(document.documentElement.dataset.light).toBe('red');
    sendStatus();
    openSheet('Setup');
    fireEvent.click(screen.getByRole('switch', { name: 'Red light' }));
    expect(document.documentElement.dataset.light).toBeUndefined();
  });

  it('the trackpad size reaches the dome once the link opens', () => {
    linkOpen = false;
    render(<RemotePage />);
    act(() => resizePad());
    expect(sent).toEqual([]);
    linkOpen = true;
    act(() => reportStatus('open'));
    expect(messages('device').map((m) => (m.event as { kind: string }).kind)).toEqual(['resize']);
  });

  it("another remote's search results are ignored", () => {
    // Two remotes in one room, both on their first non-empty search: the relay hands each the other's results.
    const pageA = within(render(<RemotePage />).container);
    const pageB = within(render(<RemotePage />).container);
    // Search waits for the dome's first status.
    act(() =>
      delivers.forEach((listener) => listener(JSON.stringify({ v, kind: 'status', status }))),
    );
    for (const page of [pageA, pageB]) {
      openSheet('Search', page);
      fireEvent.change(page.getByRole('searchbox'), { target: { value: 'andro' } });
    }
    act(() => void vi.advanceTimersByTime(200));
    const fromA = messages('search')[0]!.from;
    const requestA = messages('search').find((m) => m.from === fromA)!;
    const resultsForA = JSON.stringify({
      v,
      kind: 'searchResults',
      requestId: requestA.requestId,
      matches: [{ name: 'Andromeda', kind: 'galaxy', action: { kind: 'focus', focusId: 'm31' } }],
    });
    act(() => delivers.forEach((listener) => listener(resultsForA)));
    expect(pageA.queryByRole('button', { name: /Andromeda/ })).toBeTruthy();
    expect(pageB.queryByRole('button', { name: /Andromeda/ })).toBeNull();
  });
});
