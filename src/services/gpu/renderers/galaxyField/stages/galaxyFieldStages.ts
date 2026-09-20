/**
 * The effect half of the analytic field's dependency graph, as data: table
 * order IS the schedule; `after` proves it and supplies the re-run edge,
 * prepended to each row's own key. `ismMap` leads the two scans, so a new
 * galaxy scans once from the final map instead of once per trigger. The `sync`
 * rows run inside `setMixture`; the `step` rows are deferred to `stepIsmMap`,
 * which the host must call before the frame's own encoder exists — the four
 * `place:*` rows and `orientation:tex` each submit their own encoder that has
 * to precede it (`orientation:data` alone submits nothing: the readback hook).
 */

import type { GalaxyFieldStageContext } from '../../../../../@types/galaxy/GalaxyFieldStageContext';
import type { GalaxyFieldStageName } from '../../../../../@types/galaxy/GalaxyFieldStageName';
import type { Stage } from '../../../../../@types/gpu/Stage';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ismMapGridRadiusOrDefault,
} from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { ISM_MAP_AMBIENT_DUST } from '../../../../../utils/galaxy/ismMapAmbientDust';
import { buildDigArmEnvelopeTable } from '../ismMap/buildDigArmEnvelopeTable';
import { buildArmCloudDispatchInput } from './buildArmCloudDispatchInput';
import { buildDigDispatchInput } from './buildDigDispatchInput';
import { buildDustDispatchInput } from './buildDustDispatchInput';
import { buildSpurCloudDispatchInput } from './buildSpurCloudDispatchInput';

