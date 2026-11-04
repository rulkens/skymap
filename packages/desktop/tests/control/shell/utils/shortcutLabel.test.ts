import { describe, expect, it } from 'vitest';
import { shortcutLabel } from '../../../../src/control/shell/utils/shortcutLabel';

describe('shortcutLabel', () => {
  it('spells CommandOrControl for the platform', () => {
    expect(shortcutLabel('CommandOrControl+Alt+K', true)).toBe('Cmd+Alt+K');
    expect(shortcutLabel('CommandOrControl+Alt+K', false)).toBe('Ctrl+Alt+K');
  });
});
