import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';
import { normToPx } from '../../lib/geometry.js';
import { findSegmentById } from '../../lib/segmentIndex.js';

export function HighlightLayer({ pageNumber, pageWidth, pageHeight }) {
  const { segments, followups, chunkMap } = useDocStore();
  const { activeSegmentId, hoveredSegmentId, pinnedSourceId, pointingEnabled, walkthrough } = useViewStore();

  if (!pointingEnabled || !pageWidth || !pageHeight) return null;

  const boxes = [];

  const addChunk = (chunkId, className, keyPrefix) => {
    const chunk = chunkMap.get(chunkId);
    if (!chunk || chunk.page !== pageNumber) return;
    const isRegion = chunk.type === 'image_region';
    for (const rect of chunk.rects?.length ? chunk.rects : [chunk.bbox]) {
      const px = normToPx(rect, pageWidth, pageHeight);
      if (!px) continue;
      boxes.push(
        <div
          key={`${keyPrefix}-${chunkId}-${boxes.length}`}
          className={`highlight-box ${className} ${isRegion ? 'region' : ''}`}
          style={{ left: `${px.left}px`, top: `${px.top}px`, width: `${px.width}px`, height: `${px.height}px` }}
        />
      );
    }
  };

  // Workflow walkthrough: earlier steps stay faintly visible, the current step glows.
  if (walkthrough.steps.length) {
    walkthrough.steps.forEach((segId, i) => {
      if (i > walkthrough.index) return;
      const seg = findSegmentById(segments, followups, segId);
      for (const src of seg?.sources || []) addChunk(src, i === walkthrough.index ? 'active walk-current' : 'walk-visited', `walk${i}`);
    });
    return <div className="highlight-layer">{boxes}</div>;
  }

  if (pinnedSourceId) addChunk(pinnedSourceId, 'pinned', 'pinned');

  const activeSegment = findSegmentById(segments, followups, activeSegmentId);
  if (activeSegment) {
    const cls = `active ${activeSegment.confidence === 'low' ? 'low-confidence' : ''}`;
    for (const sId of activeSegment.sources || []) addChunk(sId, cls, 'active');
  }

  if (hoveredSegmentId && hoveredSegmentId !== activeSegmentId) {
    const hovered = findSegmentById(segments, followups, hoveredSegmentId);
    for (const sId of hovered?.sources || []) addChunk(sId, 'hovered', 'hover');
  }

  return <div className="highlight-layer">{boxes}</div>;
}
