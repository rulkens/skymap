/**
 * asteroidsPass — the asteroid dots, additive into HDR on the NEAR0 line after the body composite,
 * beside the satellites and under the same occlusion (sampled depth plus the analytic body spheres),
 * so a dot behind Jupiter is hidden. It draws the list the Kepler compute kept, placed about this
 * view's eye (composed in f64 each frame).
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
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { sampledDepthBinding } from '../../../../services/engine/frame/sampledDepthBinding';
import { sceneOccluderSpheres } from '../../../../services/engine/frame/sceneOccluderSpheres';
import { near0OverlayClipScale } from '../../../../services/engine/frame/near0OverlayClipScale';
import { near0OverlayVpF32 } from '../../../../services/engine/frame/near0OverlayVpF32';
import { SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import { asteroidWindowFade } from '../../kepler/utils/asteroidWindowFade';
import { asteroidsDrawn } from '../../kepler/utils/asteroidsDrawn';
import { asteroidHelioAu } from '../../kepler/utils/asteroidHelioAu';
import { asteroidSunFromCamAu } from '../../kepler/utils/asteroidSunFromCamAu';
import { selectedAsteroidRows } from '../../selection/utils/selectedAsteroidRows';
import { asteroidBeltColors } from '../utils/asteroidBeltColors';
import { asteroidKeptFraction } from '../../kepler/utils/asteroidKeptFraction';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

export function asteroidsPass(runtime: AsteroidsRuntime): ContentPass<'asteroids'> {
  const frameOf = (
    view: SlabView,
    ctx: FrameView,
    state: PassState,
    fade: Readonly<Record<AsteroidClass, number>>,
    depth: SampledDepthBinding,
  ): AsteroidPointFrame => {
    const eye = view.camPos;
    const sunFromCamAu = asteroidSunFromCamAu(eye);
    // The followed dot is placed in f64 here: the shader's f32 helio + sunFromCamAu would jitter
    // it against the camera that is following the f64 CPU mirror.
    const catalog = runtime.slot.current()?.catalog;
    const selectedRow = catalog ? selectedAsteroidRows(state.selection, catalog)[0] : undefined;
    const selectedHelio =
      selectedRow === undefined
        ? null
        : asteroidHelioAu(catalog!, selectedRow, ctx.snapshot.simDays);
    const tuning = state.settings.asteroidTuning;
    const kept = catalog
      ? asteroidKeptFraction(
          catalog.hCentiByClass,
          fade,
          ctx.cam.distance / SCALE_UNITS.AU_TO_MPC,
          tuning,
        )
      : 1;
    return {
      vp: near0OverlayVpF32(
        rebaseViewProj(view.slab.vp, eye),
        near0OverlayClipScale(view.slab.near),
      ),
      viewportPx: view.viewportPx,
      pxPerRad: ctx.drawPxPerRad,
      sunFromCamAu,
      windowFade: asteroidWindowFade(ctx.snapshot.simDays),
      classFade: fade,
      selectedRow: selectedRow ?? SELECTION_NONE_SENTINEL,
      selectedCamRelAu:
        selectedHelio === null
          ? [0, 0, 0]
          : [
              selectedHelio[0] + sunFromCamAu[0],
              selectedHelio[1] + sunFromCamAu[1],
              selectedHelio[2] + sunFromCamAu[2],
            ],
      dotRadiusPx: tuning.dotRadiusPx,
      selectedRadiusPx: tuning.selectedRadiusPx,
      dotKnee: tuning.dotKnee,
      classColors: tuning.colors,
      beltColors: asteroidBeltColors(tuning),
      sizeKneeH: tuning.sizeKneeH,
      sizeMaxScale: tuning.sizeBy === 'uniform' ? 1 : tuning.sizeMaxScale,
      thinGain: kept ** -tuning.thinGainExponent,
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
