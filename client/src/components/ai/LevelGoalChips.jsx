import React from 'react';
import { useViewStore } from '../../store/useViewStore.js';

export function LevelGoalChips({ onRegenerate, isLoading }) {
  const { level, setLevel, goal, setGoal } = useViewStore();

  const handleLevelChange = (newLevel) => {
    if (newLevel === level || isLoading) return;
    setLevel(newLevel);
    onRegenerate?.({ level: newLevel, goal });
  };

  const handleGoalChange = (newGoal) => {
    if (newGoal === goal || isLoading) return;
    setGoal(newGoal);
    onRegenerate?.({ level, goal: newGoal });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          LEVEL:
        </span>
        {['beginner', 'medium', 'experienced'].map((l) => (
          <button
            key={l}
            className={`btn btn-sm ${level === l ? 'btn-active' : ''}`}
            onClick={() => handleLevelChange(l)}
            disabled={isLoading}
            style={{ textTransform: 'capitalize' }}
          >
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          GOAL:
        </span>
        {['exam', 'presentation', 'understanding'].map((g) => (
          <button
            key={g}
            className={`btn btn-sm ${goal === g ? 'btn-active' : ''}`}
            onClick={() => handleGoalChange(g)}
            disabled={isLoading}
            style={{ textTransform: 'capitalize' }}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

