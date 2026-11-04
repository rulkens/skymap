import { describe, expect, it } from 'vitest';
import { storedDisplayMissing } from '../../src/utils/storedDisplayMissing';

const primary = { id: 1, label: '', width: 1920, height: 1080, primary: true };

describe('storedDisplayMissing', () => {
  it('is false with nothing stored or when the stored display is the sky', () => {
    expect(storedDisplayMissing(null, primary)).toBe(false);
    expect(storedDisplayMissing({ id: 1, width: 1920, height: 1080 }, primary)).toBe(false);
  });

  it('is false when a re-plugged display of the stored size took the sky', () => {
    expect(storedDisplayMissing({ id: 9, width: 1920, height: 1080 }, primary)).toBe(false);
  });

  it('is true when the sky fell back to a display of another size', () => {
    expect(storedDisplayMissing({ id: 9, width: 4096, height: 2160 }, primary)).toBe(true);
  });
});
