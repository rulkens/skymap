import { describe, expect, it } from 'vitest';

import { parseDomeMessage } from '../../../src/utils/remote/parseDomeMessage';
import type { DomeMessage } from '../../../src/@types/remote/DomeMessage';

const status: DomeMessage = {
  kind: 'status',
  status: {
    focus: { id: 'body-earth' },
    tour: { id: 'grandTour', beatIndex: 2, beatCount: 9, paused: false },
    time: { simDays: 9400.5, rateIndex: 3, direction: -1, paused: true, mode: 'manual' },
    toggles: [{ id: 'labels', label: 'Labels', enabled: true }],
  },
};
const text = (msg: unknown): string => JSON.stringify(msg);

describe('parseDomeMessage', () => {
  it('accepts a full status', () => {
    expect(parseDomeMessage(text(status))).toEqual(status);
    const idle = { kind: 'status', status: { ...status.status, focus: null, tour: null } };
    expect(parseDomeMessage(text(idle))).toEqual(idle);
  });

  it('drops a status with a missing time field', () => {
    if (status.kind !== 'status') throw new Error('fixture');
    const { mode: _mode, ...time } = status.status.time;
    expect(
      parseDomeMessage(text({ kind: 'status', status: { ...status.status, time } })),
    ).toBeNull();
  });

  it('accepts search results', () => {
    const results: DomeMessage = {
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
    expect(parseDomeMessage(text(results))).toEqual(results);
  });

  it('drops an unknown kind', () => {
    expect(parseDomeMessage(text({ kind: 'hello', from: 'a' }))).toBeNull();
  });
});
