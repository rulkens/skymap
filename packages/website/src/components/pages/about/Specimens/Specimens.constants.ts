import { DISPLAY_FACE, TEXT_FACE } from '../../../../data/aboutFacts.ts';
import styles from './Specimens.module.css';

export const ID = 'about-constellations';
export const SPECIMENS = [
  { term: 'Headings', name: DISPLAY_FACE, id: 'about-display-face', face: styles.display },
  { term: 'Text', name: TEXT_FACE, id: 'about-text-face', face: styles.body },
];
