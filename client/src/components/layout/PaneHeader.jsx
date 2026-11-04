import React from 'react';

export function PaneHeader({ title, icon, onCollapse, extra }) {
  return (
    <div className="pane-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span>{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {extra}
        {onCollapse && (
          <button
            className="btn btn-sm btn-icon"
            onClick={onCollapse}
            title="Collapse pane"
            aria-label="Collapse pane"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

