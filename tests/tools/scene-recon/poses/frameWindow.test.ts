/**
 * frameWindow decides what gets downloaded and, through the pose intrinsics,
 * where the trainer thinks every pixel is. The cases below are the ones that
 * fail silently: a window centred on the wrong part of an oblique frame (the
 * sign convention), a scale that invents resolution the COG never held, and
 * the whole-frame group quietly changing behaviour.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { frameWindow, frameWindowOutputPx } from '../../../../tools/scene-recon/poses/frameWindow';
import { SOENDERMARKEN } from '../../../../tools/scene-recon/groups/soendermarken';
import { SOENDERMARKEN_CROP } from '../../../../tools/scene-recon/groups/soendermarkenCrop';
import type { SceneGroupDefinition } from '../../../../tools/scene-recon/@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from '../../../../tools/scene-recon/@types/SkraafotoStacItem';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../fixtures/skraafoto/${name}.json`, import.meta.url)),
      'utf8',
    ),
  ) as SkraafotoStacItem;

const NADIR = fixture('2025_84_40_1_0049_00002495_100mm');
const OBLIQUE = fixture('2025_84_40_5_0052_00001969_100mm');

/** Both centres through `topocentricPositionsM`'s own cct pipeline. */
const NADIR_POSITION_M: Vec3 = [-328.391922, 25.48876, 2181.851517];
const OBLIQUE_POSITION_M: Vec3 = [2077.866, -103.811, 2183.842];

describe('frameWindow', () => {
  it('crops a nadir frame to the bounds box at the target resolution', () => {
    const window = frameWindow(NADIR, SOENDERMARKEN_CROP, NADIR_POSITION_M)!;
    const [outW, outH] = frameWindowOutputPx(window);

    // 100 mm/px asks for 10 written px per ground metre over a 183 x 258 m box,
    // which the COG's ~103 mm/px native cannot quite give. The window covers
    // more than the footprint — it is the box swept -10..50 m in z, plus 2% pad
    // — so it overshoots, but must never undershoot.
    expect(outW / 182.8).toBeGreaterThan(9);
    expect(outW / 182.8).toBeLessThan(13);
    expect(outH / 257.5).toBeGreaterThan(9);
    expect(outH / 257.5).toBeLessThan(13);
    // ~96 mm/px native over this box's projected diagonal (the -10..50 m sweep
    // widens it past the frame's nominal 103 mm/px GSD), so the 100 mm/px
    // request lands just short of reading the crop unscaled.
    expect(window.scale).toBeGreaterThan(0.9);
    expect(window.scale).toBeLessThanOrEqual(1);
  });

  // Two silent bugs move this window and nothing else catches them: transposing
  // the collinearity matrix points the frame south, which puts the box at
  // u = -27,800 (skipped, so the frame would just vanish from the harvest);
  // dropping the 2.9 deg grid convergence slides u by +1,250 px while leaving v
  // alone. The box images 1,700 px ABOVE the principal point because it sits at
  // 42 deg depression from a camera tilted 45 deg.
  it('places the oblique frame window where the box actually images', () => {
    const window = frameWindow(OBLIQUE, SOENDERMARKEN_CROP, OBLIQUE_POSITION_M)!;
    const uCentre = window.x0 + window.widthPx / 2;
    const vCentre = window.y0 + window.heightPx / 2;
    const principalPointV = 14144 / 2 - 6.68 / 0.00376;

    expect(window.x0 + window.widthPx).toBeLessThanOrEqual(10560);
    expect(window.y0 + window.heightPx).toBeLessThanOrEqual(14144);
    expect(Math.abs(uCentre - 5080)).toBeLessThan(500);
    expect(principalPointV - vCentre).toBeGreaterThan(1300);
    expect(principalPointV - vCentre).toBeLessThan(2100);
  });

  it('never upsamples past the COG’s own resolution', () => {
    const coarse: SceneGroupDefinition = {
      ...SOENDERMARKEN_CROP,
      skraafoto: { ...SOENDERMARKEN_CROP.skraafoto, groundMmPerPx: 10 },
    };

    expect(frameWindow(NADIR, coarse, NADIR_POSITION_M)!.scale).toBe(1);
  });

  it('leaves a group with no groundMmPerPx on the whole frame', () => {
    expect(frameWindow(NADIR, SOENDERMARKEN, NADIR_POSITION_M)).toEqual({
      x0: 0,
      y0: 0,
      widthPx: 20544,
      heightPx: 14016,
      scale: 1920 / 20544,
    });
  });

  it('skips a frame whose bounds box is behind the camera', () => {
    // Same frame, moved 5 km west of the box: it looks further west still.
    const away: Vec3 = [-5000, 0, 2183];

    expect(frameWindow(OBLIQUE, SOENDERMARKEN_CROP, away)).toBeNull();
  });
});
