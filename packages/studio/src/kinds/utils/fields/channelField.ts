/** The Channel field every channel-writing kind shares. `param` is cast as in `overField`. */
import type { Channel } from '../../../../../../src/@types/animation/Channel';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function channelField<T extends { readonly ch: Channel }>(): FieldSpec<T> {
  return { key: 'ch', param: 'ch' as FieldSpec<T>['param'], label: 'Channel', control: 'channel' };
}
