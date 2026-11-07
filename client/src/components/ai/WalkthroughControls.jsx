import React from 'react';
import { useDocStore } from '../../store/useDocStore.js';
import { useViewStore } from '../../store/useViewStore.js';
import { getWalkthroughSteps } from '../../lib/segmentIndex.js';
import { useWalkthrough } from '../../hooks/useWalkthrough.js';

/** "Play workflow": steps through the diagram one highlighted part at a time. */
export function WalkthroughControls() {
  const segments = useDocStore((s) => s.segments);
  const { walkthrough, startWalkthrough, pauseWalkthrough, resumeWalkthrough, stepWalkthrough, stopWalkthrough } = useViewStore();
  useWalkthrough();

  const steps = getWalkthroughSteps(segments);
  const active = walkthrough.steps.length > 0;
  if (!steps.length && !active) return null;

  if (!active) {
    return (
      <div className="walk-bar">
        <span className="walk-title">Diagram workflow · {steps.length} steps</span>
        <button className="btn btn-sm btn-primary" onClick={() => startWalkthrough(steps.map((s) => s.segmentId))}>
          ▶ Play
        </button>
      </div>
    );
  }

  return (
    <div className="walk-bar walk-bar-active">
      <span className="walk-title">
        Step {walkthrough.index + 1} of {walkthrough.steps.length}
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button className="btn btn-sm" onClick={() => stepWalkthrough(-1)} disabled={walkthrough.index === 0} title="Previous step">
          ◀
        </button>
        <button className="btn btn-sm" onClick={walkthrough.playing ? pauseWalkthrough : resumeWalkthrough}>
          {walkthrough.playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button className="btn btn-sm" onClick={() => stepWalkthrough(1)} disabled={walkthrough.index >= walkthrough.steps.length - 1} title="Next step">
          ▶
        </button>
        <button className="btn btn-sm" onClick={stopWalkthrough}>
          ✕ Stop
        </button>
      </div>
    </div>
  );
}
