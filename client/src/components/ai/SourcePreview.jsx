import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';

export function SourcePreview() {
  const { previewSource } = useViewStore();
  const { chunkMap } = useDocStore();

  if (!previewSource) return null;

  const chunk = chunkMap.get(previewSource.chunkId);
  if (!chunk) return null;

  return (
    <div
      className="source-preview-popover"
      style={{
        left: `${Math.min(window.innerWidth - 380, previewSource.x)}px`,
        top: `${previewSource.y}px`,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '4px' }}>
        Page {chunk.page} • Source Snippet
      </div>
      <div style={{ color: '#cbd5e1', lineHeight: 1.4 }}>
        "{chunk.text.slice(0, 220)}{chunk.text.length > 220 ? '...' : ''}"
      </div>
    </div>
  );
}

