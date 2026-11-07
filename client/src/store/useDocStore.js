import { create } from 'zustand';
import { buildSourceToSegmentIndex } from '../lib/segmentIndex.js';

const IDLE_STREAM = { status: 'idle', progress: null, notice: null, error: null };

export const useDocStore = create((set, get) => ({
  document: null,
  chunks: [],
  chunkMap: new Map(),
  generation: null,
  segments: [],
  followups: [],
  sourceToSegmentIndex: new Map(),
  isPolling: false,
  // status / progress / notice / error of the running generation (drives the status bar)
  streamState: IDLE_STREAM,

  setDocument: (document) => set({ document }),

  setChunks: (chunks) => {
    const chunkMap = new Map();
    for (const c of chunks) chunkMap.set(c.chunkId, c);
    set({ chunks, chunkMap });
  },

  setGeneration: (generation) => {
    const segments = generation?.segments || [];
    const followups = generation?.followups || [];
    let streamState = IDLE_STREAM;
    if (generation) {
      if (generation.status === 'done') streamState = { ...IDLE_STREAM, status: 'done' };
      else if (generation.status === 'failed') {
        streamState = {
          ...IDLE_STREAM,
          status: 'failed',
          error: {
            code: generation.errorCode,
            message: generation.errorMessage || 'Generation stopped.',
            retryable: generation.errorRetryable !== false,
            retryAfterSec: generation.retryAfterSec,
          },
        };
      } else {
        streamState = { ...IDLE_STREAM, status: 'streaming' };
      }
    }
    set({ generation, segments, followups, sourceToSegmentIndex: buildSourceToSegmentIndex(segments), streamState });
  },

  /** Upsert by segmentId: stream replays after a reconnect or for a cached run must never duplicate. */
  addSegment: (segment) => {
    const current = get().segments;
    const i = current.findIndex((s) => s.segmentId === segment.segmentId);
    const segments = i >= 0 ? current.map((s, n) => (n === i ? segment : s)) : [...current, segment];
    segments.sort((a, b) => a.order - b.order);
    set({ segments, sourceToSegmentIndex: buildSourceToSegmentIndex(segments) });
  },

  addFollowup: (followup) => {
    if (get().followups.some((f) => f.followupId === followup.followupId)) return;
    set({ followups: [...get().followups, followup] });
  },

  setStreamState: (patch) => set({ streamState: { ...get().streamState, ...patch } }),

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
      streamState: IDLE_STREAM,
    }),
}));
