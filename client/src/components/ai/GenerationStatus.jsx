import React, { useEffect, useState } from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { Spinner } from '../common/Spinner.jsx';

function noticeText(n) {
  if (!n) return null;
  switch (n.type) {
    case 'waiting':
      return `The AI service is at capacity. Waiting about ${Math.max(1, Math.round((n.waitMs || 0) / 1000))}s for a free slot…`;
    case 'retrying':
      return n.code === 'RATE_LIMITED'
        ? `The AI service is busy. Retrying in ${Math.max(1, Math.round((n.delayMs || 0) / 1000))}s…`
        : `Temporary problem with the AI service. Retrying in ${Math.max(1, Math.round((n.delayMs || 0) / 1000))}s…`;
    case 'continuing':
      return 'Long section — continuing where it stopped…';
    case 'reconnecting':
      return 'Connection interrupted. Reconnecting…';
    default:
      return null;
  }
}

/** One line that tells the user what the AI is doing, and offers Resume / Retry when it stopped. */
export function GenerationStatus({ onResume }) {
  const { streamState, segments } = useDocStore();
  const { status, progress, notice, error } = streamState;
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (status !== 'failed' || !error?.retryAfterSec) return undefined;
    setSecondsLeft(error.retryAfterSec);
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [status, error?.retryAfterSec]);

  if (status === 'streaming') {
    const label = noticeText(notice);
    const where = progress?.count > 1 ? `Writing section ${Math.min(progress.index + 1, progress.count)} of ${progress.count}` : 'Writing explanation';
    return (
      <div className={`gen-status ${label ? 'gen-status-warn' : ''}`} role="status">
        <Spinner size={14} />
        <span>{label || `${where}…`}</span>
      </div>
    );
  }

  if (status === 'failed') {
    const hasPartial = segments.length > 0;
    const canRetry = error?.retryable !== false;
    return (
      <div className="gen-status gen-status-error" role="alert">
        <span style={{ flex: 1 }}>
          {error?.message || 'Generation stopped.'}
          {hasPartial && canRetry ? ' What was written so far is kept.' : ''}
        </span>
        {canRetry && (
          <button className="btn btn-sm btn-primary" onClick={onResume} disabled={secondsLeft > 0}>
            {secondsLeft > 0 ? `Resume in ${secondsLeft}s` : hasPartial ? 'Resume' : 'Try again'}
          </button>
        )}
      </div>
    );
  }
  return null;
}
