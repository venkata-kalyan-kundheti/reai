import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';
import { useScrollSync } from '../../hooks/useScrollSync.js';

export function SourceBadge({ chunkId }) {
  const { chunkMap } = useDocStore();
  const { setPreviewSource, setPinnedSourceId, pinnedSourceId } = useViewStore();
  const { scrollToChunk } = useScrollSync();

  const chunk = chunkMap.get(chunkId);
  const label = chunk ? `p.${chunk.page} #${chunk.chunkId.split('_')[2] || 0}` : chunkId;
  const isPinned = pinnedSourceId === chunkId;

  return (
    <span
      className={`source-badge ${isPinned ? 'pinned' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setPinnedSourceId(chunkId);
        scrollToChunk(chunkId);
      }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPreviewSource({
          chunkId,
          x: rect.left,
          y: rect.bottom + 8,
        });
      }}
      onMouseLeave={() => {
        setPreviewSource(null);
      }}
      title="Click to jump to citation in PDF"
    >
      {label}
    </span>
  );
}

