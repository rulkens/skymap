/**
 * catalogLoaded — the EVENT that a catalog source's cloud has been committed to
 * the GPU and is now resolvable. Dispatched once per successful commit from the
 * single cloud-commit path (wireGalaxyCatalogSourceSlot).
 *
 * A reducer-less `createAction`: it changes nothing in the store. It is a pure
 * signal three sagas TAKE to react to a late-arriving cloud:
 *   - selectionRowsSaga — re-extracts any still-null selection row whose ref now resolves;
 *   - requestFocusSaga  — completes a deferred deep-link focus;
 *   - tierSaga          — re-anchors a captured galaxy ref after a tier reload (filters on source).
 *
 * It carries only `source`: no consumer reads a generation, so none is stored.
 */
import { createAction } from '@reduxjs/toolkit';

import type { SourceType } from '../../@types/data/SourceType';

export const catalogLoaded = createAction<{ source: SourceType }>('catalog/catalogLoaded');
