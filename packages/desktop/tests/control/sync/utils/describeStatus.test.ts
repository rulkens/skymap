import { describe, expect, it } from 'vitest';
import type { SyncState } from '../../../../src/control/sync/@types/SyncState';
import { describeStatus } from '../../../../src/control/sync/utils/describeStatus';

const at = (over: Partial<SyncState>): SyncState => ({
  status: { kind: 'idle' },
  progress: null,
  hasData: false,
  skyRunning: false,
  skyLoading: false,
  lastAttempt: null,
  ...over,
});

describe('describeStatus', () => {
  it('an offline or failed sync is a problem only without saved data', () => {
    for (const kind of ['offline', 'failed'] as const) {
      const without = describeStatus(at({ status: { kind } }));
      const withData = describeStatus(at({ status: { kind }, hasData: true }));
      expect(without.tone).toBe('problem');
      expect(without.text).not.toMatch(/saved data/);
      expect(withData.tone).toBe('plain');
      expect(withData.text).toMatch(/saved data/);
    }
  });

  it('a paused download is never a problem, so it offers no Retry', () => {
    const status = { kind: 'paused' } as const;
    expect(describeStatus(at({ status }))).toEqual({ text: 'Download paused', tone: 'plain' });
    expect(describeStatus(at({ status, hasData: true })).text).toMatch(/saved data/);
  });

  it('a problem ends with when it last tried, once an attempt has ended', () => {
    const status = { kind: 'failed' } as const;
    expect(describeStatus(at({ status })).text).not.toMatch(/Last tried/);
    expect(
      describeStatus(at({ status, lastAttempt: new Date(2026, 10, 5, 9, 7).getTime() })).text,
    ).toMatch(/Last tried at 09:07\.$/);
  });

  it('a full disk names the space needed and free, and always offers Retry', () => {
    const view = describeStatus(
      at({ status: { kind: 'diskFull', neededBytes: 4.2e9, freeBytes: 1.05e9 }, hasData: true }),
    );
    expect(view.text).toMatch(/needs 4\.2 GB, 1\.1 GB free/);
    expect(view.tone).toBe('problem');
  });

  it('a complete sync is done, and says the sky is starting until it runs', () => {
    expect(describeStatus(at({ status: { kind: 'complete' } }))).toMatchObject({
      tone: 'done',
      text: 'Download complete. Starting the sky.',
    });
    expect(describeStatus(at({ status: { kind: 'complete' }, skyRunning: true })).text).not.toMatch(
      /Starting/,
    );
  });

  it('idle with saved data says the sky is starting, not that it waits for a download', () => {
    expect(describeStatus(at({ hasData: true })).text).toBe('Starting the sky');
    expect(describeStatus(at({})).text).toBe('Waiting for the download');
  });
});
