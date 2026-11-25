import type { ReactNode } from 'react';
import type { RendererId } from '../../../../@types/RendererId';
import BounceIcon from '../../icons/BounceIcon/BounceIcon';
import ParticlesIcon from '../../icons/ParticlesIcon/ParticlesIcon';
import RayStepsIcon from '../../icons/RayStepsIcon/RayStepsIcon';

export const RENDERER_ICONS: Readonly<Record<RendererId, ReactNode>> = {
  raymarch: <RayStepsIcon size={12} />,
  agents: <ParticlesIcon size={12} />,
  pathTracer: <BounceIcon size={12} />,
};
