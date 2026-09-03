/**
 * createGalaxyFieldModel — the derived half of the analytic field: one
 * memoized node per value the shell, the stages and the probe read. Per
 * INSTANCE, never module-level — every node holds its own last key/value.
 *
 * The `input` getter is the one closure the model keeps: `setMixture`
 * reassigns the renderer's record, so a node that captured the value would key
 * on a stale galaxy for the rest of the instance's life.
 */

import type { DustHeaderLanes } from '../../../../../@types/galaxy/DustHeaderLanes';
import type { ExtraGalaxySpec } from '../../../../../@types/galaxy/ExtraGalaxySpec';
import type { FieldSliceCounts } from '../../../../../@types/galaxy/FieldSliceCounts';
import type { GalaxyFieldComponent } from '../../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldExtra } from '../../../../../@types/galaxy/GalaxyFieldExtra';
import type { GalaxyFieldMixtureInput } from '../../../../../@types/galaxy/GalaxyFieldMixtureInput';
import type { GalaxyFieldMixtureResult } from '../../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldModel } from '../../../../../@types/galaxy/GalaxyFieldModel';
import type { HiiSegment } from '../../../../../@types/galaxy/HiiSegment';
import { transformGalaxyFieldComponent } from '../../../../../utils/galaxy/transformGalaxyFieldComponent';
import { buildGalaxyFieldMixture } from '../../../../engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildHiiRegions,
  buildHiiShellsAndYoungWithSegments,
  EMPTY_SHELLS_AND_YOUNG,
} from '../../../../engine/galaxyGenerator/v2/hiiRegions';
import type { HiiShellsAndYoungResult } from '../../../../engine/galaxyGenerator/v2/hiiRegions';
import { createDerived } from '../../../lib/createDerived';
import { deriveDustHeaderLanes } from '../field/deriveDustHeaderLanes';
import { packFieldSlices } from '../field/packFieldSlices';
import { packHiiSlices } from '../field/packHiiSlices';
import { computeDigVeilBudget } from '../ismMap/computeDigVeilBudget';
import type { DigVeilBudget } from '../ismMap/computeDigVeilBudget';
import { computePlaceDustBudget } from '../ismMap/computePlaceDustBudget';
import type { PlaceDustBudget } from '../ismMap/computePlaceDustBudget';

