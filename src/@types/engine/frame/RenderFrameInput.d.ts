/**
 * RenderFrameInput — per-frame inputs for `renderFrame()`.
 *
 * Every field is read; nothing is mutated.  The encoder is created
 * and finished inside `renderFrame` so no GPU lifecycle leaks back
 * to the caller.
 *
 * ### `state` arrived in D.2
 *
 * Pre-D.2, `renderFrame` consumed only the per-frame snapshot
 * (`ctx`) plus settings — engine state was never read directly here.
 * D.2's `Pass.draw` signature accepts `state` so that future passes
 * can read engine-side data (selection, picking, sources) without a
 * `RenderFrameSettings` field for every consumer.  None of today's
 * four passes actually read `state`, but the field is plumbed
 * through so the type system supports passes that need it without
 * a follow-up migration.
 */

import type { EngineState } from '../state/EngineState';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/Source';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayRenderer } from '../../rendering/MilkyWayRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { ScalarVolumeRenderer } from '../../rendering/ScalarVolumeRenderer';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { RenderFrameSettings } from './RenderFrameSettings';

export type RenderFrameInput = {
  /**
   * Per-frame derived snapshot.  Carries the camera, view-projection
   * matrix, viewport size, camera-position tuple, pixel-per-radian
   * scalar, plus the post-bootstrap-narrowed `renderer`, `postProcess`,
   * and `thumbnails` handles.  See `frameContext.ts`.
   */
  ctx: ReadyFrameContext;
  /**
   * Engine state — forwarded to each `Pass.draw` so per-pass logic
   * can read selection / picking / source-state without going via
   * settings.  Today's four HDR passes don't read it (they consume
   * settings + ctx + deps); the parameter exists for future passes.
   */
  state: EngineState;
  /**
   * Animation time in seconds for the Milky Way impostor, already
   * scaled by the engine's chosen "slow but alive" factor (0.25× wall
   * clock).  See `engine.ts` for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;

  // ── GPU handles ───────────────────────────────────────────────────────
  device: GPUDevice;
  context: GPUCanvasContext;
  milkyWayRenderer: MilkyWayRenderer;
  /**
   * Optional cosmic-web filament-skeleton renderer.  Null when the
   * GPU init flow hasn't created it yet, or — by design — when the
   * deployment doesn't ship a `filaments.bin`.  `filamentsPass` gates
   * its own draw on this being non-null AND the user toggle being on,
   * so a missing renderer is silently a no-op.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * Optional 3D scalar-field volume renderer.  Null before `initGpu`
   * constructs it (same brief bootstrap window as the other optional
   * renderers).  Both `encodeVolumes` (pre-HDR half-res raymarch) and
   * `volumeUpsamplePass.enabled` null-check this handle so a null
   * state is silently a no-op — no render pass is opened and no draw
   * is invoked.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * TexturedDiskRenderer reference forwarded straight to the thumbnail
   * subsystem.  The subsystem already `bindAtlas`-bound it at
   * engine-startup; the per-frame `runFrame` input still takes it as
   * an explicit field (legacy of the pre-extraction inline body) so we
   * forward it unchanged.  See thumbnailSubsystem.runFrame.
   */
  texturedDiskRenderer: TexturedDiskRenderer;
  /**
   * Procedural-disk renderer reference forwarded through to the
   * `PassDeps` bag for the LOD-1 pass.  Same forward-it-as-an-explicit-
   * field pattern as its disk sibling above.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer;

  // ── Settings ──────────────────────────────────────────────────────────
  settings: RenderFrameSettings;

  // ── Forwarded to the thumbnail subsystem ──────────────────────────────
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  catalogs: Map<SourceType, GalaxyCatalog>;

  /**
   * Per-pass GPU timing service (always non-null; check `.enabled`
   * before doing timing work).  When enabled, `renderFrame` takes
   * the split-pass path so each HDR pass carries its own
   * `timestampWrites` descriptor, then records the resolve + copy
   * commands via `endFrame` on the same encoder.
   */
  timingService: GpuTimingService;
};
