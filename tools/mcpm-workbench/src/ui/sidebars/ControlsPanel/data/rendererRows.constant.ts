import type { ComponentType } from 'react';
import type { RendererId } from '../../../../../@types/view/RendererId';
import AgentsRowsContainer from '../../../containers/render/AgentsRowsContainer';
import PathTracerRowsContainer from '../../../containers/render/PathTracerRowsContainer';
import RaymarchRowsContainer from '../../../containers/render/RaymarchRowsContainer';

/** The Rendering section's body for each renderer, each subscribed to its own slice of view. */
export const RENDERER_ROWS: Readonly<Record<RendererId, ComponentType>> = {
  raymarch: RaymarchRowsContainer,
  agents: AgentsRowsContainer,
  pathTracer: PathTracerRowsContainer,
};
