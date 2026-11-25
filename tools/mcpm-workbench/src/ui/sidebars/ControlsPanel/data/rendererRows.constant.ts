import type { ComponentType } from 'react';
import type { RendererId } from '../../../../../@types/view/RendererId';
import AgentsRows from '../../../render/AgentsRows/AgentsRows';
import PathTracerRows from '../../../render/PathTracerRows/PathTracerRows';
import RaymarchRows from '../../../render/RaymarchRows/RaymarchRows';

/** The Rendering section's body for each renderer. */
export const RENDERER_ROWS: Readonly<Record<RendererId, ComponentType>> = {
  raymarch: RaymarchRows,
  agents: AgentsRows,
  pathTracer: PathTracerRows,
};
