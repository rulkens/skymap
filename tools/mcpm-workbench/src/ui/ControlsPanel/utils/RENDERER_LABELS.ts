import type { RendererId } from '../../../../@types/RendererId';

export const RENDERER_LABELS: Readonly<Record<RendererId, string>> = {
  raymarch: 'Raymarch',
  agents: 'Agents',
  pathTracer: 'Path tracer',
};
