// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import RemotePage from '../../../src/components/RemotePage/RemotePage';
import { createLocalTransport } from '../../../src/services/remote/createLocalTransport';
import type { DomeStatus } from '../../../src/@types/remote/DomeStatus';
import type { RemoteLinkStatus } from '../../../src/@types/remote/RemoteLinkStatus';

vi.mock('../../../src/services/remote/createLocalTransport', () => ({
  createLocalTransport: vi.fn(),
}));

const status: DomeStatus = {
  focus: null,
  tour: { id: 'grandTour', beatIndex: 2, beatCount: 9, paused: true },
  time: { simDays: 2_451_545, rateIndex: 3, direction: 1, paused: false, mode: 'manual' },
  toggles: [{ id: 'constellations', label: 'Constellations', enabled: false }],
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
    newRoom: () => 'ABCD2345',
    pairingOrigins: async () => [],
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
afterEach(() => vi.useRealTimers());

const menu = {
  tours: [{ id: 'grandTour', label: 'The Long Way Out' }],
  exhibits: [{ id: 'cosmicWeb', label: 'Cosmic Web' }],
  clips: [{ id: 'flyout', label: 'Fly to Horizon' }],
};
const sendMenu = (): void => act(() => deliver(JSON.stringify({ kind: 'menu', menu })));
const sendStatus = (): void => act(() => deliver(JSON.stringify({ kind: 'status', status })));
const messages = (kind: string): Record<string, unknown>[] =>
  sent.map((s) => JSON.parse(s)).filter((m) => m.kind === kind);
const commands = (): unknown[] => messages('command').map((m) => m.command);

describe('RemotePage', () => {
  it('a status renders the running tour and its controls', () => {
    render(<RemotePage />);
    sendStatus();
    expect(screen.getByText(/beat 3 of 9, paused/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(commands()).toContainEqual({ name: 'tourTogglePause', payload: null });
  });

  it('the menu lists the tours, exhibits and clips, and a button sends its id', () => {
    render(<RemotePage />);
    sendStatus();
    expect(screen.queryByRole('button', { name: 'Cosmic Web' })).toBeNull();
    sendMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Cosmic Web' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fly to Horizon' }));
    expect(commands()).toContainEqual({
      name: 'goTo',
      payload: { kind: 'exhibit', exhibitId: 'cosmicWeb' },
    });
    expect(commands()).toContainEqual({ name: 'clipStart', payload: { clipId: 'flyout' } });
    expect(screen.getByRole('button', { name: 'The Long Way Out' })).toBeTruthy();
  });

  it('three seconds without a status shows dome not there', () => {
    render(<RemotePage />);
    sendStatus();
    expect(screen.getByText('Connected')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText('Dome not there')).toBeTruthy();
  });

  it('toggling a row sends toggleSet', () => {
    render(<RemotePage />);
    sendStatus();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Constellations' }));
    expect(commands()).toContainEqual({
      name: 'toggleSet',
      payload: { id: 'constellations', enabled: true },
    });
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
    for (const page of [pageA, pageB]) {
      fireEvent.change(page.getByRole('searchbox'), { target: { value: 'andro' } });
    }
    act(() => void vi.advanceTimersByTime(200));
    const fromA = messages('hello')[0]!.from;
    const requestA = messages('search').find((m) => m.from === fromA)!;
    const resultsForA = JSON.stringify({
      kind: 'searchResults',
      requestId: requestA.requestId,
      matches: [{ name: 'Andromeda', kind: 'galaxy', action: { kind: 'focus', focusId: 'm31' } }],
    });
    act(() => delivers.forEach((listener) => listener(resultsForA)));
    expect(pageA.queryByRole('button', { name: /Andromeda/ })).toBeTruthy();
    expect(pageB.queryByRole('button', { name: /Andromeda/ })).toBeNull();
  });
});
