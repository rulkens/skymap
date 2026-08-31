/**
 * labelPickQuads decides what a click can land on. Its two failure modes are
 * both silent: emitting a quad for a label nobody can see (a click on empty
 * sky selects something), and ordering the quads so a far label's box covers a
 * near one's (the wrong subject is selected). Both are asserted here.
 */

import { describe, expect, it } from 'vitest';
import {
  hasPickableLabel,
  labelPickQuads,
} from '../../../../../src/services/engine/frame/passes/labelPickQuads';
import { LABEL_PICK_GRACE_PADDING_PX } from '../../../../../src/data/labels/labelPickGracePaddingPx';
import { ATLAS_FONT_SIZE } from '../../../../../src/data/fonts';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { LabelBBox } from '../../../../../src/@types/rendering/LabelBBox';
import type { Label2DProjection } from '../../../../../src/@types/rendering/Label2DProjection';

const BBOX: LabelBBox = { minX: -10, minY: -20, maxX: 30, maxY: 5 };

// Column-major vp with w = z and x/y passed through, so a label at [0, 0, z]
// projects to the viewport centre at clipW = z — the depth knob the ordering
// assertions turn, with every quad landing on the same pixel.
const VP = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);

// viewportPx[1] = 2 · ATLAS_FONT_SIZE, so a label with worldEmMpc = clipW
// projects to exactly one atlas em and the bbox scales by 1 (see
// labelScreenRect's own test).
const PROJECTION: Label2DProjection = {
  vp: VP,
  vpF32: VP,
  viewportPx: [200, 2 * ATLAS_FONT_SIZE],
};

const label = (over: Partial<Label2D> = {}): Label2D =>
  ({
    id: 'l',
    worldPos: [0, 0, 1],
    text: 'l',
    font: 'cormorant',
    pixelSize: 0,
    minPixelSize: 1,
    maxPixelSize: 1000,
    worldEmMpc: 1,
    pickId: 7,
    ...over,
  }) as Label2D;

const quads = (
  labels: readonly Label2D[],
  measure: (l: Label2D) => LabelBBox | null = () => BBOX,
) => labelPickQuads({ labels, projection: PROJECTION, measure });

describe('labelPickQuads', () => {
  it('emits the grace-padded ink box at the label anchor', () => {
    // Anchor at NDC (0,0) → screen (100, 84) with the 200 × 168 viewport; the
    // bbox scales by 1 and the 8 px grace opens each side.
    const pad = LABEL_PICK_GRACE_PADDING_PX;
    expect(quads([label()])).toEqual([
      {
        packedId: 7,
        rect: { x0: 90 - pad, y0: 64 - pad, x1: 130 + pad, y1: 89 + pad },
      },
    ]);
  });

  it('skips a label that names nothing selectable', () => {
    // No pickId — the constellation captions' case. The geometry behind such a
    // label must stay clickable, so it contributes no quad at all.
    expect(quads([label({ pickId: undefined })])).toEqual([]);
  });

  it('skips a fully faded label', () => {
    // Invisible ⇒ unpickable. A mid-fade label (still legible) keeps its quad.
    expect(quads([label({ fadeAlpha: 0 })])).toEqual([]);
    expect(quads([label({ fadeAlpha: 0.01 })])).toHaveLength(1);
  });

  it('skips a label whose text lays out to no ink', () => {
    expect(quads([label()], () => null)).toEqual([]);
  });

  it('skips a label behind the camera', () => {
    // clipW = z ≤ 0 here: there is no screen position to place a box at.
    expect(quads([label({ worldPos: [0, 0, -1] })])).toEqual([]);
  });

  it('orders the quads nearest subject first', () => {
    // Every quad shares one forced depth band and the depth test rejects
    // equals, so the FIRST drawn owns a contested pixel. Emitting the far
    // label first would hand a click over a near label to the far one.
    const out = quads([
      label({ id: 'far', pickId: 1, worldPos: [0, 0, 9], worldEmMpc: 9 }),
      label({ id: 'near', pickId: 2, worldPos: [0, 0, 2], worldEmMpc: 2 }),
      label({ id: 'mid', pickId: 3, worldPos: [0, 0, 5], worldEmMpc: 5 }),
    ]);
    expect(out.map((q) => q.packedId)).toEqual([2, 3, 1]);
  });
});

describe('hasPickableLabel', () => {
  it('is true only while some label both names a subject and has opacity', () => {
    expect(hasPickableLabel([])).toBe(false);
    expect(hasPickableLabel([label({ pickId: undefined })])).toBe(false);
    expect(hasPickableLabel([label({ fadeAlpha: 0 })])).toBe(false);
    expect(hasPickableLabel([label({ pickId: undefined }), label()])).toBe(true);
  });
});
