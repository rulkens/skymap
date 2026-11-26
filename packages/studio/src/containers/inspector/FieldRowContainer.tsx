import { useAppDispatch, useAppSelector } from '../../../../../src/store/hooks';
import FieldRow from '../../inspector/components/FieldRow/FieldRow';
import { objectPicked, paramEdited, rowSelected } from '../../session/state/studioSlice';
import { selectPick } from '../../session/state/selectors';
import { useObjectIndex } from '../session/useObjectIndex';
import type { FieldSpec } from '../../@types/kinds/FieldSpec';
import type { InspectorSubject } from '../../@types/rows/InspectorSubject';
import type { RowRef } from '../../@types/rows/RowRef';

type FieldRowContainerProps = {
  readonly spec: FieldSpec<InspectorSubject>;
  readonly subject: InspectorSubject;
  readonly rowRef: RowRef;
};

function FieldRowContainer({ spec, subject, rowRef }: FieldRowContainerProps) {
  const dispatch = useAppDispatch();
  return (
    <FieldRow
      spec={spec}
      subject={subject}
      rowRef={rowRef}
      objects={useObjectIndex()}
      pick={useAppSelector(selectPick)}
      onEdit={(value, gesture, label) =>
        dispatch(paramEdited({ ref: rowRef, param: spec.param, value, label, gesture }))
      }
      onSelectRow={(ref) => dispatch(rowSelected(ref))}
      onPickObject={(pick) => dispatch(objectPicked(pick))}
    />
  );
}

export default FieldRowContainer;
