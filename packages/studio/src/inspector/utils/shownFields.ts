/**
 * The fields a subject has: a required param that is absent belongs to another arm of the subject's
 * union (a subject waypoint has no `distance`), so its field is left out rather than faked.
 */
import type { FieldSpec } from '../../@types/kinds/FieldSpec';
import type { InspectorSubject } from '../../@types/rows/InspectorSubject';

export function shownFields(
  fields: readonly FieldSpec<InspectorSubject>[],
  subject: InspectorSubject,
): FieldSpec<InspectorSubject>[] {
  return fields.filter(
    (field) =>
      subject[field.param] !== undefined || field.fallback !== undefined || field.optional === true,
  );
}
