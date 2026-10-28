/**
 * galaxyCatalogPlanner — the galaxy catalog Layer's once-per-frame CPU
 * planning row: reconciles the alias index and the structure member counts
 * against the live settings, runs the hi-res famous-galaxy
 * planner, then does the ONE catalog walk that feeds both disk planners
 * (procedural and textured). Once, not per view: the walk touches the whole
 * visible catalog, so it plans over the rig's views (anchor camera `views[0]`,
 * `pxPerRad` = the max over views) rather than five times per dome frame.
 * Its `awake`/`settling` votes report the textured planner's LANDED
 * thumbnail work — never its outstanding fetches; see the result at the tail.
 */

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { SourceType } from '../../@types/data/SourceType';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { GalaxyCatalogRuntime } from './@types/GalaxyCatalogRuntime';

import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import { buildAliasIndex } from './load/buildAliasIndex';
import { STRUCTURE_IDS_BY_SCALE } from '../../data/structure/structureIdsByScale';
import { structureMemberCount } from './present/structureMemberCount';
import { sourceMaskOf } from './present/sourceMaskOf';

export function galaxyCatalogPlanner(
  runtime: GalaxyCatalogRuntime,
): Extract<FrameContentPlanner<void, 'survey'>, { scope: 'once' }> {
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

  return {
    name: 'galaxy-catalog',
    scope: 'once',
    fade: 'survey',
    plan(snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState, fade) {
      const pgcAliasCommitted = runtime.pgcAlias.committed();
      if (pgcAliasCommitted !== null && runtime.catalogsVersion !== aliasIndexVersion) {
        aliasIndexVersion = runtime.catalogsVersion;
        runtime.publish({
          aliasIndex: buildAliasIndex({
            records: runtime.records.values(),
            aliasMap: pgcAliasCommitted.value,
          }),
        });
      }

      // Built from the handed value, so the counts, the hi-res famous gate and the
      // disk walk keep a hidden catalog through its fade-out, as the point sprites do.
      const sourceMask = sourceMaskOf(fade);

      const selectRow = state.selectionRows.select;
      if (
        selectRow !== memberCountRow ||
        sourceMask !== memberCountMask ||
        runtime.catalogsVersion !== memberCountVersion
      ) {
        memberCountRow = selectRow;
        memberCountMask = sourceMask;
        memberCountVersion = runtime.catalogsVersion;
        runtime.publish({
          // Narrowed on the row's own tag, never a structural sniff — only a
          // `structure` arm of a cosmic category (one with galaxy members) is countable.
          structureMemberCount:
            selectRow !== null &&
            selectRow.type === 'structure' &&
            STRUCTURE_IDS_BY_SCALE.cosmic.includes(selectRow.category)
              ? structureMemberCount(selectRow, runtime.records, sourceMask)
              : null,
        });
      }

      // The once row's rig-wide anchor (mirrors `starCutInputs.ts`'s
      // views[0]-is-anchor contract): the widest face sizes the walk, the
      // first view's camera aims it — the disk walk touches the whole visible
      // catalog (~2.5M rows), so a per-view re-walk would be a 5× CPU cost
      // for a threshold nudge.
      const cam = views[0]!.cam;
      const pxPerRad = Math.max(...views.map((view) => view.drawPxPerRad));

      // hiResFamous must run BEFORE the shared disk walk: the textured-disk body
      // folds `hiResFamous.lastOutput.byFamousIdx` into the instances it emits;
      // after would lag a frame and flicker on close approach.
      const pair = runtime.hiResFamous.committed()?.value ?? null;
      if (pair !== null) {
        pair.subsystem.runFrame({
          cam,
          catalogs: runtime.catalogs,
          sourceMask,
          pxPerRad,
          famousGalaxiesMeta: runtime.famousMeta,
        });
      }

      // ONE catalog walk feeds both disk planners (LOD-1 procedural, then LOD-2
      // textured); each `beginFrame` returns the visitor the walk drives.
      const sharedInput = {
        cam,
        records: runtime.records,
        sourceMask,
        pxPerRad,
        // Both LOD disk bodies fold this into their emitted alpha/brightness so a
        // hidden catalog's disks fade out with the point sprites instead of
        // popping once the fade ends and the mask drops the source. The handed
        // value itself, clip included.
        sourceOpacity: (source: SourceType) => fade[galaxyCatalogIdOf(source)],
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
      return { value: undefined, awake: fading, settling: fading };
    },
  };
}
