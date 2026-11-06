import { describe, expect, it } from 'vitest';
import { shortcutLabel } from '../../../../src/control/shell/utils/shortcutLabel';

describe('shortcutLabel', () => {
  it('spells the modifiers as the platform prints them', () => {
    expect(shortcutLabel('CommandOrControl+,', true)).toBe('Cmd+,');
    expect(shortcutLabel('CommandOrControl+,', false)).toBe('Ctrl+,');
  });
});
