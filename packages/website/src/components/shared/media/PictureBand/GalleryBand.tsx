/* GalleryBand — a band of several views: Band, and the current view for the parts of its words that follow it. */
import type { BandProps } from './Band.tsx';
import Band from './Band.tsx';
import { GalleryContext } from './GalleryContext.ts';
import { useGallery } from './useGallery.ts';

function GalleryBand(props: Omit<BandProps, 'gallery'>) {
  const gallery = useGallery(props.views);
  return (
    <GalleryContext.Provider value={gallery}>
      <Band {...props} gallery={gallery} />
    </GalleryContext.Provider>
  );
}

export default GalleryBand;
