/**
 * drawOrbitConics — packs the trails that survive culling and issues the renderer's one draw.
 * The staging buffer is module-level and grown on demand: safe to share because `renderer.draw`
 * copies it into the renderer's own buffer before returning.
 */

import type { OrbitTrail } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrail';
import type { OrbitTrailRenderer } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailRenderer';
import type { OrbitTrailView } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailView';
import { writeOrbitTrailRecord } from '../../../utils/orbit/writeOrbitTrailRecord';
import { INSTANCE_FLOATS } from '../../gpu/renderers/bodies/orbitTrailRenderer';

let staging = new Float32Array(0);

export function drawOrbitConics(
  pass: GPURenderPassEncoder,
  renderer: OrbitTrailRenderer,
  trails: readonly OrbitTrail[],
  at: OrbitTrailView,
): void {
  if (staging.length < trails.length * INSTANCE_FLOATS) {
    staging = new Float32Array(trails.length * INSTANCE_FLOATS);
  }
  let count = 0;
  for (const trail of trails) {
    const wrote = writeOrbitTrailRecord(
      {
        slabVp: at.slabVp,
        viewportPx: at.viewportPx,
        eyeMpc: at.eyeMpc,
        pxPerRad: at.pxPerRad,
        ...trail,
      },
      staging,
      count * INSTANCE_FLOATS,
    );
    if (wrote) count++;
  }
  if (count === 0) return;
  renderer.draw(pass, {
    instances: staging,
    count,
    occluders: at.occluders,
    depth: at.depth,
    showImpostor: at.showImpostor,
  });
}
