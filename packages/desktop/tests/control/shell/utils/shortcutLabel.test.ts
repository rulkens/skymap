import { describe, expect, it } from 'vitest';
import { shortcutLabel } from '../../../../src/control/shell/utils/shortcutLabel';

describe('shortcutLabel', () => {
  it('spells the modifiers as the platform prints them', () => {
    expect(shortcutLabel('CommandOrControl+Alt+K', true)).toBe('Cmd+Option+K');
    expect(shortcutLabel('CommandOrControl+Alt+K', false)).toBe('Ctrl+Alt+K');
  });
});
