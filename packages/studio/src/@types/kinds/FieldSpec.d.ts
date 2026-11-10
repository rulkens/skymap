/** One inspector field of a row kind: which subject param it reads and writes, and with what control. */
import type { FieldControl } from './FieldControl';
import type { KeysOfUnion } from './KeysOfUnion';

export type FieldSpec<T> = {
  /** Stable within the kind. */
  readonly key: string;
  readonly param: KeysOfUnion<Exclude<T, string | undefined>>;
  /** At most 11 characters, the naming vocabulary. */
  readonly label: string;
  readonly control: FieldControl | ((subject: T) => FieldControl);
  /** What the engine uses while the param is absent; ↺ removes the param unless `resetTo` is set. */
  readonly fallback?: number | string | boolean;
  /** The authoring default: ↺ writes it, and the row is dim while the value equals it. */
  readonly resetTo?: number | string | boolean;
  /** Absent means the engine decides (no fixed default): shown dim as `auto`; ↺ resets to absent. */
  readonly optional?: true;
  readonly readOnly?: true;
};
