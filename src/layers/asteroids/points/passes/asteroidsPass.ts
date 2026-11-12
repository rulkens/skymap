/**
 * asteroidsPass — the asteroid dots, additive into HDR on the NEAR0 line after the body composite,
 * beside the satellites and under the same occlusion (sampled depth plus the analytic body spheres),
 * so a dot behind Jupiter is hidden. The Sun's offset from the eye is composed here in f64 each frame.
 * The pick stamps the overlay target with the far placeholder for depth, as satellites do.
 */
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { SampledDepthBinding } from '../../../../@types/rendering/SampledDepthBinding';
import type { AsteroidPointFrame } from '../@types/AsteroidPointFrame';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { sampledDepthBinding } from '../../../../services/engine/frame/sampledDepthBinding';
import { sceneOccluderSpheres } from '../../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayClipScale } from '../../../../services/engine/frame/near0OverlayClipScale';
import { near0OverlayVpF32 } from '../../../../services/engine/frame/near0OverlayVpF32';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import { asteroidExposureRamp } from '../utils/asteroidExposureRamp';
import { asteroidWindowFade } from '../../kepler/utils/asteroidWindowFade';
import { asteroidsDrawn } from '../../kepler/utils/asteroidsDrawn';

export function asteroidsPass(runtime: AsteroidsRuntime): ContentPass<'asteroids'> {
  const frameOf = (
    view: SlabView,
    ctx: FrameView,
    state: PassState,
    fade: Readonly<Record<AsteroidClass, number>>,
    depth: SampledDepthBinding,
  ): AsteroidPointFrame => {
    const eye = view.camPos;
    const au = SCALE_UNITS.AU_TO_MPC;
    const sunFromCamAu: Vec3 = [
      (RENDER_ORIGIN_MPC[0] - eye[0]) / au,
      (RENDER_ORIGIN_MPC[1] - eye[1]) / au,
      (RENDER_ORIGIN_MPC[2] - eye[2]) / au,
    ];
    return {
      vp: near0OverlayVpF32(
        rebaseViewProj(view.slab.vp, eye),
        near0OverlayClipScale(view.slab.near),
      ),
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
      sunFromCamAu,
      exposure:
        asteroidExposureRamp(Math.hypot(...sunFromCamAu)) * state.settings.asteroids.brightness,
      windowFade: asteroidWindowFade(ctx.snapshot.simDays),
      classFade: fade,
      selectedRow: SELECTION_NONE_SENTINEL,
      selectedCamRelAu: [0, 0, 0],
      occluders: sceneOccluderSpheres(state, ctx),
      depth,
    };
  };

  return {
    name: 'asteroids',
    fade: 'asteroids',

    enabled(_state, ctx, _view, fade) {
      return runtime.solver.rows() !== null && asteroidsDrawn(fade, ctx.snapshot.simDays);
    },

    draw(pass, view, ctx, state, fade) {
      const depth = sampledDepthBinding(
        view.sampledDepth,
        ctx.bodyPose,
        ctx.snapshot.renderTargets,
      );
      runtime.renderer.draw(pass, frameOf(view, ctx, state, fade, depth));
    },

    pickTarget: 'overlay',

    drawPick(pass, view, ctx, state, fade) {
      const depth = { frame: null, view: ctx.snapshot.renderTargets.farDepthView() };
      runtime.renderer.drawPick(pass, frameOf(view, ctx, state, fade, depth));
    },
  };
}
