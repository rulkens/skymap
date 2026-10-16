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

describe('CONTROL_BINDINGS.openspace', () => {
  it.each<[string, Partial<Press>, HeldIntent]>([
    ['left mouse', {}, 'navOrbit'],
    ['right mouse', { button: 2 }, 'navZoom'],
    ['middle mouse', { button: 1 }, 'navRoll'],
    ['alt + left', { alt: true }, 'navZoom'],
    ['shift + left', { shift: true }, 'navRoll'],
    ['ctrl + left', { ctrl: true }, 'navLook'],
    ['right mouse wins over a modifier', { button: 2, shift: true }, 'navZoom'],
    ['alt wins over shift', { alt: true, shift: true }, 'navZoom'],
    ['touch', { pointerType: 'touch' }, 'navOrbit'],
    ['pen', { pointerType: 'pen' }, 'navOrbit'],
    ['touch ignores modifiers', { pointerType: 'touch', shift: true }, 'navOrbit'],
  ])('%s binds %s', (_name, over, intent) => {
    expect(bindPress(CONTROL_BINDINGS.openspace, press(over))).toBe(intent);
  });
});

describe('CONTROL_BINDINGS.skymap', () => {
  it.each<[string, Partial<Press>, HeldIntent]>([
    ['left mouse', {}, 'orbit'],
    ['right mouse', { button: 2 }, 'pan'],
    ['middle mouse', { button: 1 }, 'pan'],
    ['shift + left', { shift: true }, 'orbit'],
  ])('%s binds %s', (_name, over, intent) => {
    expect(bindPress(CONTROL_BINDINGS.skymap, press(over))).toBe(intent);
  });
});
