import { describe, expect, it } from 'vitest';
import type { Press } from '../../../src/@types/input/Press';
import { CONTROL_BINDINGS } from '../../../src/data/input/controlBindings';
import { bindPress } from '../../../src/utils/input/bindPress';

const press = (p: Partial<Press>): Press => ({
  button: 0,
  pointerType: 'mouse',
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  ...p,
});
const skymap = CONTROL_BINDINGS.skymap;

describe('bindPress', () => {
  it('right and middle mouse bind to pan', () => {
    expect(bindPress(skymap, press({ button: 2 }))).toBe('pan');
    expect(bindPress(skymap, press({ button: 1 }))).toBe('pan');
  });

  it('left mouse, touch and pen bind to orbit', () => {
    expect(bindPress(skymap, press({}))).toBe('orbit');
    expect(bindPress(skymap, press({ pointerType: 'touch' }))).toBe('orbit');
    expect(bindPress(skymap, press({ pointerType: 'pen' }))).toBe('orbit');
  });

  it('a modifier does not change the skymap binding', () => {
    expect(bindPress(skymap, press({ shift: true }))).toBe('orbit');
  });

  it('a table with no matching row throws', () => {
    expect(() => bindPress([[{ button: 2 }, 'pan']], press({}))).toThrow();
  });
});
