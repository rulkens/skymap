import type { RoadmapItem } from './RoadmapItem';

/** The items of the Roadmap page under one heading; `id` is the heading's anchor. */
export type RoadmapGroup = {
  id: string;
  title: string;
  items: readonly RoadmapItem[];
};
