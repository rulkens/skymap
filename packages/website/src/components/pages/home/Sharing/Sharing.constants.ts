import styles from './Sharing.module.css';

export const VIEWS = [
  { id: 'hubble', tab: 'Hubble' },
  { id: 'privacy-far-side', tab: 'Moon' },
  { id: 'saturn', tab: 'Saturn' },
  { id: 'features-s-stars', tab: 'S-stars' },
];
// The parameters the parts are about, each in its own colour.
export const INKS: Record<string, string | undefined> = { focus: styles.focus, t: styles.clock };
// The window's width; on a phone its 4:3 stage is cut from 16:9 pictures, so a third wider.
export const SIZES = '(max-width: 900px) 133vw, 100vw';
