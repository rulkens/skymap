import type { ViewMode } from './ViewMode';
import type { ViewState } from './ViewState';

export type NavigationState = {
  readonly view: ViewState;
  readonly viewMode: ViewMode;
  readonly showArrows: boolean;
};
