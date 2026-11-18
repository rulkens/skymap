/**
 * runLabelDirector — one frame of the label director for `slab`: encodes its sources (each only
 * when its `changes` value moved), gathers the frame's inputs, runs `LABEL_STAGES` and hands the
 * records to the slab's renderer. Nothing runs before the font atlases load (text is laid out at
 * encode time), and a director whose toggles have all been 0 since its last settled frame skips
 * its stages: its alphas are already 0. Returns true while a fade is mid-ramp.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { LabelDirectorState } from '../../../@types/rendering/LabelDirectorState';
import { LABEL_STAGES } from '../../../data/labels/labelStages';
import {
  LABEL_GLYPH_CAPACITY,
  LABEL_RECORD_CAPACITY,
} from '../../../data/labels/labelRecordCapacity';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';
import { createLabelRecords } from '../../../utils/labels/createLabelRecords';
import type { LabelAddress } from '../../../@types/animation/LabelAddress';
import { encodeLabelSource } from '../../../utils/labels/encodeLabelSource';
import { outputProjectionOf } from '../../../utils/labels/outputProjectionOf';
import { encodeSelectionPick } from '../../../utils/selection/encodeSelectionPick';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { createLabelFrame } from '../labels/createLabelFrame';
import { emphasisOf } from '../presentation/emphasisOf';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';
import { sceneBodyStates } from './sceneBodyStates';
import { sceneOccluderBodies } from './sceneOccluderBodies';
import { COSMO } from './slabs';

export function runLabelDirector(state: EngineState, ctx: FrameView, slab: number): boolean {
  const director: LabelDirectorState = state.subsystems.labelDirectors.find(
    (d) => d.row.slab === slab,
  )!;
  const fontAtlases = state.gpu.fontAtlases;
  if (director.sources.length === 0 || fontAtlases === null) return false;
  if (director.records === null) {
    director.records = createLabelRecords(
      LABEL_RECORD_CAPACITY,
      LABEL_GLYPH_CAPACITY,
      fontAtlases.metricsByFont,
    );
    director.records.toggleAddresses.push(
      ...director.sources.map((s): LabelAddress => `label:${s.toggle}`),
    );
  }
  director.frame ??= createLabelFrame(LABEL_RECORD_CAPACITY);
  const { records, frame } = director;

  let at = 0;
  director.sources.forEach((source, ordinal) => {
    at += encodeLabelSource(source, state, records, at, ordinal);
  });
  records.count = at;

  const toggleFades = records.toggleAddresses.map((address) =>
    resolveViewFadeValue(state, ctx, address),
  );
  const off = toggleFades.every((fade) =>
    typeof fade === 'number' ? fade === 0 : Object.values(fade).every((v) => v === 0),
  );
  if (off && director.idle) return false;

  const projection = outputProjectionOf(ctx, VIEW_RIGS[state.viewRig]);
  // The focused selection itself: the receding-focus snapshot word is null for a body focus.
  const focusPickId = encodeSelectionPick(state.selectionKindRows, state.selection.focus);
  const hoveredPick = encodeSelectionPick(state.selectionKindRows, state.selection.hover);
  const selectedPick = encodeSelectionPick(state.selectionKindRows, state.selection.select);
  const inputs = {
    director: director.row,
    projection,
    bodyStates: sceneBodyStates(state, ctx),
    meshBodies: ctx.snapshot.meshBodies,
    nowMs: ctx.snapshot.nowMs,
    toggleFades,
    recessions: records.toggleAddresses.map((address) =>
      emphasisOf(visibilityEntryOf(state.visibilityEntries, address), ctx.snapshot),
    ),
    focusPickId,
    hoveredPick,
    selectedPick,
    focusedOnly: state.settings.labels.focusedOnly,
    focus: ctx.snapshot.focus,
    occluders: sceneOccluderBodies(state, ctx),
  };
  for (const stage of LABEL_STAGES) stage(records, frame, inputs);

  const renderer = slab === COSMO ? state.gpu.labelRendererCosmo : state.gpu.labelRendererNear;
  renderer?.set(records);
  // A renderer built later uploads everything, so the range is spent either way.
  records.dirtyFrom = records.dirtyTo;
  director.view = { projection, hoveredPick, selectedPick };
  director.idle = off && !frame.ramping;
  return frame.ramping;
}
