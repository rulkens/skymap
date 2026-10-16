// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RemotePage from '../../../src/components/RemotePage/RemotePage';
import { createLocalTransport } from '../../../src/services/remote/createLocalTransport';
import type { DomeStatus } from '../../../src/@types/remote/DomeStatus';

vi.mock('../../../src/services/remote/createLocalTransport', () => ({
  createLocalTransport: vi.fn(),
}));

const status: DomeStatus = {
  focus: null,
  tour: { id: 'grandTour', beatIndex: 2, beatCount: 9, paused: true },
  time: { simDays: 2_451_545, rateIndex: 3, direction: 1, paused: false, mode: 'manual' },
  toggles: [{ id: 'constellations', label: 'Constellations', enabled: false }],
};

let deliver: (text: string) => void;
const sent: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  location.hash = '#ABCD2345';
  vi.mocked(createLocalTransport).mockReturnValue({
    newRoom: () => 'ABCD2345',
    pairingOrigins: async () => [],
    open: () => ({
      send: (text) => sent.push(text),
      onText: (listener) => {
        deliver = listener;
        return () => {};
      },
      onStatus: () => () => {},
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
const commands = (): unknown[] =>
  sent
    .map((s) => JSON.parse(s))
    .filter((m) => m.kind === 'command')
    .map((m) => m.command);

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
});
