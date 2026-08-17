/**
 * galaxyCatalogTransfer — slice-and-transfer ceremony for GalaxyCatalog
 * worker payloads: fresh, engine-disjoint buffers (the picker/InfoCard keep
 * reading the originals) plus the matching Transferable[] for
 * `postMessage`. `GALAXY_CATALOG_FIELD_SPECS` (`galaxyCatalogFormat.ts`) is
 * the single field list this module drives both from.
 *
 * BigUint64Array itself is NOT Transferable, but its underlying `.buffer`
 * IS — the worker reconstructs the view via structured-clone.
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogColumn } from '../../@types/data/galaxyCatalog/GalaxyCatalogColumn';
import type { GalaxyCatalogFieldSpec } from '../../@types/data/galaxyCatalog/GalaxyCatalogFieldSpec';
import type { ClonedGalaxyCatalog } from '../../@types/data/galaxyCatalog/ClonedGalaxyCatalog';
import { GALAXY_CATALOG_FIELD_SPECS } from './galaxyCatalogFormat';

function sliceColumn(
  spec: GalaxyCatalogFieldSpec,
  source: BigUint64Array | Float32Array | Uint8Array,
): BigUint64Array | Float32Array | Uint8Array {
  const buffer = source.buffer.slice(0);
  if (spec.column === 'u64') return new BigUint64Array(buffer);
  if (spec.column === 'u8') return new Uint8Array(buffer);
  return new Float32Array(buffer);
}

/** Slices every typed-array buffer into a detached-ready copy, plus a matching Transferable[] for `postMessage`. */
export function cloneGalaxyCatalogForTransfer(catalog: GalaxyCatalog): ClonedGalaxyCatalog {
  const columns: Partial<Record<GalaxyCatalogColumn, BigUint64Array | Float32Array | Uint8Array>> =
    {};
  const transfer: Transferable[] = [];

  for (const column of Object.keys(GALAXY_CATALOG_FIELD_SPECS) as GalaxyCatalogColumn[]) {
    const spec = GALAXY_CATALOG_FIELD_SPECS[column];
    const view = sliceColumn(spec, catalog[column] as BigUint64Array | Float32Array | Uint8Array);
    columns[column] = view;
    transfer.push(view.buffer);
  }

  // `columns` was built by iterating every GALAXY_CATALOG_FIELD_SPECS key —
  // compiler-proven (via that table's `satisfies` clause) to cover
  // GalaxyCatalogColumn exactly — so this cast asserts what the loop delivers.
  const copy = {
    count: catalog.count,
    ...columns,
    // Scalar, not a column — rides by value, no buffer to slice or transfer.
    medianAbsMag: catalog.medianAbsMag,
  } as unknown as GalaxyCatalog;

  return { copy, transfer };
}
