/*
 * Shot — one picture from the shot manifest, by id. `tall` names a second
 * manifest row shot for upright screens; it replaces the picture below 700px
 * (art direction, not a crop), and each source carries its own size so the
 * box is reserved either way. Alt text comes from the manifest unless the
 * picture is decoration beside its own words. `sizes` may understate a phone's
 * width on purpose: at 3x the full figure would fetch the desktop file.
 */
import { siteShot } from '../../data/siteShot.ts';
import { shotSources } from '../../utils/shotSources.ts';

type ShotProps = { id: string; tall?: string; sizes: string; alt?: string; eager?: boolean };

const TALL_MEDIA = '(max-width: 700px)';

function Shot({ id, tall, sizes, alt, eager = false }: ShotProps) {
  const wide = shotSources(id);
  const upright = tall ? shotSources(tall) : undefined;
  return (
    <picture>
      {upright && (
        <>
          <source
            media={TALL_MEDIA}
            type="image/avif"
            srcSet={upright.avif}
            sizes="100vw"
            width={upright.width}
            height={upright.height}
          />
          <source
            media={TALL_MEDIA}
            type="image/webp"
            srcSet={upright.webp}
            sizes="100vw"
            width={upright.width}
            height={upright.height}
          />
        </>
      )}
      <source
        type="image/avif"
        srcSet={wide.avif}
        sizes={sizes}
        width={wide.width}
        height={wide.height}
      />
      <img
        src={wide.fallback}
        srcSet={wide.webp}
        sizes={sizes}
        width={wide.width}
        height={wide.height}
        alt={alt ?? siteShot(id).alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}

export default Shot;
