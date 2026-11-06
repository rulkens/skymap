/*
 * PhoneShot — a screenshot taken on a phone or tablet, under the step it shows,
 * at about the size it has on the device. Its file is a local image the page
 * imports: the shot manifest (data/siteShots.ts) holds only pictures of the app.
 * The caption says where the picture was taken.
 */
import type { ImageMetadata } from 'astro';

import styles from './PhoneShot.module.css';

type PhoneShotProps = { image: ImageMetadata; alt: string; caption: string };

function PhoneShot({ image, alt, caption }: PhoneShotProps) {
  return (
    <figure data-embed>
      <img
        className={styles.picture}
        src={image.src}
        width={image.width}
        height={image.height}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

export default PhoneShot;
