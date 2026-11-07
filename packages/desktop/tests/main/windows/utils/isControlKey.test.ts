import { describe, expect, it } from 'vitest';
import type { Input } from 'electron';
import { isControlKey } from '../../../../src/main/windows/utils/isControlKey';

const key = (over: Partial<Input>): Input =>
  ({
    type: 'keyDown',
    key: ',',
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...over,
  }) as Input;

// The sky has no menu in full screen, so this is the only way back to the control window there.
describe('isControlKey', () => {
  it('is Cmd+, on macOS and Ctrl+, on Windows, on the press only', () => {
    expect(isControlKey(key({ meta: true }), 'darwin')).toBe(true);
    expect(isControlKey(key({ control: true }), 'win32')).toBe(true);
    expect(isControlKey(key({ meta: true, type: 'keyUp' }), 'darwin')).toBe(false);
  });

  it('leaves the comma alone otherwise, so typing in the sky still works', () => {
    expect(isControlKey(key({}), 'darwin')).toBe(false);
    expect(isControlKey(key({ control: true }), 'darwin')).toBe(false);
    expect(isControlKey(key({ meta: true }), 'win32')).toBe(false);
    expect(isControlKey(key({ meta: true, shift: true }), 'darwin')).toBe(false);
  });
});
