import type { FieldTargetId } from './FieldTargetId';

/** The field targets the app allocates (`APP_FIELD_TARGET_IDS`): all but the tool-only `extras`. */
export type AppFieldTargetId = Exclude<FieldTargetId, 'extras'>;
