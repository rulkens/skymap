/** createLabelDirectorState — a director row with no sources yet and nothing encoded. */

import type { LabelDirectorRow } from '../../../@types/rendering/LabelDirectorRow';
import type { LabelDirectorState } from '../../../@types/rendering/LabelDirectorState';

export function createLabelDirectorState(row: LabelDirectorRow): LabelDirectorState {
  return { row, sources: [], records: null, frame: null, view: null, idle: true };
}
