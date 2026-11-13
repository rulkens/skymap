/**
 * film — the film look's switch, letterbox and knobs. Absent from
 * `CORE_SNAPSHOT_CLUSTERS`, so a tour never flips the look.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FILM } from '../../../data/film/filmDefaults';
import type { FilmSettings } from '../../../@types/settings/FilmSettings';
import type { FilmGrade } from '../../../@types/settings/FilmGrade';
import type { FilmGlow } from '../../../@types/settings/FilmGlow';

const initialState: FilmSettings = DEFAULT_FILM;

export const filmSlice = createSlice({
  name: 'settings/film',
  reducerPath: 'film',
  initialState,
  reducers: {
    setFilmEnabled: (film, action: PayloadAction<boolean>) => {
      film.enabled = action.payload;
    },
    setFilmLetterbox: (film, action: PayloadAction<boolean>) => {
      film.letterbox = action.payload;
    },
    tuneFilmGrade: (film, action: PayloadAction<Partial<FilmGrade>>) => {
      Object.assign(film.grade, action.payload);
    },
    tuneFilmGlow: (film, action: PayloadAction<Partial<FilmGlow>>) => {
      Object.assign(film.glow, action.payload);
    },
  },
});

export const { setFilmEnabled, setFilmLetterbox, tuneFilmGrade, tuneFilmGlow } = filmSlice.actions;
