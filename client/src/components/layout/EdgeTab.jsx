import React from 'react';

export function EdgeTab({ side = 'left', label, onClick }) {
  return (
    <div
      className={`edge-tab ${side === 'left' ? 'edge-tab-left' : 'edge-tab-right'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <span>{label}</span>
    </div>
  );
}

