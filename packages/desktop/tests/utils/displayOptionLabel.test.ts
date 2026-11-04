import { describe, expect, it } from 'vitest';
import { displayOptionLabel } from '../../src/utils/displayOptionLabel';

describe('displayOptionLabel', () => {
  it('numbers from 1 and marks the primary', () => {
    expect(displayOptionLabel({ id: 42, width: 1920, height: 1080, primary: true }, 0)).toBe(
      'Display 1 · 1920×1080 · primary',
    );
    expect(displayOptionLabel({ id: 9, width: 4096, height: 4096, primary: false }, 1)).toBe(
      'Display 2 · 4096×4096',
    );
  });
});
