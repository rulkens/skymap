import { useState } from 'react';
import type { CatalogImportFieldProblems } from '../../../../@types/catalog/import/CatalogImportFieldProblems';
import type { CatalogImportFields } from '../../../../@types/catalog/import/CatalogImportFields';
import { DEFAULT_IMPORT_FIELDS } from './data/defaultImportFields.constant';
import { importFieldProblems } from './utils/importFieldProblems';
import { importSettingsFrom } from './utils/importSettingsFrom';

/**
 * useImportFields — the load dialog's typed import settings and their problems. A
 * field's error shows once it has been left (`check`) or Enter was pressed
 * (`checkWrong`), never while typing. `settings` is null while a field is wrong.
 */
export function useImportFields(packed: boolean) {
  const [fields, setFields] = useState<CatalogImportFields>(DEFAULT_IMPORT_FIELDS);
  const [checked, setChecked] = useState<readonly (keyof CatalogImportFieldProblems)[]>([]);

  // A packed pair carries its own settings, so its fields are never in the way.
  const problems = packed ? {} : importFieldProblems(fields);
  const wrong = Object.keys(problems) as (keyof CatalogImportFieldProblems)[];

  return {
    fields,
    wrong,
    settings: wrong.length > 0 ? null : importSettingsFrom(fields),
    edit: (patch: Partial<CatalogImportFields>): void => setFields((f) => ({ ...f, ...patch })),
    shown: (field: keyof CatalogImportFieldProblems): string | undefined =>
      checked.includes(field) ? problems[field] : undefined,
    check: (field: keyof CatalogImportFieldProblems) => (): void =>
      setChecked((c) => (c.includes(field) ? c : [...c, field])),
    checkWrong: (): void => setChecked((c) => [...new Set([...c, ...wrong])]),
  };
}
