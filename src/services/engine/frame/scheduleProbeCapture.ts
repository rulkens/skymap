/**
 * scheduleProbeCapture — the ONE probe subject this frame, if any, and the six
 * synthetic cameras its faces draw through. All six, or none. The SINGLE writer
 * of `state.cubemapCaptures.probe`: `subject` names what this frame's faces
 * write (null when idle), `refreshedAtMs` when each body last completed.
 *
 * The candidates are the mesh bodies drawn this frame AND resident, so a probe
 * is never captured for a body no pass will shade with it.
 */

import type { CaptureFace } from '../../../@types/engine/frame/CaptureFace';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { PROBE_REFRESH_INTERVAL_MS } from '../../../data/rendering/probeRefreshIntervalMs';
import { meshBodySlabHostId } from '../../../utils/meshBodies/meshBodySlabHostId';
import { faceViewSpec } from '../../../utils/camera/faceViewSpec';
import { cubemapCaptureFrame } from './cubemapCaptureFrame';
import { deriveView } from './deriveView';
import { sceneBodyPartition } from './sceneBodyPartition';
import { sceneBodyStates } from './sceneBodyStates';

export function scheduleProbeCapture(input: {
  readonly state: EngineState;
  readonly ctx: FrameView;
}): ReadonlyMap<CubeFace, CaptureFace> | null {
  const { state, ctx } = input;
  const runtime = state.cubemapCaptures.probe;
  runtime.subject = null;
  runtime.due = false;
  const renderer = state.gpu.meshBodyRenderer;
  if (renderer === null) return null;

  // The oldest refresh wins, a never-refreshed body oldest of all — so N bodies
  // resolving at once cycle through the one in-flight probe in turn.
  let subject: MeshBody | null = null;
  let refreshedAtMs = Number.POSITIVE_INFINITY;
  let dueCount = 0;
  for (const body of sceneBodyPartition(state, ctx).meshes) {
    if (!renderer.hasMesh(body.id)) continue;
    const at = runtime.refreshedAtMs.get(body.id) ?? Number.NEGATIVE_INFINITY;
    if (ctx.snapshot.nowMs - at >= PROBE_REFRESH_INTERVAL_MS) dueCount++;
    if (at < refreshedAtMs) {
      refreshedAtMs = at;
      subject = body;
    }
  }
  if (subject === null || ctx.snapshot.nowMs - refreshedAtMs < PROBE_REFRESH_INTERVAL_MS)
    return null;

  const row = CUBEMAP_CAPTURES.probe;
  const bodyStates = sceneBodyStates(state, ctx);
  const eyeMpc = bodyStates.get(subject.id)!.positionMpc;
  const hostId = meshBodySlabHostId(subject);
  // Cube axes = the host axes `meshBodiesPass` shades in (io.wesl's contract).
  const axes = bodyStates.get(hostId)!.orientation;
  // One frame for the whole row: null only pre-bootstrap, so the next frame retries.
  const capture = cubemapCaptureFrame({
    state,
    eyeMpc,
    nearMpc: row.nearMpc,
    nowMs: ctx.snapshot.nowMs,
    axes,
  });
  if (!capture.isReady) return null;
  const faces = new Map<CubeFace, CaptureFace>();
  for (const face of ALL_CUBE_FACES) {
    const faceCtx = deriveView(
      capture.snapshot,
      capture.cam,
      faceViewSpec(face, row.faceSizePx, row.viewSlotBase),
    );
    // The host's row is looked up in the FACE's own slab table — its painter
    // index there has nothing to do with the frame's. A face the host falls
    // outside of (looking away from it) draws no body row; a hostless body
    // would only ever find itself, which must not draw into its own probe.
    const hostSlab =
      hostId === subject.id
        ? undefined
        : faceCtx.slabs.find(
            (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === hostId,
          );
    faces.set(face, { ctx: faceCtx, bodySlabs: hostSlab === undefined ? [] : [hostSlab.index] });
  }
  runtime.subject = subject.id;
  runtime.refreshedAtMs.set(subject.id, ctx.snapshot.nowMs);
  runtime.due = dueCount > 1;
  return faces;
}
