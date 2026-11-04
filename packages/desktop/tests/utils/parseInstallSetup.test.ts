import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTALL_SETUP } from '../../src/data/defaultInstallSetup.js';
import { parseInstallSetup } from '../../src/utils/parseInstallSetup.js';

describe('parseInstallSetup', () => {
  it('returns defaults for garbage', () => {
    for (const raw of [null, undefined, 7, 'x', [], { mode: 3, dataUpdates: 'daily' }]) {
      expect(parseInstallSetup(raw)).toEqual(DEFAULT_INSTALL_SETUP);
    }
  });

  it('keeps valid fields and defaults the rest', () => {
    const parsed = parseInstallSetup({
      mode: 'dome',
      display: { id: 4, width: 4096, height: 2160 },
      network: 'en7',
      autostart: 'yes',
      dataUpdates: { kind: 'daily', at: '03:30' },
    });
    expect(parsed).toEqual({
      mode: 'dome',
      display: { id: 4, width: 4096, height: 2160 },
      network: 'en7',
      autostart: false,
      dataUpdates: { kind: 'daily', at: '03:30' },
    });
  });

  it('rejects a daily time that is not HH:MM', () => {
    for (const at of ['3:30', '24:00', '12:60', 'noon', 330, undefined]) {
      expect(parseInstallSetup({ dataUpdates: { kind: 'daily', at } }).dataUpdates).toEqual({
        kind: 'atLaunch',
      });
    }
  });
});
