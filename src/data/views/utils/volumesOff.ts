/**
 * VOLUMES_OFF — the `volumes` cluster with the master gate shut. MCPM is
 * default-on, so any view whose subject is not the cosmic web has to say so
 * explicitly or the filaments read as part of it.
 */

import { initialState as volumesInitialState } from '../../../layers/volume/state/volumes/initialState';

export const VOLUMES_OFF = { ...volumesInitialState, enabled: false };
