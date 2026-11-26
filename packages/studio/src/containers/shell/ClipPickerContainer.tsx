import { useAppDispatch } from '../../../../../src/store/hooks';
import { openStudio } from '../../../../../src/state/studio/studioActions';
import ClipPicker from '../../shell/components/ClipPicker/ClipPicker';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';

type ClipPickerContainerProps = { readonly clipId: ClipId };

function ClipPickerContainer({ clipId }: ClipPickerContainerProps) {
  const dispatch = useAppDispatch();
  return <ClipPicker clipId={clipId} onPick={(id) => dispatch(openStudio(id))} />;
}

export default ClipPickerContainer;
