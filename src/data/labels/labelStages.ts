import type { LabelStage } from '../../@types/rendering/LabelStage';
import { resolveAnchors } from '../../services/engine/labels/resolveAnchors';
import { projectRecords } from '../../services/engine/labels/projectRecords';
import { targetAlpha } from '../../services/engine/labels/targetAlpha';
import { declutterRecords } from '../../services/engine/labels/declutterRecords';
import { labelEnvelope } from '../../services/engine/labels/labelEnvelope';

/** The per-frame label stages in their fixed order; each reads only what earlier ones wrote. */
export const LABEL_STAGES: readonly LabelStage[] = [
  resolveAnchors,
  projectRecords,
  targetAlpha,
  declutterRecords,
  labelEnvelope,
];
