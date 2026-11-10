import { useAppSelector } from '../../../../../../src/store/hooks';
import { clipRegistry } from '../../../../../../src/data/animation/clips/clipRegistry';
import InspectorPanel from '../../../primitives/components/InspectorPanel/InspectorPanel';
import {
  selectCurrentResolution,
  selectDraft,
  selectStudioClipId,
} from '../../../session/state/selectors';
import { selectFullTimeline } from '../../../timeline/state/selectFullTimeline';
import { selectSelectedRow } from '../../../timeline/state/selectSelectedRow';
import ClipInspector from '../ClipInspector/ClipInspector';
import RowInspector from '../RowInspector/RowInspector';

/** The selected row's settings, or the clip's when nothing is selected. */
function Inspector() {
  const draft = useAppSelector(selectDraft);
  const timeline = useAppSelector(selectFullTimeline);
  const row = useAppSelector(selectSelectedRow);
  const resolution = useAppSelector(selectCurrentResolution);
  const clipId = useAppSelector(selectStudioClipId);
  if (draft === null || timeline === null) return null;

  return (
    <InspectorPanel label="Step settings">
      {row === null ? (
        <ClipInspector
          label={clipId === null ? 'Clip' : clipRegistry[clipId].label}
          durationSec={timeline.durationSec}
          start={timeline.rows[0]?.label.value ?? ''}
        />
      ) : (
        <RowInspector row={row} rows={timeline.rows} draft={draft} resolution={resolution} />
      )}
    </InspectorPanel>
  );
}

export default Inspector;
