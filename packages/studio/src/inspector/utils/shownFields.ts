/**
 * The fields a subject has: a required param that is absent belongs to another arm of the subject's
 * union (a subject waypoint has no `distance`), so its field is left out rather than faked. A field
 * whose `when` is false does nothing in the subject's state, so it is left out too.
 */
import type { FieldSpec } from '../../@types/kinds/FieldSpec';
import type { InspectorSubject } from '../../@types/rows/InspectorSubject';

export function shownFields(
  fields: readonly FieldSpec<InspectorSubject>[],
  subject: InspectorSubject,
): FieldSpec<InspectorSubject>[] {
  return fields.filter(
    (field) =>
      (subject[field.param] !== undefined ||
        field.fallback !== undefined ||
        field.optional === true) &&
      (field.when?.(subject) ?? true),
  );
}
