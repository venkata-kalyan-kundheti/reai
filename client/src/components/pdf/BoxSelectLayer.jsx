import React, { useState, useRef } from 'react';
import { useViewStore } from '../../store/useViewStore.js';
import { pxToNorm } from '../../lib/geometry.js';

export function BoxSelectLayer({ pageNumber, pageWidth, pageHeight, onBoxDrawn }) {
  const { isDrawingBox, selectionBox } = useViewStore();
  const [dragStart, setDragStart] = useState(null);
  const [currentDrag, setCurrentDrag] = useState(null);
  const containerRef = useRef(null);

  if (!isDrawingBox && (!selectionBox || selectionBox.page !== pageNumber)) return null;

  const handleMouseDown = (e) => {
    if (!isDrawingBox) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    setDragStart({ x: startX, y: startY });
    setCurrentDrag({ x: startX, y: startY });
  };

  const handleMouseMove = (e) => {
    if (!dragStart) return;
    const rect = containerRef.current.getBoundingClientRect();
    const curX = Math.max(0, Math.min(pageWidth, e.clientX - rect.left));
    const curY = Math.max(0, Math.min(pageHeight, e.clientY - rect.top));
    setCurrentDrag({ x: curX, y: curY });
  };

  const handleMouseUp = () => {
    if (!dragStart || !currentDrag) {
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    const minX = Math.min(dragStart.x, currentDrag.x);
    const minY = Math.min(dragStart.y, currentDrag.y);
    const width = Math.abs(currentDrag.x - dragStart.x);
    const height = Math.abs(currentDrag.y - dragStart.y);

    if (width > 10 && height > 10) {
      const norm = pxToNorm({ left: minX, top: minY, width, height }, pageWidth, pageHeight);
      onBoxDrawn?.({ page: pageNumber, rect: norm });
    }

    setDragStart(null);
    setCurrentDrag(null);
  };

  const currentBox =
    dragStart && currentDrag
      ? {
          left: Math.min(dragStart.x, currentDrag.x),
          top: Math.min(dragStart.y, currentDrag.y),
          width: Math.abs(currentDrag.x - dragStart.x),
          height: Math.abs(currentDrag.y - dragStart.y),
        }
      : null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: isDrawingBox ? 'crosshair' : 'default',
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {currentBox && (
        <div
          style={{
            position: 'absolute',
            left: `${currentBox.left}px`,
            top: `${currentBox.top}px`,
            width: `${currentBox.width}px`,
            height: `${currentBox.height}px`,
            border: '2px dashed var(--accent-primary)',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

