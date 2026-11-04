import { useCallback } from 'react';
import { useDocStore } from '../store/useDocStore.js';
import { useViewStore } from '../store/useViewStore.js';

export function useScrollSync() {
  const { chunkMap } = useDocStore();
  const { pushHistory, setActivePage } = useViewStore();

  const scrollToChunk = useCallback(
    (chunkId) => {
      const chunk = chunkMap.get(chunkId);
      if (!chunk) return;

      const pdfContainer = document.querySelector('.pdf-scroll-area');
      if (pdfContainer) {
        pushHistory({
          page: chunk.page,
          scrollTop: pdfContainer.scrollTop,
        });
      }

      setActivePage(chunk.page);

      // Find page element or chunk element
      const targetEl = document.getElementById(`chunk-${chunkId}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const pageEl = document.getElementById(`pdf-page-${chunk.page}`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [chunkMap, pushHistory, setActivePage]
  );

  const scrollToSegment = useCallback((segmentId) => {
    const el = document.getElementById(`segment-${segmentId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return { scrollToChunk, scrollToSegment };
}

