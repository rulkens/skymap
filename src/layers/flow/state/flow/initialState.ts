/**
 * Boot state of the CF4++ peculiar-velocity flow-field overlay — just
 * `DEFAULT_FLOW` (see `../defaults` for the look/motion rationale).
 */

import { DEFAULT_FLOW } from '../defaults';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';

export const initialState: FlowSettings = { ...DEFAULT_FLOW };
