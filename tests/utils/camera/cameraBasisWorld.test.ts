/**
 * The column ORDER is the whole contract: right | up | forward, with the pole
 * read out of `upBasis`'s middle column. A transposed or rotated assembly
 * still looks like a basis and silently rotates every body row's screen
 * orientation, so pin each column against the seam it comes from.
 */

import { describe, it, expect } from 'vitest';

import { cameraBasisWorld } from '../../../src/utils/camera/cameraBasisWorld';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

// Off every axis, so a wrong column can't coincide with a right one.
const FORWARD = normalize3([0.3, -0.7, 0.55]);
const ROLL = 0.37;
const C = Math.cos(0.4);
const S = Math.sin(0.4);
const UP_BASIS: Mat3 = [C, 0, -S, 0, 1, 0, S, 0, C];

describe('cameraBasisWorld', () => {
  it('columns are the image-plane right, up and the given forward, in that order', () => {
    const basis = cameraBasisWorld(FORWARD, ROLL, UP_BASIS);
    const { right, up } = imagePlaneBasis(FORWARD, ROLL, frameUp(UP_BASIS));
    expect(Array.from(basis.slice(0, 3))).toEqual(Array.from(right));
    expect(Array.from(basis.slice(3, 6))).toEqual(Array.from(up));
    expect(Array.from(basis.slice(6, 9))).toEqual(Array.from(FORWARD));
  });
});
