/** One inspector field of a row kind: which subject param it reads and writes, and with what control. */
import type { FieldControl } from './FieldControl';
import type { KeysOfUnion } from './KeysOfUnion';

export type FieldSpec<T> = {
  /** Stable within the kind. */
  readonly key: string;
  readonly param: KeysOfUnion<Exclude<T, string | undefined>>;
  /** At most 11 characters, the naming vocabulary. */
  readonly label: string;
  /** One line, no full stop. */
  readonly tip?: string;
  readonly control: FieldControl | ((subject: T) => FieldControl);
  /** Shown dim while the param is absent; ↺ resets the param to absent. */
  readonly fallback?: number | string | boolean;
  readonly readOnly?: true;
  /** Inspector section header, e.g. 'Pace'. */
  readonly section?: string;
};
