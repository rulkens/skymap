/** The target Value of a channel set, in its channel's control. `param` is cast as in `overField`. */
import { channelControl } from '../channelControl';
import type { Channel } from '../../../../../../src/@types/animation/Channel';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function toField<T extends { readonly ch: Channel; readonly to: number }>(): FieldSpec<T> {
  return {
    key: 'to',
    param: 'to' as FieldSpec<T>['param'],
    label: 'Value',
    control: (s) => channelControl(s.ch),
  };
}
