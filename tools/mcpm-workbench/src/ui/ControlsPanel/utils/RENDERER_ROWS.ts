import type { ComponentType } from 'react';
import type { RendererId } from '../../../../@types/RendererId';
import AgentsRows from '../AgentsRows';
import PathTracerRows from '../PathTracerRows';
import RaymarchRows from '../RaymarchRows';

/** The Rendering section's body for each renderer. */
export const RENDERER_ROWS: Readonly<Record<RendererId, ComponentType>> = {
  raymarch: RaymarchRows,
  agents: AgentsRows,
  pathTracer: PathTracerRows,
};