export function createGalaxyFieldModel(deps: {
  readonly input: () => GalaxyFieldMixtureInput;
}): GalaxyFieldModel {
  const { input } = deps;

  /** Into world space — extras only; the central galaxy stays in its own frame. */
  function place(
    components: readonly GalaxyFieldComponent[],
    transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return components.map((c) => transformGalaxyFieldComponent(c, transform));
  }

  function extraFieldMixture(extra: GalaxyFieldExtra): readonly GalaxyFieldComponent[] {
    return place(
      buildGalaxyFieldMixture(extra.geometry, input().fieldTuning).components,
      extra.transform,
    );
  }

  /**
   * `geometry.seed` is what `buildHiiRegions` was called with when it still
   * lived inside `buildGalaxyFieldMixture` — the field's own generated seed,
   * not a re-derivation. `ismMap` is null for every extra: extras have no
   * ISM-map generator of their own.
   */
  function extraHiiMixture(extra: GalaxyFieldExtra): readonly GalaxyFieldComponent[] {
    return place(
      buildHiiRegions(
        extra.geometry,
        input().fieldTuning,
        input().fieldTuning.starFormation,
        extra.geometry.seed,
        null,
      ),
      extra.transform,
    );
  }

  /** The CENTRAL galaxy's field mixture, with the spur/arm-cloud reservations it carries. */
  const centralField = createDerived<GalaxyFieldMixtureResult>({
    key: () => [input().geometry, input().fieldTuning.disc, input().fieldTuning.arms],
    compute: () => {
      const geo = input().geometry;
      // No galaxy means zero components — which draws nothing, not the same as stale.
      if (!geo) return { components: [], spurCloudReservation: null, armCloudReservation: null };
      return buildGalaxyFieldMixture(geo, input().fieldTuning);
    },
  });

  /**
   * The central galaxy's HII tier — extras never take DIG, so only this path
   * pays `buildHiiShellsAndYoungWithSegments`' bookkeeping. `arms` enters the
   * key as `widthScale` alone: HII reads the arms only through `armCrossSigma`,
   * so a whole-section edge would rebuild its O(rings x az x arms) CDF sweep on
   * an arm-cloud drag that cannot change the output.
   */
  const centralHii = createDerived<HiiShellsAndYoungResult>({
    key: () => [
      input().geometry,
      input().fieldTuning.hii,
      input().fieldTuning.starFormation,
      input().fieldTuning.arms.widthScale,
    ],
    compute: () => {
      const geo = input().geometry;
      if (!geo) return EMPTY_SHELLS_AND_YOUNG;
      return buildHiiShellsAndYoungWithSegments(
        geo,
        input().fieldTuning,
        input().fieldTuning.starFormation,
        geo.seed,
      );
    },
  });

  /**
   * Each extra's own mixtures, already in world space — index-parallel to
   * `input().extras`. Two nodes rather than one pair: the tiers answer to
   * different tuning sections, so a move rebuilds only the half that moved.
   */
  const extraFieldMixtures = createDerived<readonly (readonly GalaxyFieldComponent[])[]>({
    key: () => [input().extras, input().fieldTuning.disc, input().fieldTuning.arms],
    compute: () => input().extras.map((extra) => extraFieldMixture(extra)),
  });

  const extraHiiMixtures = createDerived<readonly (readonly GalaxyFieldComponent[])[]>({
    key: () => [
      input().extras,
      input().fieldTuning.hii,
      input().fieldTuning.starFormation,
      input().fieldTuning.arms.widthScale,
    ],
    compute: () => input().extras.map((extra) => extraHiiMixture(extra)),
  });

  /** The header's dust lanes — read every frame, moved only by geometry or the dust section. */
  const dustHeaderLanes = createDerived<DustHeaderLanes>({
    key: () => [input().geometry, input().fieldTuning.dust],
    compute: () => {
      const dust = input().fieldTuning.dust;
      return deriveDustHeaderLanes(input().geometry, dust, dust.enabled);
    },
  });

  /**
   * The analytic dust lane's RESERVATION, CENTRAL galaxy only. The CPU only
   * ever sees this budget/uniform shape — `placeDust.wesl` decides slot
   * CONTENT on the GPU. `dust.enabled` gates it the way `disc.enabled`/
   * `arms.enabled` gate their shader loops: an off pill reserves nothing.
   */
  const dustBudget = createDerived<PlaceDustBudget | null>({
    key: () => [input().geometry, input().fieldTuning.dust],
    compute: () => {
      const geo = input().geometry;
      const dust = input().fieldTuning.dust;
      return geo && dust.enabled ? computePlaceDustBudget(geo, dust) : null;
    },
  });

  /**
   * The DIG veil's RESERVATION, CENTRAL galaxy only. Keyed on `centralHii`'s
   * whole record rather than the two flux lanes it reads: what used to be a
   * "call this after the HII rebuild" rule at two sites is now a declared edge.
   */
  const digBudget = createDerived<DigVeilBudget | null>({
    key: () => [input().geometry, input().fieldTuning.hii.dig, centralHii.get()],
    compute: () => {
      const geo = input().geometry;
      if (!geo) return null;
      const hii = centralHii.get();
      return computeDigVeilBudget(geo, input().fieldTuning, hii.shellFluxSum, hii.recentEventCount);
    },
  });

  const fieldPack = createDerived<{ packed: Float32Array; counts: FieldSliceCounts }>({
    key: () => [centralField.get(), extraFieldMixtures.get(), dustBudget.get()],
    compute: () =>
      packFieldSlices(
        centralField.get().components,
        extraFieldMixtures.get(),
        dustBudget.get()?.count ?? 0,
      ),
  });

  const hiiPack = createDerived<{ packed: Float32Array; segments: readonly HiiSegment[] }>({
    key: () => [centralHii.get(), extraHiiMixtures.get(), digBudget.get()],
    compute: () =>
      packHiiSlices(centralHii.get(), extraHiiMixtures.get(), digBudget.get()?.count ?? 0),
  });

  return { centralField, dustHeaderLanes, dustBudget, digBudget, fieldPack, hiiPack };
}
