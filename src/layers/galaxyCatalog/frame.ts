/**
 * frame — the per-frame prelude core's `runFrame` used to inline: the bias-mode
 * reconcile (the saga this replaces), the hi-res famous planner, then the ONE
 * catalog walk feeding both disk planners. The keep-ticking vote is the textured
 * planner's in-flight thumbnail work.
 */

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { SourceType } from '../../@types/data/SourceType';
import type { GalaxyCatalogRuntime } from './types/GalaxyCatalogRuntime';

import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';

export function frame(
  runtime: GalaxyCatalogRuntime,
): (ctx: ReadyFrameContext, state: PassState) => boolean {
  return (ctx, state) => {
    // Set FIRST, then bake: the bake is async and may reject into a warning, so
    // a compare that waited for it would re-fire every frame for its duration.
    const biasMode = state.settings.bias.mode;
    if (biasMode !== runtime.biasLastApplied) {
      runtime.biasLastApplied = biasMode;
      void runtime.biasCorrection.setMode(biasMode);
    }

    // hiResFamous must run BEFORE the shared disk walk: the textured-disk body
    // folds `hiResFamous.lastOutput.byFamousIdx` into the instances it emits;
    // after would lag a frame and flicker on close approach.
    const pair = runtime.hiResFamous.committed()?.value ?? null;
    if (pair !== null) {
      pair.subsystem.runFrame({
        cam: ctx.cam,
        catalogs: runtime.catalogs,
        visibleSourceMask: ctx.visibleSourceMask,
        pxPerRad: ctx.drawPxPerRad,
        famousGalaxiesMeta: runtime.famousMeta,
      });
    }

    // ONE catalog walk feeds both disk planners (LOD-1 procedural, then LOD-2
    // textured); each `beginFrame` returns the visitor the walk drives.
    const sharedInput = {
      cam: ctx.cam,
      catalogs: runtime.catalogs,
      visibleSourceMask: ctx.visibleSourceMask,
      pxPerRad: ctx.drawPxPerRad,
      // Both LOD disk bodies fold this into their emitted alpha/brightness so a
      // hidden catalog's disks fade out with the point sprites instead of
      // popping once `deriveSourceMasks` drops the source from the mask.
      sourceOpacity: (source: SourceType) =>
        state.subsystems.fades.opacityOf(
          { kind: 'galaxyCatalog', id: galaxyCatalogIdOf(source) },
          ctx.nowMs,
        ),
    };
    runtime.diskPlannerWalk.runFrame(
      sharedInput,
      runtime.proceduralDisks.beginFrame({
        ...sharedInput,
        sbScale: state.settings.galaxyCatalogs.sbScale,
        sbMax: state.settings.galaxyCatalogs.sbMax,
        brightness: state.settings.galaxyCatalogs.brightness,
      }),
      runtime.texturedDisks.beginFrame({
        ...sharedInput,
        famousGalaxiesMeta: runtime.famousMeta,
        nowMs: ctx.nowMs,
      }),
    );

    return runtime.texturedDisks.hasInFlightWork();
  };
}
