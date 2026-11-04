import React from 'react';

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid #ef4444',
        color: '#fca5a5',
        padding: '10px 16px',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
        margin: '12px',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fca5a5',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

