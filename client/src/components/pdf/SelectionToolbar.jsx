import React from 'react';

export function SelectionToolbar({ position, text, onAsk, onClear }) {
  if (!position) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -120%)',
        zIndex: 100,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--accent-primary)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.8rem',
      }}
    >
      <button
        className="btn btn-sm btn-primary"
        onClick={() => onAsk(text)}
      >
        ✨ Ask AI about this
      </button>
      <button
        className="btn btn-sm"
        onClick={onClear}
        style={{ padding: '2px 6px' }}
      >
        ✕
      </button>
    </div>
  );
}

