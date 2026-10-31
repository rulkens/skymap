import type { VisibilityEntryCommon } from './VisibilityEntryCommon';
import type { SceneBody } from '../../scene/SceneBody';
import type { SelectionRef } from '../SelectionRef';

/** Something a Layer can show: addressed by `key` (or `key:<item>`), switched by `enabled`. */
export type ShowEntry = VisibilityEntryCommon & {
  readonly key: string;
  /** Per item: the scene bodies that item draws. Core admits such a body into the frame's
   * scene-body sort only while every item covering it hands a value above 0. */
  readonly bodies?: Readonly<Partial<Record<string, readonly SceneBody[]>>>;
  /** Selection kinds this entry's switch hides: selecting one switches it on. */
  readonly selects?: readonly SelectionRef['type'][];
};
