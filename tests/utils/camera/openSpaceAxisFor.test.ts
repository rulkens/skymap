import { describe, expect, it } from 'vitest';

import { openSpaceAxisFor } from '../../../src/utils/camera/openSpaceAxisFor';
import type { AxisPress } from '../../../src/@types/camera/AxisPress';
import type { NavAxis } from '../../../src/@types/camera/NavAxis';

const LEFT: AxisPress = { button: 0, ctrl: false, alt: false, shift: false, pointerType: 'mouse' };

describe('openSpaceAxisFor', () => {
  // OpenSpace's branch order (mousecamerastates.cpp): alt before shift before ctrl.
  it.each<[string, Partial<AxisPress>, NavAxis]>([
    ['left', {}, 'orbit'],
    ['ctrl+left', { ctrl: true }, 'look'],
    ['shift+left', { shift: true }, 'roll'],
    ['alt+left', { alt: true }, 'zoom'],
    ['alt+shift+left', { alt: true, shift: true }, 'zoom'],
    ['ctrl+shift+left', { ctrl: true, shift: true }, 'roll'],
    ['middle', { button: 1 }, 'roll'],
    ['right', { button: 2 }, 'zoom'],
    ['ctrl+right', { button: 2, ctrl: true }, 'zoom'],
    ['touch', { pointerType: 'touch', button: 2, alt: true }, 'orbit'],
    ['pen', { pointerType: 'pen', shift: true }, 'orbit'],
  ])('%s', (_name, over, axis) => {
    expect(openSpaceAxisFor({ ...LEFT, ...over })).toBe(axis);
  });
});
