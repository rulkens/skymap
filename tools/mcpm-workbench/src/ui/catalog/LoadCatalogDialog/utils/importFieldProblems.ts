import type { CatalogImportFieldProblems } from '../../../../../@types/catalog/import/CatalogImportFieldProblems';
import type { CatalogImportFields } from '../../../../../@types/catalog/import/CatalogImportFields';

/** Checks the typed fields the chosen format and weight show; hidden fields are never a problem. */
export function importFieldProblems(fields: CatalogImportFields): CatalogImportFieldProblems {
  // Number('') is 0, so a blank field would pass as Ωm 0.
  const number = (text: string): number => (text.trim() === '' ? NaN : Number(text));
  const h0 = number(fields.h0);
  const omegaM = number(fields.omegaM);
  const scale = number(fields.scale);
  const radec = fields.formatKind === 'raDecRedshift';
  return {
    ...(radec && !(h0 > 0) && { h0: 'Use an H0 greater than 0.' }),
    ...(radec && !(omegaM >= 0 && omegaM <= 1) && { omegaM: 'Use an Ωm from 0 to 1.' }),
    ...(fields.weightKind === 'linear' && !(scale > 0) && { scale: 'Use a scale greater than 0.' }),
  };
}
