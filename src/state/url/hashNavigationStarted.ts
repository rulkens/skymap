/**
 * hashNavigationStarted — the reducer-less signal that `applyNavigation` is
 * applying a URL the browser has already moved to. The write half answers it
 * by replacing for that burst: a row that writes nothing back (`pose`) makes
 * the settled body differ from the URL, and a push there would truncate the
 * forward stack.
 */
import { createAction } from '@reduxjs/toolkit';

export const hashNavigationStarted = createAction('url/hashNavigationStarted');
