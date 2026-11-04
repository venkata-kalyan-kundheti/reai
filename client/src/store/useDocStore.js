import { create } from 'zustand';
import { buildSourceToSegmentIndex } from '../lib/segmentIndex.js';

export const useDocStore = create((set, get) => ({
  document: null,
  chunks: [],
  chunkMap: new Map(),
  generation: null,
  segments: [],
  followups: [],
  sourceToSegmentIndex: new Map(),
  isPolling: false,

  setDocument: (document) => set({ document }),

  setChunks: (chunks) => {
    const chunkMap = new Map();
    for (const c of chunks) {
      chunkMap.set(c.chunkId, c);
    }
    set({ chunks, chunkMap });
  },

  setGeneration: (generation) => {
    const segments = generation?.segments || [];
    const followups = generation?.followups || [];
    const sourceToSegmentIndex = buildSourceToSegmentIndex(segments);
    set({ generation, segments, followups, sourceToSegmentIndex });
  },

  addSegment: (segment) => {
    const segments = [...get().segments, segment];
    const sourceToSegmentIndex = buildSourceToSegmentIndex(segments);
    set({ segments, sourceToSegmentIndex });
  },

  addFollowup: (followup) => {
    set({ followups: [...get().followups, followup] });
  },

  setIsPolling: (isPolling) => set({ isPolling }),

  reset: () =>
    set({
      document: null,
      chunks: [],
      chunkMap: new Map(),
      generation: null,
      segments: [],
      followups: [],
      sourceToSegmentIndex: new Map(),
      isPolling: false,
    }),
}));

