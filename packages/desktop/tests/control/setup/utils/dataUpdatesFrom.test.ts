import { describe, expect, it } from 'vitest';
import { dataUpdatesFrom } from '../../../../src/control/setup/utils/dataUpdatesFrom';

describe('dataUpdatesFrom', () => {
  it('daily keeps its time', () => {
    expect(dataUpdatesFrom('daily', '05:30')).toEqual({ kind: 'daily', at: '05:30' });
  });

  it('the other kinds drop the time', () => {
    expect(dataUpdatesFrom('manual', '05:30')).toEqual({ kind: 'manual' });
    expect(dataUpdatesFrom('atLaunch', '05:30')).toEqual({ kind: 'atLaunch' });
  });
});
