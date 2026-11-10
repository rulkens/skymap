/**
 * deriveFieldFrameLanes — the per-frame header lanes one camera and the
 * field's render tuning determine: the exposure against its gauge, the dust
 * slice edges and the star-grain scale blend. Both are measured from the
 * galaxy's centre (`|camera.eye|`, galaxy frame), never an orbit target.
 */
import type { FieldHeaderFrameLanes } from '../../header/@types/FieldHeaderFrameLanes';
import type { FieldHostTuning } from '../@types/FieldHostTuning';
import type { FieldView } from '../../@types/FieldView';

import { FIELD_EXPOSURE_GAUGE } from '../data/fieldExposureGauge';
import { dustSliceEdges } from '../../dust/utils/dustSliceEdges';
import { lerp } from '../../../../../utils/math/lerp';
import { smoothstep } from '../../../../../utils/math/smoothstep';

// Disc radii: below NEAR the near grain calibration alone applies, beyond FAR
// the far one. Eyeballed, tunable alongside `starGrainFeatureScaleNear`/`Far`.
const STAR_GRAIN_SCALE_NEAR_R = 1.0;
const STAR_GRAIN_SCALE_FAR_R = 4.0;

export function deriveFieldFrameLanes(input: {
  readonly camera: FieldView;
  /** The caller's knob × visibility alpha; the gauge is applied here. */
  readonly exposure: number;
  /** The dust's reach R, cached by the dust rebuild; only the slice edges are view-dependent. */
  readonly dustReachR: number;
  readonly render: Pick<
    FieldHostTuning['render'],
    'starGrainFeatureScaleNear' | 'starGrainFeatureScaleFar'
  >;
}): FieldHeaderFrameLanes {
  const { camera, render } = input;
  const eyeDist = Math.hypot(camera.eye[0], camera.eye[1], camera.eye[2]);
  // A log axis: `eyeDist` spans orders of magnitude between close approach and
  // a whole-galaxy framing, so a linear blend would sit in the far regime.
  const grainT = smoothstep(
    Math.log(STAR_GRAIN_SCALE_NEAR_R),
    Math.log(STAR_GRAIN_SCALE_FAR_R),
    Math.log(eyeDist / input.dustReachR),
  );
  return {
    analyticExposure: input.exposure * FIELD_EXPOSURE_GAUGE,
    dustSlices: dustSliceEdges(eyeDist, input.dustReachR),
    starGrainFeatureScale: lerp(
      render.starGrainFeatureScaleNear,
      render.starGrainFeatureScaleFar,
      grainT,
    ),
  };
}
