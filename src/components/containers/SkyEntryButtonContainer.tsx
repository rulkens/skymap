/**
 * SkyEntryButtonContainer — store boundary for "Look up from here" and its desktop preview ring.
 * The gate is `selectSkyEntry`; the click sends `enterSkyHere`, as `s` and the palette do. The
 * last offered spot is kept so the label holds still while the button fades out.
 */

import { memo, useCallback, useState, type ReactNode } from 'react';
import SkyEntryButton from '../SkyEntryButton/SkyEntryButton';
import SkyEntryPreview from '../SkyEntryPreview/SkyEntryPreview';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSkyEntry } from '../../state/sky/selectSkyEntry';
import { enterSkyHere } from '../../state/sky/enterSkyHere';
import { placeLabel } from '../../utils/places/placeLabel';
import { latLonLabel } from '../../utils/geo/latLonLabel';
import { radToDeg } from '../../utils/math/radToDeg';

export type SkyEntryButtonContainerProps = {
  readonly phone: boolean;
};

function SkyEntryButtonContainer({ phone }: SkyEntryButtonContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const spot = useAppSelector(selectSkyEntry);
  const [shown, setShown] = useState(spot);
  if (spot !== null && spot !== shown) setShown(spot);
  const [previewing, setPreviewing] = useState(false);

  const onEnter = useCallback(() => dispatch(enterSkyHere()), [dispatch]);

  const place = shown === null ? null : placeLabel(shown);
  const label =
    !phone || place === null
      ? 'Look up from here'
      : `Look up from ${place.near ? 'near ' : ''}${place.text}`;

  return (
    <>
      {!phone && previewing && spot !== null && place !== null && (
        <SkyEntryPreview
          place={place.near ? place.text : null}
          coordinates={latLonLabel(radToDeg(spot.lonRad), radToDeg(spot.latRad))}
        />
      )}
      <SkyEntryButton
        visible={spot !== null}
        label={label}
        phone={phone}
        onEnter={onEnter}
        onPreview={setPreviewing}
      />
    </>
  );
}

export default memo(SkyEntryButtonContainer);
