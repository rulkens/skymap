import type { ReactNode } from 'react';
import type { RendererId } from '../../../../../@types/view/RendererId';
import BounceIcon from '../../../../../../../src/components/icons/BounceIcon/BounceIcon';
import ParticlesIcon from '../../../../../../../src/components/icons/ParticlesIcon/ParticlesIcon';
import RayStepsIcon from '../../../../../../../src/components/icons/RayStepsIcon/RayStepsIcon';

export const RENDERER_ICONS: Readonly<Record<RendererId, ReactNode>> = {
  raymarch: <RayStepsIcon size={12} />,
  agents: <ParticlesIcon size={12} />,
  pathTracer: <BounceIcon size={12} />,
};
