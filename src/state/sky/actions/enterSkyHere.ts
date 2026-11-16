/**
 * enterSkyHere — the reducer-less COMMAND "stand where the view centre is". A palette row or a
 * remote names no spot of its own, so `watchEnterSkyHereSaga` reads the centre ground when the
 * pick lands and enters only while `selectSkyEntry` still offers it.
 */
import { createAction } from '@reduxjs/toolkit';

export const enterSkyHere = createAction('sky/enterHere');
