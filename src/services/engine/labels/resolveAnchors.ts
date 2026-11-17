/**
 * resolveAnchors — places each anchored record at its body's position this frame, from the
 * frame's body states (the map every per-frame consumer reads, `sceneBodyStates`). A body
 * absent this frame leaves its label unlocated, so it draws nothing: the map is total (a craft
 * before launch is parked on Earth), so a mesh body counts only while the frame admits it.
 * Words are rewritten, and marked for upload, only when the position moved.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../../data/labels/labelRecordLayout';
import { writeHiLoVertex } from '../../../utils/math/writeHiLoVertex';
import { markRecordsDirty } from '../../../utils/labels/markRecordsDirty';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';

const hiLo = new Float32Array(6);
const MESH_BODY_IDS: ReadonlySet<string> = new Set(SCENE_MESH_BODIES.map((body) => body.id));

export const resolveAnchors: LabelStage = (records, frame, { bodyStates, meshBodies }) => {
  const { f32 } = records;
  for (let i = 0; i < records.count; i++) {
    const id = records.anchorIds[i] ?? null;
    if (id === null) {
      frame.located[i] = 1;
      continue;
    }
    // A loop, not `some`: no closure per anchored record per frame.
    let absent = MESH_BODY_IDS.has(id);
    for (let b = 0; absent && b < meshBodies.length; b++) absent = meshBodies[b]!.id !== id;
    const position = absent ? undefined : bodyStates.get(id)?.positionMpc;
    frame.located[i] = position === undefined ? 0 : 1;
    if (position === undefined) continue;
    writeHiLoVertex(position, 0, hiLo, 0);
    const base = i * LABEL_RECORD_WORDS;
    let moved = false;
    for (let k = 0; k < 3; k++) {
      if (f32[base + W.atHi + k] !== hiLo[k] || f32[base + W.atLo + k] !== hiLo[3 + k])
        moved = true;
      f32[base + W.atHi + k] = hiLo[k]!;
      f32[base + W.atLo + k] = hiLo[3 + k]!;
    }
    if (moved) markRecordsDirty(records, i, i + 1);
  }
};
