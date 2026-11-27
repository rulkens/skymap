import {
  H0_KM_S_MPC,
  OMEGA_M,
} from '../../../../../../shared/src/utils/math/constants';
import type { CatalogImportFields } from '../../../../../@types/catalog/import/CatalogImportFields';

// The app's own cosmology; weights taken as stored.
export const DEFAULT_IMPORT_FIELDS: CatalogImportFields = {
  formatKind: 'cartesianMpc',
  weightKind: 'linear',
  h0: String(H0_KM_S_MPC),
  omegaM: String(OMEGA_M),
  scale: '1',
};
