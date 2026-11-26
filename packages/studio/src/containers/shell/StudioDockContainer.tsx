import StudioDock from '../../shell/components/StudioDock/StudioDock';
import { useRunStudioKey } from './useRunStudioKey';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';

type StudioDockContainerProps = { readonly clipId: ClipId };

function StudioDockContainer({ clipId }: StudioDockContainerProps) {
  return <StudioDock clipId={clipId} runKey={useRunStudioKey()} />;
}

export default StudioDockContainer;
