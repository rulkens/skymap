/** REMOTE_SHEETS: the library's tiles in order, each opening the sheet of the same id. */

import type { ComponentType } from 'react';
import type { IconProps } from '../../components/Icon/Icon';
import ClipIcon from '../../components/icons/ClipIcon/ClipIcon';
import ExhibitIcon from '../../components/icons/ExhibitIcon/ExhibitIcon';
import LabelsIcon from '../../components/icons/LabelsIcon/LabelsIcon';
import LayersIcon from '../../components/icons/LayersIcon/LayersIcon';
import SearchIcon from '../../components/icons/SearchIcon/SearchIcon';
import SlidersIcon from '../../components/icons/SlidersIcon/SlidersIcon';
import TimeIcon from '../../components/icons/TimeIcon/TimeIcon';
import TourIcon from '../../components/icons/TourIcon/TourIcon';
import type { RemoteSheetId } from '../../@types/remote/RemoteSheetId';

export const REMOTE_SHEETS: readonly {
  readonly id: RemoteSheetId;
  readonly label: string;
  readonly icon: ComponentType<Pick<IconProps, 'size'>>;
}[] = [
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'tours', label: 'Tours', icon: TourIcon },
  { id: 'exhibits', label: 'Exhibits', icon: ExhibitIcon },
  { id: 'clips', label: 'Clips', icon: ClipIcon },
  { id: 'time', label: 'Time', icon: TimeIcon },
  { id: 'layers', label: 'Layers', icon: LayersIcon },
  { id: 'labels', label: 'Labels', icon: LabelsIcon },
  { id: 'setup', label: 'Setup', icon: SlidersIcon },
];
