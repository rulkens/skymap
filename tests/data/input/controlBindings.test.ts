import { describe, it, expect } from 'vitest';

import { CONTROL_BINDINGS } from '../../../src/data/input/controlBindings';
import { bindPress } from '../../../src/utils/input/bindPress';
import type { HeldIntent } from '../../../src/@types/input/HeldIntent';
import type { Press } from '../../../src/@types/input/Press';

const press = (over: Partial<Press>): Press => ({
  button: 0,
  pointerType: 'mouse',
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  ...over,
});

// Only the row ORDER is logic here; the rows themselves are the table.
describe('CONTROL_BINDINGS.openspace', () => {
  it.each<[string, Partial<Press>, HeldIntent]>([
    ['right mouse wins over a modifier', { button: 2, shift: true }, 'navZoom'],
    ['alt wins over shift', { alt: true, shift: true }, 'navZoom'],
    ['touch', { pointerType: 'touch' }, 'navOrbit'],
    ['pen', { pointerType: 'pen' }, 'navOrbit'],
    ['touch ignores modifiers', { pointerType: 'touch', shift: true }, 'navOrbit'],
  ])('%s binds %s', (_name, over, intent) => {
    expect(bindPress(CONTROL_BINDINGS.openspace, press(over))).toBe(intent);
  });
});
