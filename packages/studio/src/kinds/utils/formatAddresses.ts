/** A visibility step's addresses as one name list: `flow, labels +1`. */
import { formatAddress } from './formatAddress';
import { formatNameList } from '../../utils/format/formatNameList';

export function formatAddresses(args: readonly string[]): string {
  return formatNameList(args.map(formatAddress));
}
