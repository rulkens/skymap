import { APP_CLIP_REGISTRY } from '../../../../../../src/compositions/appClips';
import InspectorPanel from '../../../primitives/components/InspectorPanel/InspectorPanel';
import ClipInspector from '../ClipInspector/ClipInspector';
import RowInspector from '../RowInspector/RowInspector';
import type { ClipData } from '../../../../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { Timeline } from '../../../@types/rows/Timeline';
import type { TimelineRow } from '../../../@types/rows/TimelineRow';
import type { StudioResolution } from '../../../@types/session/StudioResolution';

type InspectorProps = {
  readonly draft: ClipData | null;
  /** The full tree, nothing collapsed. */
  readonly timeline: Timeline | null;
  readonly row: TimelineRow | null;
  readonly resolution: StudioResolution | null;
  readonly clipId: ClipId | null;
  readonly objects: ObjectIndex;
};

/** The selected row's settings, or the clip's when nothing is selected. */
function Inspector({ draft, timeline, row, resolution, clipId, objects }: InspectorProps) {
  if (draft === null || timeline === null) return null;

  return (
    <InspectorPanel label="Step settings">
      {row === null ? (
        <ClipInspector
          label={clipId === null ? 'Clip' : APP_CLIP_REGISTRY[clipId].label}
          durationSec={timeline.durationSec}
          start={timeline.rows[0]?.label.value ?? ''}
        />
      ) : (
        // Keyed by row: a slider's gesture must not carry over to the next row's (one Undo each).
        <RowInspector
          key={row.id}
          row={row}
          rows={timeline.rows}
          draft={draft}
          resolution={resolution}
          objects={objects}
        />
      )}
    </InspectorPanel>
  );
}

export default Inspector;
