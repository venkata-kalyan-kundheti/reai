import React from 'react';
import { SegmentItem } from './SegmentItem.jsx';
import { LevelGoalChips } from './LevelGoalChips.jsx';
import { SourcePreview } from './SourcePreview.jsx';
import { AskBar } from './AskBar.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { useDocStore } from '../../store/useDocStore.js';

export function AiPanel({ onRegenerate, onAsk, onSimplify, askContext, onClearAskContext, isLoading }) {
  const { segments, followups, generation } = useDocStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="pane-content">
        <div className="ai-panel-container">
          <LevelGoalChips onRegenerate={onRegenerate} isLoading={isLoading} />

          {isLoading && segments.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 0',
                gap: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <Spinner size={32} />
              <span>Analyzing document and generating citation links...</span>
            </div>
          )}

          {segments.map((segment) => (
            <SegmentItem
              key={segment.segmentId}
              segment={segment}
              onSimplify={onSimplify}
            />
          ))}

          {followups.map((f) => (
            <div
              key={f.followupId}
              style={{
                marginTop: '16px',
                padding: '16px',
                backgroundColor: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>
                Q: {f.question}
              </div>
              {f.answerSegments?.map((ansSeg) => (
                <SegmentItem
                  key={ansSeg.segmentId}
                  segment={ansSeg}
                  onSimplify={onSimplify}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <AskBar
        onAsk={onAsk}
        context={askContext}
        onClearContext={onClearAskContext}
        isLoading={isLoading}
      />

      <SourcePreview />
    </div>
  );
}

