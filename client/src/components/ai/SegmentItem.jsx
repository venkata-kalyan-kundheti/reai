import React from 'react';
import { SourceBadge } from './SourceBadge.jsx';
import { useViewStore } from '../../store/useViewStore.js';
import { useScrollSync } from '../../hooks/useScrollSync.js';

export function SegmentItem({ segment, onSimplify }) {
  const {
    activeSegmentId,
    setActiveSegmentId,
    hoveredSegmentId,
    setHoveredSegmentId,
  } = useViewStore();

  const { scrollToChunk } = useScrollSync();

  const isActive = activeSegmentId === segment.segmentId;
  const isHovered = hoveredSegmentId === segment.segmentId;

  const handleClick = () => {
    setActiveSegmentId(segment.segmentId);
    if (segment.sources?.length > 0) {
      scrollToChunk(segment.sources[0]);
    }
  };

  const renderContent = () => {
    switch (segment.type) {
      case 'heading': {
        const HeadingTag = `h${Math.min(3, segment.depth || 1)}`;
        return (
          <HeadingTag className={`segment-heading-${segment.depth || 1}`}>
            {segment.text}
          </HeadingTag>
        );
      }
      case 'bullet':
        return <div className="segment-bullet">{segment.text}</div>;
      case 'step':
        return (
          <div className="segment-step">
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{segment.order + 1}.</span>
            <span>{segment.text}</span>
          </div>
        );
      case 'paragraph':
      default:
        return <div className="segment-paragraph">{segment.text}</div>;
    }
  };

  return (
    <div
      id={`segment-${segment.segmentId}`}
      className={`segment-item ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setHoveredSegmentId(segment.segmentId)}
      onMouseLeave={() => setHoveredSegmentId(null)}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: 'inline' }}>
        {renderContent()}
        {segment.sources?.length > 0 && (
          <span className="source-badge-list">
            {segment.sources.map((sId) => (
              <SourceBadge key={sId} chunkId={sId} />
            ))}
          </span>
        )}
      </div>

      <div className="segment-actions">
        <button
          className="btn btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onSimplify?.(segment);
          }}
          title="Explain this concept with simpler terms or an everyday analogy"
        >
          💡 I didn't get this
        </button>
      </div>
    </div>
  );
}

