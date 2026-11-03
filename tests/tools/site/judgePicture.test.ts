import { describe, expect, it } from 'vitest';

import type { PictureMeasure } from '../../../tools/site/@types/PictureMeasure';
import { judgePicture } from '../../../tools/site/utils/judgePicture';

const square: PictureMeasure = {
  index: 3,
  kind: 'img',
  src: '/@fs/repo/packages/website/src/assets/shots/render-stars-640.avif?no-inline',
  box: { x: 0, y: 0, width: 252, height: 252 },
  naturalWidth: 252,
  naturalHeight: 141.75,
  objectFit: 'cover',
  alt: 'A field of stars',
  shown: true,
};
const row = { id: 'render-stars', link: 'pose=a,0,0,0', widths: [1920, 1280, 640] };
const flagNames = (flags: string[]) => flags.map((flag) => flag.split(':')[0]);

describe('judgePicture', () => {
  it('blames `sizes` when the browser chose a file narrower than a wider one that exists', () => {
    const p = judgePicture(square, 'Real data', 2, row);
    expect([p.sourceWidth, p.neededWidth]).toEqual([640, 896]);
    expect(flagNames(p.flags)).toEqual(['UPSCALED x0.71', 'CROPPED']);
    expect(p.flags[0]).toContain('`sizes` attribute');
  });

  it('asks for a reshoot when even the widest file is too narrow', () => {
    const p = judgePicture(square, 'Real data', 2, { ...row, widths: [640] });
    expect(p.flags[0]).toContain('reshoot');
  });

  it('lets a source a few percent short pass, and flags a missing alt but not an empty one', () => {
    const near = { ...square, src: square.src.replace('640', '860') };
    expect(flagNames(judgePicture(near, 's', 2, row).flags)).toEqual(['CROPPED']);
    expect(flagNames(judgePicture({ ...near, alt: '' }, 's', 2, row).flags)).toEqual(['CROPPED']);
    expect(flagNames(judgePicture({ ...near, alt: null }, 's', 2, row).flags)).toContain('NO ALT');
  });

  it('marks ui- and cut- shots transparent and judges a film by its decoded width', () => {
    expect(judgePicture(square, 's', 2, { ...row, id: 'cut-saturn' }).transparent).toBe(true);
    const film = {
      ...square,
      kind: 'video' as const,
      src: '/loops/earth.mp4',
      naturalWidth: 1280,
      naturalHeight: 720,
      alt: null,
    };
    const p = judgePicture(film, 's', 1, null);
    expect([p.shotId, p.file, p.sourceWidth]).toEqual([null, 'earth.mp4', 1280]);
    expect(flagNames(p.flags)).toEqual(['CROPPED']);
  });

  it('flags a picture that decoded nothing and does no maths on it', () => {
    const p = judgePicture({ ...square, naturalWidth: 0, naturalHeight: 0 }, 's', 2, row);
    expect(flagNames(p.flags)).toEqual(['NOT LOADED']);
    expect(p.neededWidth).toBeNull();
  });
});
