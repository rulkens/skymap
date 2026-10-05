/**
 * `AngularReweight` flattens the pencil-beam "jets" GLADE's non-uniform
 * parent-catalogue coverage produces (see `BiasMode`'s own doc for the
 * mode survey). -19 mag is roughly where the SDSS spectroscopic main
 * sample is volume-complete out to the galaxy catalog's flux limit.
 */

import { BiasMode } from '../../../../data/galaxyCatalog/biasMode';
import type { BiasSettings } from '../../../../@types/settings/BiasSettings';

export const initialState: BiasSettings = {
  mode: BiasMode.AngularReweight,
  absMagLimit: -19,
};
