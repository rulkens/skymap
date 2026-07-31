import { describe, expect, it } from 'vitest';

import { buildCaptureUrl } from '../../../../tools/utils/record/buildCaptureUrl';

describe('buildCaptureUrl', () => {
  it('composes the cinema gate and the pinned instant', () => {
    const simTime = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));
    expect(buildCaptureUrl({ base: 'http://localhost:5173', simTime })).toBe(
      'http://localhost:5173/?cinema#t=2026-07-31T12:00:00.000Z',
    );
  });

  it('rejects a base carrying its own query or hash', () => {
    const simTime = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));
    expect(() => buildCaptureUrl({ base: 'http://localhost:5173/?cinema', simTime })).toThrow(
      /--url/,
    );
    expect(() => buildCaptureUrl({ base: 'http://localhost:5173#t=x', simTime })).toThrow(/--url/);
  });

  it('strips trailing slashes from base before composing', () => {
    const simTime = new Date(Date.UTC(2026, 6, 31, 12, 0, 0));
    expect(buildCaptureUrl({ base: 'http://localhost:5173/', simTime })).toBe(
      'http://localhost:5173/?cinema#t=2026-07-31T12:00:00.000Z',
    );
    // `record.ts`'s `--url` parsing only strips a single trailing slash, so a
    // doubled one can still reach here — the helper must not compose `//?cinema`.
    expect(buildCaptureUrl({ base: 'http://localhost:5173//', simTime })).toBe(
      'http://localhost:5173/?cinema#t=2026-07-31T12:00:00.000Z',
    );
  });
});
