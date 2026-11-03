import { describe, expect, it } from 'vitest';

import { parseDomeMessage } from '../../../src/utils/remote/parseDomeMessage';
import { REMOTE_PROTOCOL_VERSION } from '../../../src/data/remote/remoteProtocolVersion';
import type { DomeMessage } from '../../../src/@types/remote/DomeMessage';

const v = REMOTE_PROTOCOL_VERSION;
const status: DomeMessage = {
  v,
  kind: 'status',
  status: {
    focus: { id: 'body-earth' },
    tour: { id: 'grandTour', beatIndex: 2, beatCount: 9, paused: false },
    time: { simDays: 9400.5, rateIndex: 3, direction: -1, paused: true, mode: 'manual' },
    controls: { scheme: 'skymap' },
    toggles: [{ id: 'labels', label: 'Labels', enabled: true }],
  },
};
const text = (msg: unknown): string => JSON.stringify(msg);

describe('parseDomeMessage', () => {
  it('accepts a full status', () => {
    expect(parseDomeMessage(text(status))).toEqual({ v, message: status });
    const idle = { v, kind: 'status', status: { ...status.status, focus: null, tour: null } };
    expect(parseDomeMessage(text(idle))).toEqual({ v, message: idle });
  });

  it('drops a status with a missing time field', () => {
    if (status.kind !== 'status') throw new Error('fixture');
    const { mode: _mode, ...time } = status.status.time;
    expect(
      parseDomeMessage(text({ v, kind: 'status', status: { ...status.status, time } })),
    ).toEqual({ v, message: null });
  });

  it('returns the version and no message for a status of another version', () => {
    const { v: _v, ...unversioned } = status;
    expect(parseDomeMessage(text({ ...status, v: v - 1 }))).toEqual({ v: v - 1, message: null });
    expect(parseDomeMessage(text({ ...status, v: v + 1 }))).toEqual({ v: v + 1, message: null });
    expect(parseDomeMessage(text(unversioned))).toEqual({ v: 1, message: null });
  });

  it("returns null for another phone's message, whatever its version", () => {
    // Regression guard: every phone shares the room, so these would otherwise read as a version mismatch.
    for (const sent of [v - 1, v]) {
      expect(parseDomeMessage(text({ v: sent, from: 'a', kind: 'hello' }))).toBeNull();
      const command = { name: 'home', payload: null };
      expect(parseDomeMessage(text({ v: sent, from: 'a', kind: 'command', command }))).toBeNull();
    }
  });

  it('accepts a menu', () => {
    const menu = {
      v,
      kind: 'menu',
      menu: {
        tours: [{ id: 'grandTour', label: 'The Long Way Out' }],
        exhibits: [],
        clips: [{ id: 'flyout', label: 'Fly to Horizon' }],
      },
    };
    expect(parseDomeMessage(text(menu))).toEqual({ v, message: menu });
  });

  it('drops a menu with a bad item', () => {
    const menu = { tours: [{ id: 'grandTour' }], exhibits: [], clips: [] };
    expect(parseDomeMessage(text({ v, kind: 'menu', menu }))).toEqual({ v, message: null });
  });

  it('accepts search results', () => {
    const results: DomeMessage = {
      v,
      kind: 'searchResults',
      requestId: 'r1',
      matches: [
        { name: 'M31', kind: 'Galaxy', action: { kind: 'focus', focusId: 'famous-m31' } },
        {
          name: 'Paris',
          kind: 'Place',
          action: { kind: 'flyTo', lonDeg: 2.35, latDeg: 48.9, altKm: 50 },
        },
      ],
    };
    expect(parseDomeMessage(text(results))).toEqual({ v, message: results });
  });
});
