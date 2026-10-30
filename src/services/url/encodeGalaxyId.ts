import { Source } from '../../data/source';
import type { SourceType } from '../../@types/data/SourceType';

export function encodeGalaxyId(galaxy: {
  readonly source: SourceType;
  readonly famousId: string | null;
  readonly objId: bigint;
  readonly ra: number;
  readonly dec: number;
  readonly distMpc: number;
}): string {
  if (galaxy.famousId) return galaxy.famousId;
  if (galaxy.objId > 0n) {
    return galaxy.source === Source.SDSS ? `sdss-${galaxy.objId}` : `pgc-${galaxy.objId}`;
  }
  return `pos@${galaxy.ra.toFixed(4)},${galaxy.dec.toFixed(4)},${galaxy.distMpc.toFixed(2)}`;
}
