/**
 * partitionCaptureSteps — a frame program split into one step group per
 * capture face plus the frame's own steps, program order kept within each.
 * Each face submits its own command buffer (`renderFrame`), and steps group by
 * face rather than by adjacency so two lines naming one face still land in
 * one submission — a second would re-clear what the first drew.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';

export function partitionCaptureSteps(program: readonly FrameStep[]): {
  readonly faces: readonly {
    readonly key: CubemapCaptureKey;
    readonly face: CubeFace;
    readonly steps: readonly FrameStep[];
  }[];
  readonly frame: readonly FrameStep[];
} {
  const faces = new Map<string, { key: CubemapCaptureKey; face: CubeFace; steps: FrameStep[] }>();
  const frame: FrameStep[] = [];
  for (const step of program) {
    if (step.kind !== 'render' || step.capture === undefined) {
      frame.push(step);
      continue;
    }
    const { key, face } = step.capture;
    const group = faces.get(`${key}:${face}`);
    if (group === undefined) faces.set(`${key}:${face}`, { key, face, steps: [step] });
    else group.steps.push(step);
  }
  return { faces: [...faces.values()], frame };
}
