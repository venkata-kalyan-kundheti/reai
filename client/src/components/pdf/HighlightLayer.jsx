import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';
import { normToPx } from '../../lib/geometry.js';

export function HighlightLayer({ pageNumber, pageWidth, pageHeight }) {
  const { segments, chunkMap } = useDocStore();
  const {
    activeSegmentId,
    hoveredSegmentId,
    pinnedSourceId,
    pointingEnabled,
  } = useViewStore();

  if (!pointingEnabled || !pageWidth || !pageHeight) return null;

  const activeSegment = segments.find((s) => s.segmentId === activeSegmentId);
  const hoveredSegment = segments.find((s) => s.segmentId === hoveredSegmentId);

  const activeSources = new Set(activeSegment?.sources || []);
  const hoveredSources = new Set(hoveredSegment?.sources || []);

  const boxes = [];

  // Pinned highlight
  if (pinnedSourceId) {
    const chunk = chunkMap.get(pinnedSourceId);
    if (chunk && chunk.page === pageNumber) {
      for (const rect of chunk.rects || [chunk.bbox]) {
        const px = normToPx(rect, pageWidth, pageHeight);
        if (px) {
          boxes.push(
            <div
              key={`pinned-${chunk.chunkId}-${boxes.length}`}
              className="highlight-box pinned"
              style={{
                left: `${px.left}px`,
                top: `${px.top}px`,
                width: `${px.width}px`,
                height: `${px.height}px`,
              }}
            />
          );
        }
      }
    }
  }

  // Active segment highlights
  if (activeSegment) {
    const isLowConfidence = activeSegment.confidence === 'low';
    for (const sId of activeSources) {
      const chunk = chunkMap.get(sId);
      if (chunk && chunk.page === pageNumber) {
        for (const rect of chunk.rects || [chunk.bbox]) {
          const px = normToPx(rect, pageWidth, pageHeight);
          if (px) {
            boxes.push(
              <div
                key={`active-${chunk.chunkId}-${boxes.length}`}
                className={`highlight-box active ${isLowConfidence ? 'low-confidence' : ''}`}
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                }}
              />
            );
          }
        }
      }
    }
  }

  // Hovered segment highlights
  if (hoveredSegment && hoveredSegmentId !== activeSegmentId) {
    for (const sId of hoveredSources) {
      const chunk = chunkMap.get(sId);
      if (chunk && chunk.page === pageNumber) {
        for (const rect of chunk.rects || [chunk.bbox]) {
          const px = normToPx(rect, pageWidth, pageHeight);
          if (px) {
            boxes.push(
              <div
                key={`hover-${chunk.chunkId}-${boxes.length}`}
                className="highlight-box hovered"
                style={{
                  left: `${px.left}px`,
                  top: `${px.top}px`,
                  width: `${px.width}px`,
                  height: `${px.height}px`,
                }}
              />
            );
          }
        }
      }
    }
  }

  return <div className="highlight-layer">{boxes}</div>;
}

