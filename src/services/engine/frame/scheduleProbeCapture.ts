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
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { PROBE_REFRESH_INTERVAL_MS } from '../../../data/rendering/probeRefreshIntervalMs';
import { meshBodySlabHostId } from '../../../utils/scene/meshBodySlabHostId';
import { cubemapFaceContext } from './cubemapFaceContext';
import { sceneBodyPartition } from './sceneBodyPartition';
import { sceneBodyStates } from './sceneBodyStates';

export function scheduleProbeCapture(input: {
  readonly state: EngineState;
  readonly ctx: ReadyFrameContext;
}): ReadonlyMap<CubeFace, CaptureFace> | null {
  const { state, ctx } = input;
  const runtime = state.cubemapCaptures.probe;
  runtime.subject = null;
  const renderer = state.gpu.meshBodyRenderer;
  if (renderer === null) return null;

  // The oldest refresh wins, a never-refreshed body oldest of all — so N bodies
  // resolving at once cycle through the one in-flight probe in turn.
  let subject: MeshBody | null = null;
  let refreshedAtMs = Number.POSITIVE_INFINITY;
  for (const body of sceneBodyPartition(state, ctx).meshes) {
    if (!renderer.hasMesh(body.id)) continue;
    const at = runtime.refreshedAtMs.get(body.id) ?? Number.NEGATIVE_INFINITY;
    if (at < refreshedAtMs) {
      refreshedAtMs = at;
      subject = body;
    }
  }
  if (subject === null || ctx.nowMs - refreshedAtMs < PROBE_REFRESH_INTERVAL_MS) return null;

  const row = CUBEMAP_CAPTURES.probe;
  const bodyStates = sceneBodyStates(state, ctx);
  const eyeMpc = bodyStates.get(subject.id)!.positionMpc;
  const hostId = meshBodySlabHostId(subject);
  // Cube axes = the host axes `meshBodiesPass` shades in (io.wesl's contract).
  const axes = bodyStates.get(hostId)!.orientation;
  const faces = new Map<CubeFace, CaptureFace>();
  for (const face of ALL_CUBE_FACES) {
    const faceCtx = cubemapFaceContext({
      state,
      eyeMpc,
      face,
      faceSizePx: row.faceSizePx,
      nearMpc: row.nearMpc,
      viewSlotBase: row.viewSlotBase,
      nowMs: ctx.nowMs,
      axes,
    });
    // Null only pre-bootstrap: nothing is recorded, so the next frame retries.
    if (faceCtx === null) return null;
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
  runtime.refreshedAtMs.set(subject.id, ctx.nowMs);
  return faces;
}
