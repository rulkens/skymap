import { useAppSelector } from '../../../../../src/store/hooks';
import Inspector from '../../inspector/components/Inspector/Inspector';
import {
  selectCurrentResolution,
  selectDraft,
  selectStudioClipId,
} from '../../session/state/selectors';
import { selectFullTimeline } from '../../timeline/state/selectFullTimeline';
import { selectSelectedRow } from '../../timeline/state/selectSelectedRow';
import { useObjectIndex } from '../session/useObjectIndex';

function InspectorContainer() {
  return (
    <Inspector
      draft={useAppSelector(selectDraft)}
      timeline={useAppSelector(selectFullTimeline)}
      row={useAppSelector(selectSelectedRow)}
      resolution={useAppSelector(selectCurrentResolution)}
      clipId={useAppSelector(selectStudioClipId)}
      objects={useObjectIndex()}
    />
  );
}

export default InspectorContainer;
