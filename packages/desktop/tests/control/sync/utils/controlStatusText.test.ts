import { describe, expect, it } from 'vitest';
import { controlStatusText } from '../../../../src/control/sync/utils/controlStatusText';

const done = { doneBytes: 5e9, totalBytes: 5e9 };

describe('controlStatusText', () => {
  it('says the sky keeps running only when it has saved data', () => {
    const text = (status: Parameters<typeof controlStatusText>[0]) =>
      controlStatusText(status, null, false);
    expect(text({ kind: 'failed', hasData: true })).toMatch(/saved data/);
    expect(text({ kind: 'failed', hasData: false })).not.toMatch(/saved data/);
    expect(text({ kind: 'offline', hasData: true })).toMatch(/saved data/);
    expect(text({ kind: 'offline', hasData: false })).not.toMatch(/saved data/);
  });

  it('a full disk names the space needed and free', () => {
    expect(
      controlStatusText({ kind: 'diskFull', neededBytes: 4.2e9, freeBytes: 1.05e9 }, null, false),
    ).toMatch(/needs 4\.2 GB, 1\.1 GB free/);
  });

  it('idle after a finished download says so, before and after the sky starts', () => {
    expect(controlStatusText({ kind: 'idle' }, done, false)).toBe(
      'Download complete. Starting the sky.',
    );
    expect(controlStatusText({ kind: 'idle' }, done, true)).toBe('Download complete');
    expect(controlStatusText({ kind: 'idle' }, null, false)).toBe('Waiting for the download');
  });
});
