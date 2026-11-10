import { useAppDispatch } from '../../../../../../src/store/hooks';
import { paramEdited } from '../../../session/state/studioSlice';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import NumberField from '../../../primitives/components/NumberField/NumberField';
import PickField from '../../../primitives/components/PickField/PickField';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import { FIELD_CONTROLS } from '../../data/fieldControls';
import { PICK_OPTIONS } from '../../data/pickOptions';
import { readoutText } from '../../utils/readoutText';
import { TOGGLE_OPTIONS } from './FieldRow.constants';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';
import type { RowRef } from '../../../@types/rows/RowRef';
import type { InspectorSubject } from '../../../@types/rows/InspectorSubject';

type Props = {
  readonly spec: FieldSpec<InspectorSubject>;
  readonly subject: InspectorSubject;
  readonly rowRef: RowRef;
};

/** One field of the selected row. An absent param shows its fallback dim; an authored one is bright with ↺. */
function FieldRow({ spec, subject, rowRef }: Props) {
  const dispatch = useAppDispatch();
  const control = typeof spec.control === 'function' ? spec.control(subject) : spec.control;
  const widget = FIELD_CONTROLS[control];
  const authored = subject[spec.param] !== undefined;
  const stored = subject[spec.param] ?? spec.fallback;
  const edit = (value: number | string | boolean | undefined, gesture: string | null) =>
    dispatch(paramEdited({ ref: rowRef, param: spec.param, value, label: spec.label, gesture }));
  // Only a param with a fallback is optional, so only it can go back to absent.
  const resettable = authored && spec.fallback !== undefined && !spec.readOnly;

  let field;
  if (spec.readOnly || widget.widget === 'readout') {
    field = <ReadoutField>{readoutText(spec.param, subject[spec.param])}</ReadoutField>;
  } else if (widget.widget === 'number') {
    const shown = Number(stored ?? 0);
    const display = widget.toDisplay ? widget.toDisplay(shown) : shown;
    field = (
      <NumberField
        label={spec.label}
        unit={widget.unit}
        value={display}
        step={widget.step}
        min={widget.min}
        max={widget.max}
        // The shown number back unchanged is no edit: a degrees round trip can move the last bit.
        onCommit={(v, gesture) =>
          edit(
            v === display
              ? (subject[spec.param] as number | undefined)
              : widget.fromDisplay
                ? widget.fromDisplay(v)
                : v,
            gesture,
          )
        }
      />
    );
  } else if (widget.widget === 'pick') {
    field = (
      <PickField
        label={spec.label}
        value={String(stored ?? '')}
        options={control === 'ease' ? PICK_OPTIONS.ease : PICK_OPTIONS.channel}
        onChange={(v) => edit(v, null)}
      />
    );
  } else {
    field = (
      <SegmentedField
        label={spec.label}
        value={stored === true ? 'on' : 'off'}
        options={TOGGLE_OPTIONS}
        onChange={(v) => edit(v === 'on', null)}
      />
    );
  }

  return (
    <InspectorRow
      label={spec.label}
      tip={spec.tip}
      dim={!authored && spec.fallback !== undefined}
      onReset={resettable ? () => edit(undefined, null) : undefined}
    >
      {field}
    </InspectorRow>
  );
}

export default FieldRow;
