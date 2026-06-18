import { describe, it, expect } from 'vitest';
import { settingsRoute } from '../../src/store/constants';

describe('store route constants', () => {
  it('settingsRoute is the "settings" literal', () => {
    expect(settingsRoute).toBe('settings');
  });
});
