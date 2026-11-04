import { describe, expect, it } from 'vitest';
import { controlStatusText } from '../../src/utils/controlStatusText';

describe('controlStatusText', () => {
  it('says the sky keeps running only when it has saved data', () => {
    expect(controlStatusText({ kind: 'failed', hasData: true })).toMatch(/saved data/);
    expect(controlStatusText({ kind: 'failed', hasData: false })).not.toMatch(/saved data/);
    expect(controlStatusText({ kind: 'offline', hasData: true })).toMatch(/saved data/);
    expect(controlStatusText({ kind: 'offline', hasData: false })).not.toMatch(/saved data/);
  });

  it('a full disk names the space needed and free', () => {
    expect(controlStatusText({ kind: 'diskFull', neededBytes: 4.2e9, freeBytes: 1.05e9 })).toMatch(
      /needs 4\.2 GB, 1\.1 GB free/,
    );
  });
});
