import StudioDock from '../../shell/components/StudioDock/StudioDock';
import { useStudioCommand } from './useStudioCommand';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';

type StudioDockContainerProps = { readonly clipId: ClipId };

function StudioDockContainer({ clipId }: StudioDockContainerProps) {
  return <StudioDock clipId={clipId} runCommand={useStudioCommand()} />;
}

export default StudioDockContainer;
