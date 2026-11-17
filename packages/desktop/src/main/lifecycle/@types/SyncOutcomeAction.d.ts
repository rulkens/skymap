import type { ControlStatus } from '../../../@types/ControlStatus';

/** The control window's status after a sync, and what main does next. */
export type SyncOutcomeAction = { status: ControlStatus; then: 'loadSky' | 'showControl' | 'none' };
