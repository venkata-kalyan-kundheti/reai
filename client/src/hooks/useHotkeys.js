import { useEffect } from 'react';
import { useViewStore } from '../store/useViewStore.js';
import { useDocStore } from '../store/useDocStore.js';

export function useHotkeys() {
  const {
    activeSegmentId,
    setActiveSegmentId,
    pinnedSourceId,
    setPinnedSourceId,
    setSelectionBox,
    zoomIn,
    zoomOut,
  } = useViewStore();

  const { segments } = useDocStore();

  useEffect(() => {
    function handleKeyDown(e) {
      // Don't trigger hotkeys if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'Escape') {
        setActiveSegmentId(null);
        setSelectionBox(null);
      } else if (e.key === 'p' || e.key === 'P') {
        if (activeSegmentId) {
          const seg = segments.find((s) => s.segmentId === activeSegmentId);
          if (seg && seg.sources?.length > 0) {
            setPinnedSourceId(seg.sources[0]);
          }
        }
      } else if (e.key === 'j') {
        // Next segment
        if (segments.length === 0) return;
        const idx = segments.findIndex((s) => s.segmentId === activeSegmentId);
        const nextIdx = idx === -1 ? 0 : Math.min(segments.length - 1, idx + 1);
        setActiveSegmentId(segments[nextIdx].segmentId);
      } else if (e.key === 'k') {
        // Prev segment
        if (segments.length === 0) return;
        const idx = segments.findIndex((s) => s.segmentId === activeSegmentId);
        const prevIdx = idx <= 0 ? 0 : idx - 1;
        setActiveSegmentId(segments[prevIdx].segmentId);
      } else if (e.key === '=' || e.key === '+') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeSegmentId,
    setActiveSegmentId,
    pinnedSourceId,
    setPinnedSourceId,
    setSelectionBox,
    segments,
    zoomIn,
    zoomOut,
  ]);
}

