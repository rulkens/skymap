/**
 * galaxyThumbnailsPass — DEPRECATED no-op shim.
 *
 * The legacy combined "thumbnails + procedural disks" pass was split
 * into `proceduralDisksPass` and `texturedImpostorsPass` during the
 * 2026-05-12 impostor-subsystem-split work (Task 11/12).  Production
 * no longer references this pass — it was removed from
 * `HDR_PASSES` in Task 12.
 *
 * The file is intentionally retained until Task 14 because the visual
 * baseline test (`tests/visual/galaxyImpostorBaseline.test.ts`) still
 * imports the legacy `createThumbnailSubsystem` directly, and the
 * old `passes.test.ts` import history points here.  Task 14 deletes
 * this file together with `thumbnailSubsystem.ts` once the new
 * subsystem tests have settled.
 *
 * Body retained as a no-op stub so the file compiles (the
 * `ReadyFrameContext.thumbnails` field is gone post-Task-11).
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const galaxyThumbnailsPass: Pass = {
  name: 'galaxy-thumbnails',

  enabled() {
    return false;
  },

  draw() {
    // no-op — superseded by proceduralDisksPass + texturedImpostorsPass.
  },
};
