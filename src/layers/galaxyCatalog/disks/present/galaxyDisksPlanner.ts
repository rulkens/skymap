/**
 * galaxyDisksPlanner — the galaxy catalog Layer's once-per-frame disk row: runs the hi-res
 * famous-galaxy planner, then the ONE catalog walk that feeds both disk planners (procedural
 * and textured). Once, not per view: the walk touches the whole visible catalog, so it plans
 * over the rig's views (anchor camera `views[0]`, `pxPerRad` = the max over views) rather
 * than five times per dome frame. `hasDistanceBand`, so survey disks yield inside the
 * deep-zoom band as the point sprites do, even with survey records resident (a famous
 * selection lifts them); famous is band-exempt. Its `awake`/`settling` votes report the
 * textured planner's LANDED thumbnail work — never its outstanding fetches; see the tail.
 */

import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';

import { visibleCatalogsOf } from '../../records/utils/visibleCatalogsOf';
import { COSMO } from '../../../../services/engine/frame/slabs';
import { FRUSTUM_FLOATS_PER_VIEW } from '../../../../data/camera/frustumFloatsPerView';
import { rebaseViewProj } from '../../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../utils/camera/frustum/frustumPlanesFromViewProj';
import { occluderConesFrom } from '../../../../utils/occlusion/occluderConesFrom';
import { sceneOccluderBodies } from '../../../../services/engine/frame/sceneOccluderBodies';

export function galaxyDisksPlanner(
  runtime: GalaxyCatalogRuntime,
): Extract<FrameContentPlanner<void, 'survey'>, { scope: 'once' }> {
  return {
    name: 'galaxy-disks',
    scope: 'once',
    fade: 'survey',
    hasDistanceBand: true,
    plan(snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState, fade) {
      // Built from the handed value, so the hi-res famous gate and the disk walk keep a
      // hidden catalog through its fade-out, as the point sprites do.
      const visibleCatalogs = visibleCatalogsOf(fade);

      // The once row's rig-wide anchor (mirrors `starCutInputs.ts`'s
      // views[0]-is-anchor contract): the widest face sizes the walk, the
      // first view's camera aims it — the disk walk touches the whole visible
      // catalog (~2.5M rows), so a per-view re-walk would be a 5× CPU cost
      // for a threshold nudge.
      const cam = views[0]!.cam;
      const pxPerRad = Math.max(...views.map((view) => view.drawPxPerRad));
      // Galaxies draw in COSMO; the planes and occluder cones sit about the walk's origin,
      // cam.position. Sky captures replay this list: the lens covers part of the view with
      // its cubemap, so the disks it needs are the ones in view.
      const viewPlanes = new Float32Array(views.length * FRUSTUM_FLOATS_PER_VIEW);
      views.forEach((view, v) =>
        frustumPlanesFromViewProj(
          narrowMat4(rebaseViewProj(view.slabs[COSMO]!.vp, cam.position)),
          viewPlanes.subarray(v * FRUSTUM_FLOATS_PER_VIEW, (v + 1) * FRUSTUM_FLOATS_PER_VIEW),
        ),
      );
      const occluderCones = occluderConesFrom(sceneOccluderBodies(state, views[0]!), cam.position);

      // hiResFamous must run BEFORE the shared disk walk: the textured-disk body
      // folds `hiResFamous.lastOutput.byFamousIdx` into the instances it emits;
      // after would lag a frame and flicker on close approach.
      const pair = runtime.hiResFamous.committed()?.value ?? null;
      if (pair !== null) {
        pair.subsystem.runFrame({
          cam,
          catalogs: runtime.catalogs,
          visibleCatalogs,
          pxPerRad,
          viewPlanes,
        });
      }

      // ONE catalog walk feeds both disk planners (LOD-1 procedural, then LOD-2
      // textured); each `beginFrame` returns the visitor the walk drives.
      const sharedInput = {
        cam,
        records: runtime.records,
        visibleCatalogs,
        pxPerRad,
        viewPlanes,
        occluderCones,
        // Both LOD disk bodies fold this into their emitted alpha/brightness so a
        // hidden catalog's disks fade out with the point sprites instead of
        // popping once the fade ends and the visible set drops the catalog. The handed
        // value itself, clip and band included.
        sourceOpacity: (source: GalaxyCatalogId) => fade[source],
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
          nowMs: snapshot.nowMs,
        }),
      );

      // An OUTSTANDING fetch is deliberately not a vote: `tileStream` calls
      // `requestRender()` on every settle, success or failure, so an arrival
      // wakes its own frame and the walk that frame runs enqueues the next
      // batch. Voting it instead holds the loop open for the fetch's whole
      // duration — 30 s per request against a thumbnail host that hangs, with
      // nothing on screen changing. Only the 400 ms load fade of a bitmap that
      // LANDED is real motion, and it is the same content a sky capture must
      // re-bake for, so both votes read it.
      const fading = runtime.texturedDisks.hasFadingContent();
      return { value: undefined, awake: fading, settling: fading, loading: fading };
    },
  };
}
