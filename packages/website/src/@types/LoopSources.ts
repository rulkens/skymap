/** The two files of one loop as the page addresses them: AV1 in WebM first, H.264 in MP4 for browsers without it. */
export type LoopSources = {
  webm: string;
  mp4: string;
};
