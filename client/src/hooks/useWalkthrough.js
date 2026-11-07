import { useEffect } from 'react';
import { useDocStore } from '../store/useDocStore.js';
import { useViewStore } from '../store/useViewStore.js';
import { useScrollSync } from './useScrollSync.js';

const STEP_MS = 3500;

/**
 * Drives the diagram walkthrough: while playing, the current step becomes the active segment,
 * both panes scroll to it, and after a few seconds the next step is shown.
 */
export function useWalkthrough() {
  const { segments, chunkMap } = useDocStore();
  const { walkthrough, setActiveSegmentId, stepWalkthrough, pauseWalkthrough } = useViewStore();
  const { scrollToChunk, scrollToSegment } = useScrollSync();

  const { playing, steps, index } = walkthrough;
  const currentId = steps[index];

  // show the current step
  useEffect(() => {
    if (!currentId) return;
    setActiveSegmentId(currentId);
    scrollToSegment(currentId);
    const seg = segments.find((s) => s.segmentId === currentId);
    const firstRegion = seg?.sources?.find((id) => chunkMap.has(id));
    if (firstRegion) scrollToChunk(firstRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // advance automatically while playing
  useEffect(() => {
    if (!playing || !steps.length) return undefined;
    if (index >= steps.length - 1) {
      const t = setTimeout(pauseWalkthrough, STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => stepWalkthrough(1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, index, steps.length, stepWalkthrough, pauseWalkthrough]);
}
