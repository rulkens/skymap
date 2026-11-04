import { describe, expect, it } from 'vitest';
import { chosenDisplay } from '../../src/utils/chosenDisplay';

const displays = [
  { id: 1, width: 1920, height: 1080, primary: true },
  { id: 7, width: 4096, height: 4096, primary: false },
];

describe('chosenDisplay', () => {
  it('stores the picked display without its primary flag', () => {
    expect(chosenDisplay(displays, '7')).toEqual({ id: 7, width: 4096, height: 4096 });
  });

  it('the empty value and an unknown id mean the primary display', () => {
    expect(chosenDisplay(displays, '')).toBeNull();
    expect(chosenDisplay(displays, '3')).toBeNull();
  });
});
