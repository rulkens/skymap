/** VoyageContainer — store boundary for the voyage exhibit's notes section. */

import { memo } from 'react';
import type { ReactNode } from 'react';

import type { VoyageSection } from '../@types/VoyageSection';

export type VoyageContainerProps = {
  readonly data: VoyageSection;
};

function VoyageContainer({ data }: VoyageContainerProps): ReactNode {
  return <h2>{data.heading}</h2>;
}

export default memo(VoyageContainer);
