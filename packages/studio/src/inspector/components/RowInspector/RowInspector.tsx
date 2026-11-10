import AlertChip from '../../../primitives/components/AlertChip/AlertChip';
import InspectorHead from '../../../primitives/components/InspectorHead/InspectorHead';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import { COMPILE_REASON_TEXT } from '../../../data/compileReasonText';
import { formatRange } from '../../utils/formatRange';
import { formatRowTitle } from '../../utils/formatRowTitle';
import { inspectorSpec } from '../../utils/inspectorSpec';
import { resolvedText } from '../../utils/resolvedText';
import { rowContext } from '../../utils/rowContext';
import { shownFields } from '../../utils/shownFields';
import { rowSubject } from '../../../draft/utils/rowSubject';
import FieldRow from '../FieldRow/FieldRow';
import StartModeField from '../StartModeField/StartModeField';
import type { ClipData } from '../../../../../../src/@types/animation/ClipData';
import type { TimelineRow } from '../../../@types/rows/TimelineRow';
import type { StudioResolution } from '../../../@types/session/StudioResolution';

type Props = {
  readonly row: TimelineRow;
  /** The full tree, nothing collapsed. */
  readonly rows: readonly TimelineRow[];
  readonly draft: ClipData;
  readonly resolution: StudioResolution | null;
};

function RowInspector({ row, rows, draft, resolution }: Props) {
  const spec = inspectorSpec(row.kind);
  const subject = rowSubject(draft, row.ref);
  const fields = subject === null ? [] : shownFields(spec.fields, subject);
  const context = rowContext(rows, row);
  const resolved = resolvedText(row, resolution);
  const where =
    row.ref.kind === 'start' ? 'Start' : `${context.parent} · ${context.index}/${context.count}`;

  return (
    <>
      <InspectorHead
        glyph={row.glyph}
        where={where}
        range={formatRange(row.startSec, row.endSec)}
        title={formatRowTitle(row.label)}
      />
      {row.errors.map((reason) => (
        <AlertChip key={reason}>{COMPILE_REASON_TEXT[reason].long}</AlertChip>
      ))}
      {row.ref.kind === 'start' && <StartModeField start={draft.start} />}
      {subject !== null &&
        fields.map((field) => (
          <FieldRow key={field.key} spec={field} subject={subject} rowRef={row.ref} />
        ))}
      {resolved !== '' && (
        <InspectorRow label="Resolved">
          <ReadoutField>{resolved}</ReadoutField>
        </InspectorRow>
      )}
    </>
  );
}

export default RowInspector;
