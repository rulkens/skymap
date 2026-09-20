/**
 * frame — the Layer's per-frame prelude, in order: the aliasIndex reconcile,
 * the structureMemberCount reconcile, the bias-mode reconcile, the hi-res
 * famous planner, then the ONE catalog walk feeding both disk planners. Both
 * frame votes are the textured planner's LANDED thumbnail work — never its
 * outstanding fetches; see the vote at the tail.
 */

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { SourceType } from '../../@types/data/SourceType';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { LayerFrameVote } from '../../@types/engine/layer/LayerFrameVote';
import type { GalaxyCatalogRuntime } from './types/GalaxyCatalogRuntime';

import { Source } from '../../data/sources';
import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import { buildAliasIndex } from './load/buildAliasIndex';
import { structureMemberCount } from '../../utils/structure/structureMemberCount';

export function frame(
  runtime: GalaxyCatalogRuntime,
): (ctx: ReadyFrameContext, state: PassState) => LayerFrameVote {
  // Tracks the `catalogsVersion` the alias index was last built against, so a
  // fresh publish fires only on a genuine catalog change (or the pgcAlias
  // sidecar's first arrival), never once per frame.
  let aliasIndexVersion = -1;
  // The (selected row identity, visible mask, catalogsVersion) triple the
  // member count was last computed against. `-1` never equals a real
  // catalogsVersion, so the very first frame always computes.
  let memberCountRow: SelectionRow | null = null;
  let memberCountMask = -1;
  let memberCountVersion = -1;

  return (ctx, state) => {
    const pgcAliasCommitted = runtime.pgcAlias.committed();
    if (pgcAliasCommitted !== null && runtime.catalogsVersion !== aliasIndexVersion) {
      aliasIndexVersion = runtime.catalogsVersion;
      runtime.publish({
        aliasIndex: buildAliasIndex({
          catalogs: runtime.catalogs,
          aliasMap: pgcAliasCommitted.value,
          sources: [Source.Glade, Source.TwoMRS],
        }),
      });
    }

    const selectRow = state.selectionRows.select;
    if (
      selectRow !== memberCountRow ||
      ctx.visibleSourceMask !== memberCountMask ||
      runtime.catalogsVersion !== memberCountVersion
    ) {
      memberCountRow = selectRow;
      memberCountMask = ctx.visibleSourceMask;
      memberCountVersion = runtime.catalogsVersion;
      runtime.publish({
        // Narrowed on the row's own tag, never a structural sniff — only the
        // `structure` arm is countable.
        structureMemberCount:
          selectRow !== null && selectRow.type === 'structure'
            ? structureMemberCount(
                selectRow,
                (source) => runtime.catalogs.get(source),
                ctx.visibleSourceMask,
              )
            : null,
      });
    }

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

    // An OUTSTANDING fetch is deliberately not a vote: `tileStream` calls
    // `requestRender()` on every settle, success or failure, so an arrival
    // wakes its own frame and the walk that frame runs enqueues the next
    // batch. Voting it instead holds the loop open for the fetch's whole
    // duration — 30 s per request against a thumbnail host that hangs, with
    // nothing on screen changing. Only the 400 ms load fade of a bitmap that
    // LANDED is real motion, and it is the same content a sky capture must
    // re-bake for, so both votes read it.
    const fading = runtime.texturedDisks.hasFadingContent();
    return { awake: fading, settling: fading };
  };
}
