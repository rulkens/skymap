import { useAppDispatch, useAppSelector } from '../../../../../../src/store/hooks';
import { objectPicked, paramEdited, rowSelected } from '../../../session/state/studioSlice';
import { selectPick } from '../../../session/state/selectors';
import { isPickFor } from '../../../session/utils/isPickFor';
import { sameParamValue } from '../../../draft/utils/sameParamValue';
import { useObjectIndex } from '../../../session/hooks/useObjectIndex';
import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import NumberField from '../../../primitives/components/NumberField/NumberField';
import LayerPickField from '../../../primitives/components/LayerPickField/LayerPickField';
import PickField from '../../../primitives/components/PickField/PickField';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import SettingsActionField from '../SettingsActionField/SettingsActionField';
import SplineField from '../SplineField/SplineField';
import PassByField from '../PassByField/PassByField';
import WaypointsField from '../WaypointsField/WaypointsField';
import ObjectPicker from '../ObjectPicker/ObjectPicker';
import { FIELD_CONTROLS } from '../../data/fieldControls';
import { EASE_OPTIONS } from '../../data/easeOptions';
import { layerOptions } from '../../utils/layerOptions';
import { readoutText } from '../../utils/readoutText';
import { formatAddresses } from '../../../kinds/utils/formatAddresses';
import { objectText } from '../../../kinds/utils/object/objectText';
import { AUTO_TEXT } from '../../../data/autoText';
import { TOGGLE_OPTIONS } from './FieldRow.constants';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';
import type { ParamValue } from '../../../@types/kinds/ParamValue';
import type { SettingsAction } from '../../../../../../src/compositions/@types/SettingsAction';
import type { SplineConfig } from '../../../../../../src/@types/animation/SplineConfig';
import type { PassByConfig } from '../../../../../../src/@types/animation/PassByConfig';
import type { PathWaypoint } from '../../../../../../src/@types/animation/PathWaypoint';
import type { RowRef } from '../../../@types/rows/RowRef';
import type { InspectorSubject } from '../../../@types/rows/InspectorSubject';

type Props = {
  readonly spec: FieldSpec<InspectorSubject>;
  readonly subject: InspectorSubject;
  readonly rowRef: RowRef;
};

/**
 * One field of the selected row, showing the value the engine uses. A row with a default is dim at it
 * and bright with ↺ back to it otherwise: the `resetTo` value, or absent (its fallback, or `auto` when
 * the engine decides). A required param with no `resetTo` is always authored.
 */
function FieldRow({ spec, subject, rowRef }: Props) {
  const dispatch = useAppDispatch();
  const objects = useObjectIndex();
  const pick = useAppSelector(selectPick);
  const control = typeof spec.control === 'function' ? spec.control(subject) : spec.control;
  const widget = FIELD_CONTROLS[control];
  const authored = subject[spec.param] !== undefined;
  const canBeAbsent = spec.fallback !== undefined || spec.optional === true;
  const auto = !authored && spec.optional === true;
  const stored = subject[spec.param] ?? spec.fallback;
  const { resetTo } = spec;
  const hasDefault = resetTo !== undefined || canBeAbsent;
  const atDefault = resetTo === undefined ? !authored : sameParamValue(stored, resetTo);
  const edit = (value: ParamValue, gesture: string | null, label = spec.label) =>
    dispatch(paramEdited({ ref: rowRef, param: spec.param, value, label, gesture }));

  // Several rows of their own, so they are not wrapped in one row here.
  if (widget.widget === 'settingsAction') {
    return (
      <SettingsActionField action={stored as SettingsAction} onChange={(v) => edit(v, null)} />
    );
  }
  if (widget.widget === 'spline') {
    const value = stored as SplineConfig | undefined;
    return <SplineField value={value} spaced={spec.group} onChange={(v, l, g) => edit(v, g, l)} />;
  }
  if (widget.widget === 'passBy') {
    const value = stored as PassByConfig | undefined;
    return <PassByField value={value} spaced={spec.group} onChange={(v, l, g) => edit(v, g, l)} />;
  }

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
        step={
          spec.range?.step ??
          (typeof widget.step === 'function' ? widget.step(display ?? 0) : widget.step)
        }
        min={spec.range?.min ?? widget.min}
        max={spec.range?.max ?? widget.max}
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
  } else if (widget.widget === 'waypoints' && rowRef.kind === 'effect') {
    const { path } = rowRef;
    field = (
      <WaypointsField
        waypoints={stored as readonly PathWaypoint[]}
        onSelect={(index) => dispatch(rowSelected({ kind: 'waypoint', path, index }))}
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
  } else if (widget.widget === 'object') {
    const { param, label } = spec;
    const stores = widget.pick;
    const pending = pick !== null && isPickFor(pick, { ref: rowRef, param }) ? pick : null;
    field = (
      <ObjectPicker
        label={label}
        value={objectText(stored, objects)}
        pending={pending && { name: objectText(pending.focusId, objects), failed: pending.failed }}
        onPick={(focusId) =>
          stores === 'focusId'
            ? edit(focusId, null)
            : dispatch(objectPicked({ ref: rowRef, param, label, focusId, stores: stores! }))
        }
        onClear={widget.clearable ? () => edit(null, null) : undefined}
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
      dim={hasDefault && atDefault}
      spaced={spec.group}
      onReset={hasDefault && !atDefault && !spec.readOnly ? () => edit(resetTo, null) : undefined}
    >
      {field}
    </InspectorRow>
  );
}

export default FieldRow;
