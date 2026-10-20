/**
 * galaxyRecordBridge — serves the synchronous selection row from record
 * sources whose lookups may be promises. A plain value passes straight through
 * (no flat selection waits a pulse); a promise is memoised, answers null while
 * pending, and its settle fires `onSettle`, which the source-count feed turns
 * into the pulse `resolveFocusRefDeferringSaga` already retries on.
 */

import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { GalaxyRecordBridge } from '../@types/GalaxyRecordBridge';

import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import { angularSepSqArcsec } from '../../../utils/math/angularSepSqArcsec';
import { durableIdClaimants } from '../../../utils/galaxy/durableIdClaimants';

/** A memo slot whose lookup has not settled; a settled slot holds the value itself (null included). */
const PENDING = Symbol('pending');

export function galaxyRecordBridge(
  records: ReadonlyMap<GalaxyCatalogSourceType, GalaxyRecordSource>,
): GalaxyRecordBridge {
  // Keyed by the source object: a tier swap's fresh source starts empty, and a
  // released source's late settle lands in a memo nothing reads again.
  const memos = new WeakMap<GalaxyRecordSource, Map<string, unknown>>();
  const listeners = new Set<(source: GalaxyCatalogSourceType) => void>();

  /** The lookup's answer, or `undefined` while it is pending. */
  function answer<T>(
    record: GalaxyRecordSource,
    key: string,
    lookup: () => T | null | Promise<T | null>,
  ): T | null | undefined {
    let memo = memos.get(record);
    if (memo?.has(key)) {
      const hit = memo.get(key);
      return hit === PENDING ? undefined : (hit as T | null);
    }
    const value = lookup();
    if (!(value instanceof Promise)) return value;
    if (memo === undefined) {
      memo = new Map();
      memos.set(record, memo);
    }
    const into = memo;
    into.set(key, PENDING);
    const settle = (settledValue: T | null): void => {
      into.set(key, settledValue);
      if (records.get(record.source) !== record) return;
      for (const listener of listeners) listener(record.source);
    };
    value.then(settle, () => settle(null));
    return undefined;
  }

  return {
    row(source, ordinal) {
      const record = records.get(source);
      if (record === undefined) return null;
      return answer(record, `row:${ordinal}`, () => record.loadRow(ordinal)) ?? null;
    },

    resolveDurableId(id) {
      const prefix = id.startsWith('sdss-') ? 'sdss' : 'pgc';
      for (const record of durableIdClaimants(records.values(), prefix)) {
        const ordinal = answer(record, `id:${id}`, () => record.resolveDurableId(id));
        // A better-ranked source still looking must not be overtaken by a worse one.
        if (ordinal === undefined) return null;
        if (ordinal !== null)
          return { type: 'galaxyCatalog', source: record.source, index: ordinal };
      }
      return null;
    },

    resolvePosition(raDeg, decDeg, distMpc) {
      const cosDecT = Math.cos((decDeg * Math.PI) / 180);
      const key = `pos:${raDeg},${decDeg},${distMpc}`;
      let bestSource: GalaxyCatalogSourceType | null = null;
      let bestIndex = -1;
      let bestSqArcsec = Infinity;
      let pending = false;
      // Registry order and a strict `<`: equal separations go to the earlier source.
      for (const source of GALAXY_CATALOG_SOURCES) {
        const record = records.get(source);
        if (record === undefined) continue;
        const ordinal = answer(record, key, () => record.resolvePosition(raDeg, decDeg, distMpc));
        const row =
          ordinal == null
            ? ordinal
            : answer(record, `row:${ordinal}`, () => record.loadRow(ordinal));
        if (row === undefined) pending = true;
        if (row == null) continue;
        const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
        const sqArcsec = angularSepSqArcsec(ra, dec, raDeg, decDeg, cosDecT);
        if (sqArcsec < bestSqArcsec) {
          bestSqArcsec = sqArcsec;
          bestSource = source;
          bestIndex = ordinal!;
        }
      }
      return pending || bestSource === null
        ? null
        : { type: 'galaxyCatalog', source: bestSource, index: bestIndex };
    },

    onSettle(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
