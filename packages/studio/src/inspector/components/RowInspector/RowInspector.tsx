import { Fragment } from 'react';
import AlertChip from '../../../primitives/components/AlertChip/AlertChip';
import InspectorHead from '../../../primitives/components/InspectorHead/InspectorHead';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import InspectorSection from '../../../primitives/components/InspectorSection/InspectorSection';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import { effectAt } from '../../../draft/utils/effectAt';
import { REASON_TEXT } from '../../data/reasonText';
import { formatRange } from '../../utils/formatRange';
import { formatRowTitle } from '../../utils/formatRowTitle';
import { inspectorSpec } from '../../utils/inspectorSpec';
import { rowContext } from '../../utils/rowContext';
import { rowSubject } from '../../utils/rowSubject';
import FieldRow from '../FieldRow/FieldRow';
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

/** Q22: a subject-bound step shows its subject in the head and fields; the numbers it resolved to appear only here. */
function resolvedText(row: TimelineRow, resolution: StudioResolution | null): string {
  const { resolved } = inspectorSpec(row.kind);
  if (!resolved || row.ref.kind !== 'effect') return '';
  const effect =
    resolution !== null && 'data' in resolution ? effectAt(resolution.data, row.ref.path) : null;
  return (effect && resolved(effect)) || '–';
}

function RowInspector({ row, rows, draft, resolution }: Props) {
  const spec = inspectorSpec(row.kind);
  const subject = rowSubject(draft, row.ref);
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
        <AlertChip key={reason} tone="error">
          {REASON_TEXT[reason]}
        </AlertChip>
      ))}
      {subject !== null &&
        spec.fields.map((field, i) => (
          <Fragment key={field.key}>
            {field.section !== undefined && field.section !== spec.fields[i - 1]?.section && (
              <InspectorSection title={field.section} />
            )}
            <FieldRow spec={field} subject={subject} rowRef={row.ref} />
          </Fragment>
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
