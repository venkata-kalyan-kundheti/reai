import React from 'react';
import { useViewStore } from '../../store/useViewStore.js';
import { useDocStore } from '../../store/useDocStore.js';

export function Toolbar() {
  const {
    activePage,
    zoom,
    zoomIn,
    zoomOut,
    pointingEnabled,
    togglePointing,
    swapSides,
    isDrawingBox,
    setIsDrawingBox,
  } = useViewStore();

  const { document } = useDocStore();
  const pageCount = document?.pageCount || 1;

  return (
    <div className="toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
        <span>Page {activePage} of {pageCount}</span>
      </div>

      <div style={{ height: '20px', width: '1px', background: 'var(--border-color)', margin: '0 4px' }} />

      <button className="btn btn-sm" onClick={zoomOut} title="Zoom Out (-)">
        -
      </button>
      <span style={{ fontSize: '0.8rem', minWidth: '42px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button className="btn btn-sm" onClick={zoomIn} title="Zoom In (+)">
        +
      </button>

      <div style={{ height: '20px', width: '1px', background: 'var(--border-color)', margin: '0 4px' }} />

      <button
        className={`btn btn-sm ${pointingEnabled ? 'btn-active' : ''}`}
        onClick={togglePointing}
        title="Toggle Citation Pointing"
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{pointingEnabled ? '👁️' : '👁️‍🗨️'}</span>
        Pointing {pointingEnabled ? 'On' : 'Off'}
      </button>

      <button
        className={`btn btn-sm ${isDrawingBox ? 'btn-active' : ''}`}
        onClick={() => setIsDrawingBox(!isDrawingBox)}
        title="Draw box on PDF to ask a question"
      >
        <span>⬚</span>
        Select Box
      </button>

      <button className="btn btn-sm" onClick={swapSides} title="Swap Panes">
        ⇄ Swap
      </button>
    </div>
  );
}

