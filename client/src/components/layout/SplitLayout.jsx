import React, { useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useViewStore } from '../../store/useViewStore.js';
import { EdgeTab } from './EdgeTab.jsx';

export function SplitLayout({ pdfPanel, aiPanel }) {
  const { leftPane, collapsedPane, setCollapsedPane } = useViewStore();
  const panelGroupRef = useRef(null);

  const leftContent = leftPane === 'pdf' ? pdfPanel : aiPanel;
  const rightContent = leftPane === 'pdf' ? aiPanel : pdfPanel;
  const leftLabel = leftPane === 'pdf' ? 'Original Document' : 'AI Explanation';
  const rightLabel = leftPane === 'pdf' ? 'AI Explanation' : 'Original Document';

  return (
    <div className="split-container">
      {collapsedPane === 'left' && (
        <EdgeTab side="left" label={`Open ${leftLabel}`} onClick={() => setCollapsedPane(null)} />
      )}
      {collapsedPane === 'right' && (
        <EdgeTab side="right" label={`Open ${rightLabel}`} onClick={() => setCollapsedPane(null)} />
      )}

      <PanelGroup direction="horizontal" ref={panelGroupRef}>
        {collapsedPane !== 'left' && (
          <Panel id="left-panel" defaultSize={50} minSize={25}>
            <div className="panel-wrapper">{leftContent}</div>
          </Panel>
        )}

        {collapsedPane === null && <PanelResizeHandle className="resize-handle" />}

        {collapsedPane !== 'right' && (
          <Panel id="right-panel" defaultSize={50} minSize={25}>
            <div className="panel-wrapper">{rightContent}</div>
          </Panel>
        )}
      </PanelGroup>
    </div>
  );
}
