import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';
import { useScrollSync } from '../../hooks/useScrollSync.js';
import { normToPx } from '../../lib/geometry.js';

export function ChunkHitLayer({ pageNumber, pageWidth, pageHeight }) {
  const { chunks, sourceToSegmentIndex } = useDocStore();
  const {
    setActiveSegmentId,
    setHoveredChunkId,
    setHoveredSegmentId,
  } = useViewStore();

  const { scrollToSegment } = useScrollSync();

  if (!pageWidth || !pageHeight) return null;

  const pageChunks = chunks.filter((c) => c.page === pageNumber);

  return (
    <div className="chunk-hit-layer">
      {pageChunks.map((chunk) => {
        const px = normToPx(chunk.bbox, pageWidth, pageHeight);
        if (!px) return null;

        const citingSegments = sourceToSegmentIndex.get(chunk.chunkId) || [];

        return (
          <div
            key={chunk.chunkId}
            id={`chunk-${chunk.chunkId}`}
            className="chunk-hit-box"
            style={{
              left: `${px.left}px`,
              top: `${px.top}px`,
              width: `${px.width}px`,
              height: `${px.height}px`,
            }}
            onMouseEnter={() => {
              setHoveredChunkId(chunk.chunkId);
              if (citingSegments.length > 0) {
                setHoveredSegmentId(citingSegments[0]);
              }
            }}
            onMouseLeave={() => {
              setHoveredChunkId(null);
              setHoveredSegmentId(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (citingSegments.length > 0) {
                const targetSegId = citingSegments[0];
                setActiveSegmentId(targetSegId);
                scrollToSegment(targetSegId);
              }
            }}
            title={citingSegments.length > 0 ? 'Click to see explaining AI segment' : undefined}
          />
        );
      })}
    </div>
  );
}

