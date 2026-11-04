import React, { useState, useEffect } from 'react';
import { Spinner } from '../common/Spinner.jsx';

export function AskBar({ onAsk, context, onClearContext, isLoading }) {
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (context?.questionHint) {
      setQuestion(context.questionHint);
    }
  }, [context]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    onAsk(question.trim(), context);
    setQuestion('');
  };

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--border-color)',
        padding: '12px 16px',
        zIndex: 10,
      }}
    >
      {context && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            marginBottom: '8px',
            fontSize: '0.75rem',
            color: 'var(--accent-primary)',
          }}
        >
          <span>
            Targeting: {context.selectionText ? `"${context.selectionText.slice(0, 45)}..."` : 'Selected Box Region'}
          </span>
          <button
            onClick={onClearContext}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question or select text in document..."
          disabled={isLoading}
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!question.trim() || isLoading}
          style={{ minWidth: '70px' }}
        >
          {isLoading ? <Spinner size={16} color="#0f172a" /> : 'Ask'}
        </button>
      </form>
    </div>
  );
}

