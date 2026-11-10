import InspectorHead from '../../../primitives/components/InspectorHead/InspectorHead';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import { formatDuration } from '../../../utils/format/formatDuration';

type Props = {
  readonly label: string;
  /** Null while the draft is unresolved or invalid. */
  readonly durationSec: number | null;
  /** The Start row's value: `saved view` or `live view`. */
  readonly start: string;
};

/** Nothing selected: the clip itself. */
function ClipInspector({ label, durationSec, start }: Props) {
  return (
    <>
      <InspectorHead
        where="Clip"
        range={durationSec === null ? undefined : formatDuration(durationSec)}
        title={label}
      />
      <InspectorRow label="Start">
        <ReadoutField>{start}</ReadoutField>
      </InspectorRow>
    </>
  );
}

export default ClipInspector;
