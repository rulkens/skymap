import { useAppDispatch } from '../../../../../../src/store/hooks';
import { paramEdited } from '../../../session/state/studioSlice';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import NumberField from '../../../primitives/components/NumberField/NumberField';
import LayerPickField from '../../../primitives/components/LayerPickField/LayerPickField';
import PickField from '../../../primitives/components/PickField/PickField';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import { FIELD_CONTROLS } from '../../data/fieldControls';
import { EASE_OPTIONS } from '../../data/easeOptions';
import { layerOptions } from '../../utils/layerOptions';
import { readoutText } from '../../utils/readoutText';
import { formatAddresses } from '../../../kinds/utils/formatAddresses';
import { AUTO_TEXT } from '../../../data/autoText';
import { TOGGLE_OPTIONS } from './FieldRow.constants';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';
import type { ParamValue } from '../../../@types/kinds/ParamValue';
import type { RowRef } from '../../../@types/rows/RowRef';
import type { InspectorSubject } from '../../../@types/rows/InspectorSubject';

type Props = {
  readonly spec: FieldSpec<InspectorSubject>;
  readonly subject: InspectorSubject;
  readonly rowRef: RowRef;
};

/**
 * One field of the selected row. An absent param shows dim: its fallback, or `auto` when the engine
 * decides; an authored one is bright with ↺ back to absent. A required param is always authored.
 */
function FieldRow({ spec, subject, rowRef }: Props) {
  const dispatch = useAppDispatch();
  const control = typeof spec.control === 'function' ? spec.control(subject) : spec.control;
  const widget = FIELD_CONTROLS[control];
  const authored = subject[spec.param] !== undefined;
  const canBeAbsent = spec.fallback !== undefined || spec.optional === true;
  const auto = !authored && spec.optional === true;
  const stored = subject[spec.param] ?? spec.fallback;
  const edit = (value: ParamValue, gesture: string | null) =>
    dispatch(paramEdited({ ref: rowRef, param: spec.param, value, label: spec.label, gesture }));

  let field;
  if (spec.readOnly || widget.widget === 'readout') {
    field = (
      <ReadoutField>{auto ? AUTO_TEXT : readoutText(spec.param, subject[spec.param])}</ReadoutField>
    );
  } else if (widget.widget === 'number') {
    const shown = Number(stored ?? 0);
    const display = auto ? null : widget.toDisplay ? widget.toDisplay(shown) : shown;
    field = (
      <NumberField
        label={spec.label}
        unit={widget.unit}
        value={display}
        step={typeof widget.step === 'function' ? widget.step(display ?? 0) : widget.step}
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
  } else if (widget.widget === 'layers') {
    const picked = (stored ?? []) as readonly string[];
    field = (
      <LayerPickField
        label={spec.label}
        summary={formatAddresses(picked)}
        value={picked}
        options={layerOptions(widget.items === true)}
        onChange={(v) => edit(v, null)}
      />
    );
  } else if (widget.widget === 'pick') {
    field = (
      <PickField
        label={spec.label}
        value={String(stored)}
        options={EASE_OPTIONS}
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
      dim={!authored && canBeAbsent}
      onReset={authored && canBeAbsent && !spec.readOnly ? () => edit(undefined, null) : undefined}
    >
      {field}
    </InspectorRow>
  );
}

export default FieldRow;
