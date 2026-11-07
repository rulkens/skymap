import { describe, expect, it } from 'vitest';
import type { Input } from 'electron';
import { isFullScreenKey } from '../../../../src/main/windows/utils/isFullScreenKey';

const key = (over: Partial<Input>): Input =>
  ({
    type: 'keyDown',
    key: '',
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...over,
  }) as Input;

describe('isFullScreenKey', () => {
  it('is Ctrl+Cmd+F on macOS, where F11 belongs to the system', () => {
    expect(isFullScreenKey(key({ key: 'f', control: true, meta: true }), 'darwin')).toBe(true);
    expect(isFullScreenKey(key({ key: 'F11' }), 'darwin')).toBe(false);
  });

  it('is F11 on Windows, on the press only', () => {
    expect(isFullScreenKey(key({ key: 'F11' }), 'win32')).toBe(true);
    expect(isFullScreenKey(key({ key: 'F11', type: 'keyUp' }), 'win32')).toBe(false);
    expect(isFullScreenKey(key({ key: 'f', control: true, meta: true }), 'win32')).toBe(false);
  });
});