export const GALAXY_FIELD_STAGES: readonly Stage<GalaxyFieldStageName, GalaxyFieldStageContext>[] =
  [
    {
      name: 'ismMap',
      phase: 'sync',
      after: [],
      // No `arms.widthScale`, though the forcing field bakes against the ridge
      // it sizes: this rebuild is N compute dispatches, so keying on it would
      // make an arm-width drag pay them per frame. Deliberately left stale
      // until `ismMap` itself moves.
      key: (ctx) => [
        ctx.input.geometry,
        ctx.input.fieldTuning.ismMap,
        ctx.input.fieldTuning.ismMapFluid,
        ctx.input.seed,
      ],
      run: (ctx) => {
        const grid = ctx.chain.generator.rebuild({
          geometry: ctx.input.geometry,
          tuning: ctx.input.fieldTuning,
          seed: ctx.input.seed,
        });
        if (ctx.input.fieldTuning.ismMap.generator === 'fluid') {
          const enc = ctx.device.createCommandEncoder({ label: 'galaxy:ismMapRingReduceRebuild' });
          // ringMeansBuffer written HERE; the two scan rows' own LATER submits
          // read it — WebGPU's cross-SUBMIT ordering on one queue is what makes
          // that safe with no barrier of our own.
          ctx.chain.ringReduce.dispatchRingMeans(enc);
          ctx.device.queue.submit([enc.finish()]);
        }
        // Fires on BOTH exits, the disabled one too, so the host's CPU copy
        // reflects the cleared texture rather than an earlier galaxy's map.
        ctx.hooks.onIsmMapRebuilt?.(grid);
      },
    },
    {
      name: 'scan:dust',
      phase: 'sync',
      after: ['ismMap'],
      // No `geometry` of its own — the map token already moves on one — and
      // `dustPlacementCap` is the only `dust` lane the scan reads.
      key: (ctx) => [
        ctx.input.fieldTuning.dust.cloud.dustPlacementCap,
        ctx.input.fieldTuning.ismMap,
      ],
      run: (ctx) => {
        if (!ctx.input.geometry || ctx.input.fieldTuning.ismMap.generator !== 'fluid') return;
        const grid = ismMapGridRadiusOrDefault(ctx.input.geometry);
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:ismMapDustCdfScanRebuild' });
        // `ringCap` reproduces dustParticleCloud.ts's density() ring-mean-
        // normalised, capped placement density (ismMapDustCdfScan.wesl's own doc).
        ctx.chain.dustCdfScan.dispatchScan(enc, {
          ismMapTexture: ctx.chain.generator.texture,
          grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
          weights: {
            kind: 'channel',
            channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
            ringCap: ctx.input.fieldTuning.dust.cloud.dustPlacementCap ?? 0,
          },
          ringMeansBuffer: ctx.chain.generator.ringMeansBuffer,
        });
        ctx.device.queue.submit([enc.finish()]);
      },
    },
    {
      name: 'scan:dig',
      phase: 'sync',
      after: ['ismMap'],
      // `arms.widthScale` because `buildDigArmEnvelopeTable` sizes its
      // cross-arm sigma from it (`armCrossSigma`) — the same single lane
      // `centralHii` keys on, and the only part of `arms` this row reads.
      key: (ctx) => [
        ctx.input.fieldTuning.hii.dig,
        ctx.input.fieldTuning.arms.widthScale,
        ctx.input.fieldTuning.ismMap,
        ctx.input.geometry,
      ],
      run: (ctx) => {
        const geo = ctx.input.geometry;
        if (!geo || ctx.input.fieldTuning.ismMap.generator !== 'fluid') return;
        const grid = ismMapGridRadiusOrDefault(geo);
        // Clamped HERE, at the packing call site: `buildDigVeil`'s CPU original
        // clamps to [0, 1] before ever building the envelope, and the scan
        // shader trusts whatever `params.armBias` it is handed.
        const armBias = Math.min(1, Math.max(0, ctx.input.fieldTuning.hii.dig?.armBias ?? 0));
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:ismMapDigCdfScanRebuild' });
        ctx.chain.digCdfScan.dispatchScan(enc, {
          ismMapTexture: ctx.chain.generator.texture,
          grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
          weights: {
            kind: 'armBiased',
            // DIG's own CDF weights the map's `activity` channel alone.
            channelWeights: { gas: 0, stars: 0, activity: 1, dust: 0 },
            armBias,
            armCount: geo.arms.length,
            entries: buildDigArmEnvelopeTable(geo, ctx.input.fieldTuning, {
              rings: ISM_MAP_RINGS,
              rMin: grid.rMin,
              rMax: grid.rMax,
            }),
          },
          ringMeansBuffer: ctx.chain.generator.ringMeansBuffer,
        });
        ctx.device.queue.submit([enc.finish()]);
      },
    },
    {
      name: 'upload:field',
      phase: 'sync',
      after: [],
      key: (ctx) => [ctx.model.fieldPack.get()],
      run: (ctx) => ctx.fieldComps.write(ctx.model.fieldPack.get().packed),
    },
    {
      name: 'upload:hii',
      phase: 'sync',
      after: [],
      key: (ctx) => [ctx.model.hiiPack.get()],
      run: (ctx) => ctx.hiiComps.write(ctx.model.hiiPack.get().packed),
    },
    {
      name: 'orientation:tex',
      phase: 'step',
      after: ['ismMap'],
      // Two independent consumers — the debug overlay and dust placement, each
      // reading `orientationTex` on the GPU — so either one alone is worth the
      // six dispatches. Needs no readback to run FROM: ismMapTex is a texture
      // WebGPU zero-initialises, so dispatching before `ismMap` has ever
      // populated it is safe.
      wanted: (ctx) =>
        ctx.input.orientationViewWanted || ctx.input.fieldTuning.ismMap.generator !== 'none',
      key: (ctx) => [ctx.input.sigmaDerivTexels, ctx.input.sigmaIntegTexels, ctx.input.geometry],
      run: (ctx) => {
        // gasFloor=1 when the generator is off: the map texture is a cleared
        // (all-zero) blank then, and ismMapOrientationField.wesl's
        // IsmMapOrientationPedestal derives its zero-gradient invariant from
        // gasProfile(r) collapsing to a flat 1.0 — a real fluid gasFloor here
        // would subtract a non-flat pedestal from that blank data and paint a
        // fake radial gradient into the orientation view. gasScaleLength must
        // still be finite even though it's then algebraically unused.
        const pedestal =
          ctx.input.fieldTuning.ismMap.generator === 'fluid'
            ? ctx.input.fieldTuning.ismMapFluid
            : { gasFloor: 1, gasScaleLength: 1 };
        ctx.chain.orientation.dispatch({
          grid: ismMapGridRadiusOrDefault(ctx.input.geometry),
          sigmaDerivTexels: ctx.input.sigmaDerivTexels,
          sigmaIntegTexels: ctx.input.sigmaIntegTexels,
          gasFloor: pedestal.gasFloor,
          gasScaleLength: pedestal.gasScaleLength,
          ambient: ISM_MAP_AMBIENT_DUST,
        });
      },
    },
    {
      name: 'orientation:data',
      phase: 'step',
      after: ['orientation:tex'],
      // The CPU copy of the orientation field — diagnostics-only (the host's
      // coherence-stat report); a disabled generator has nothing coherent to
      // report either.
      wanted: (ctx) => ctx.input.fieldTuning.ismMap.generator !== 'none',
      key: () => [],
      run: (ctx) => ctx.hooks.onOrientationRebuilt?.(ismMapGridRadiusOrDefault(ctx.input.geometry)),
    },
    {
      name: 'place:dust',
      phase: 'step',
      after: ['orientation:tex', 'scan:dust', 'upload:field'],
      wanted: (ctx) => ctx.model.dustBudget.get() !== null,
      key: (ctx) => [
        ctx.model.dustBudget.get(),
        ctx.input.seed,
        ctx.input.fieldTuning.ismMap.generator,
      ],
      run: (ctx) => {
        const geo = ctx.input.geometry;
        const budget = ctx.model.dustBudget.get();
        if (!geo || !budget) return;
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:placeDust' });
        ctx.chain.placeDust.dispatchPlaceDust(enc, buildDustDispatchInput(ctx, geo, budget));
        // Survivor-sum + Larson renorm, encoded into the SAME encoder/submit
        // right after the dispatch: cross-pass ordering within one submit is
        // what lets this read `placeDust.massBuffer` fresh with no readback of
        // its own, tying the renorm's freshness to THIS placement.
        ctx.chain.ringReduce.dispatchSurvivorSum(enc, {
          massBuffer: ctx.chain.placeDust.massBuffer,
          count: budget.count,
          totalMass: budget.totalMass,
        });
        ctx.device.queue.submit([enc.finish()]);
      },
    },
    {
      name: 'place:spur',
      phase: 'step',
      after: ['upload:field'],
      wanted: (ctx) => ctx.model.centralField.get().spurCloudReservation !== null,
      key: (ctx) => [ctx.model.centralField.get(), ctx.input.seed, ctx.input.fieldTuning.arms],
      run: (ctx) => {
        const geo = ctx.input.geometry;
        const reservation = ctx.model.centralField.get().spurCloudReservation;
        if (!geo || !reservation) return;
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloud' });
        ctx.chain.placeArmSpurCloud.dispatchPlaceArmSpurCloud(
          enc,
          buildSpurCloudDispatchInput(ctx, geo, reservation),
        );
        ctx.chain.ringReduce.dispatchArmSpurFluxWeightSum(enc, {
          fluxWeightBuffer: ctx.chain.placeArmSpurCloud.fluxWeightBuffer,
          count: reservation.count,
        });
        ctx.device.queue.submit([enc.finish()]);
      },
    },
    {
      name: 'place:arm',
      phase: 'step',
      after: ['upload:field'],
      wanted: (ctx) => ctx.model.centralField.get().armCloudReservation !== null,
      key: (ctx) => [ctx.model.centralField.get(), ctx.input.seed, ctx.input.fieldTuning.arms],
      run: (ctx) => {
        const geo = ctx.input.geometry;
        const reservation = ctx.model.centralField.get().armCloudReservation;
        if (!geo || !reservation) return;
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:placeArmCloud' });
        ctx.chain.placeArmCloud.dispatchPlaceArmCloud(
          enc,
          buildArmCloudDispatchInput(ctx, geo, reservation),
        );
        ctx.chain.ringReduce.dispatchArmCloudFluxWeightSum(enc, {
          fluxWeightBuffer: ctx.chain.placeArmCloud.fluxWeightBuffer,
          count: reservation.count,
        });
        ctx.device.queue.submit([enc.finish()]);
      },
    },
    {
      name: 'place:dig',
      phase: 'step',
      after: ['scan:dig', 'upload:hii'],
      wanted: (ctx) => ctx.model.digBudget.get() !== null,
      // `hiiPack` is redundant with the `upload:hii` edge as the table stands
      // (that row keys on exactly this node and has no `wanted`). Declared
      // anyway: this dispatch writes at the segment table's `hii:dig` offset,
      // so a `wanted` added to `upload:hii` later must not be able to leave
      // the DIG span silently misaddressed.
      key: (ctx) => [
        ctx.model.digBudget.get(),
        ctx.model.hiiPack.get(),
        ctx.input.seed,
        ctx.input.fieldTuning.ismMap.generator,
      ],
      run: (ctx) => {
        const geo = ctx.input.geometry;
        const budget = ctx.model.digBudget.get();
        if (!geo || !budget) return;
        const enc = ctx.device.createCommandEncoder({ label: 'galaxy:placeDigVeil' });
        ctx.chain.placeDigVeil.dispatchPlaceDigVeil(enc, buildDigDispatchInput(ctx, geo, budget));
        ctx.device.queue.submit([enc.finish()]);
      },
    },
  ];
