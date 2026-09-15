/**
 * subjectProbe — the probe this frame's capture faces write. The scheduler only
 * names a resident body, so a missing probe is a wiring bug, not a frame to skip.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { MeshProbe } from '../../../@types/rendering/MeshProbe';

export function subjectProbe(state: EngineState): MeshProbe {
  const subject = state.cubemapCaptures.probe.subject;
  const probe = subject === null ? null : state.gpu.meshBodyRenderer?.probeOf(subject);
  if (!probe) throw new Error(`subjectProbe: no probe for subject '${subject}'`);
  return probe;
}
