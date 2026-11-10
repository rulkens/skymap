import { effectAt } from '../../draft/utils/effectAt';
import { inspectorSpec } from './inspectorSpec';
import type { ObjectIndex } from '../../@types/kinds/ObjectIndex';
import type { TimelineRow } from '../../@types/rows/TimelineRow';
import type { StudioResolution } from '../../@types/session/StudioResolution';

/** Q22: a subject-bound step shows its subject in the head and fields; the numbers it resolved to appear only here. */
export function resolvedText(
  row: TimelineRow,
  resolution: StudioResolution | null,
  objects: ObjectIndex,
): string {
  const { resolved } = inspectorSpec(row.kind);
  if (!resolved || row.ref.kind !== 'effect') return '';
  const effect =
    resolution !== null && 'data' in resolution ? effectAt(resolution.data, row.ref.path) : null;
  return (effect && resolved(effect, objects)) || '–';
}
