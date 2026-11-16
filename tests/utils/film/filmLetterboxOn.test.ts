import { describe, it, expect } from 'vitest';
import { filmLetterboxOn } from '../../../src/utils/film/filmLetterboxOn';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';

const film = INITIAL_SETTINGS.film;

describe('filmLetterboxOn', () => {
  it('is on only while both the look and its letterbox are on', () => {
    expect(filmLetterboxOn({ ...film, enabled: true, letterbox: true })).toBe(true);
    expect(filmLetterboxOn({ ...film, enabled: true, letterbox: false })).toBe(false);
    expect(filmLetterboxOn({ ...film, enabled: false, letterbox: true })).toBe(false);
  });
});
