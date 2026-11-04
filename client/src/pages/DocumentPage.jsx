import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchDocument, fetchChunks } from '../api/documents.js';
import { createGeneration, askFollowup, simplifySegment } from '../api/generations.js';
import { useDocStore } from '../store/useDocStore.js';
import { useViewStore } from '../store/useViewStore.js';
import { useGenerationStream } from '../hooks/useGenerationStream.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { SplitLayout } from '../components/layout/SplitLayout.jsx';
import { PaneHeader } from '../components/layout/PaneHeader.jsx';
import { Toolbar } from '../components/layout/Toolbar.jsx';
import { PdfViewer } from '../components/pdf/PdfViewer.jsx';
import { AiPanel } from '../components/ai/AiPanel.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';
import { Spinner } from '../components/common/Spinner.jsx';

export function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    document: doc,
    setDocument,
    setChunks,
    generation,
    setGeneration,
    addFollowup,
    reset,
  } = useDocStore();

  const { level, goal, setCollapsedPane } = useViewStore();

  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [askContext, setAskContext] = useState(null);

  useHotkeys();
  useGenerationStream(generation?._id);

  const initGeneration = useCallback(
    async (docId, customLevel = level, customGoal = goal) => {
      setIsGenerating(true);
      setError(null);
      try {
        const res = await createGeneration({
          documentId: docId,
          level: customLevel,
          goal: customGoal,
        });
        setGeneration(res.generation);
      } catch (err) {
        setError(err.message || 'Failed to start AI generation');
      } finally {
        setIsGenerating(false);
      }
    },
    [level, goal, setGeneration]
  );

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoadingDoc(true);
      setError(null);
      try {
        const [docRes, chunksRes] = await Promise.all([
          fetchDocument(id),
          fetchChunks(id),
        ]);

        if (!isMounted) return;
        setDocument(docRes.document);
        setChunks(chunksRes.chunks);

        await initGeneration(id);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load document');
      } finally {
        if (isMounted) setIsLoadingDoc(false);
      }
    }

    load();
    return () => {
      isMounted = false;
      reset();
    };
  }, [id, setDocument, setChunks, initGeneration, reset]);

  const handleRegenerate = ({ level: newLevel, goal: newGoal }) => {
    initGeneration(id, newLevel, newGoal);
  };

  const handleAsk = async (question, context) => {
    if (!generation?._id) return;
    setIsGenerating(true);
    try {
      const res = await askFollowup({
        generationId: generation._id,
        question,
        selectionText: context?.selectionText,
        selectionRect: context?.selectionRect,
        anchorSegmentId: context?.anchorSegmentId,
      });
      addFollowup(res.followup);
      setAskContext(null);
    } catch (err) {
      setError(err.message || 'Failed to submit question');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSimplify = async (segment) => {
    if (!generation?._id) return;
    setIsGenerating(true);
    try {
      const res = await simplifySegment({
        generationId: generation._id,
        segmentId: segment.segmentId,
      });
      addFollowup(res.followup);
    } catch (err) {
      setError(err.message || 'Failed to simplify concept');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoadingDoc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
        <Spinner size={36} />
        <span style={{ color: 'var(--text-secondary)' }}>Loading document and extracted text coordinates...</span>
      </div>
    );
  }

  const pdfHeader = (
    <PaneHeader
      title={doc?.originalName || 'Document'}
      icon={<span>📄</span>}
      onCollapse={() => setCollapsedPane('left')}
      extra={<Toolbar />}
    />
  );

  const aiHeader = (
    <PaneHeader
      title="Interactive AI Explanation"
      icon={<span>✨</span>}
      onCollapse={() => setCollapsedPane('right')}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isGenerating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
              <Spinner size={14} />
              <span>Generating...</span>
            </div>
          )}
        </div>
      }
    />
  );

  const pdfPanel = (
    <>
      {pdfHeader}
      <PdfViewer onAskContext={(ctx) => setAskContext(ctx)} />
    </>
  );

  const aiPanel = (
    <>
      {aiHeader}
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <AiPanel
        onRegenerate={handleRegenerate}
        onAsk={handleAsk}
        onSimplify={handleSimplify}
        askContext={askContext}
        onClearAskContext={() => setAskContext(null)}
        isLoading={isGenerating}
      />
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="app-header">
        <div className="logo-area" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span>ReAI</span>
          <span className="logo-badge">Split-Screen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-sm" onClick={() => navigate('/')}>
            + Upload New
          </button>
        </div>
      </header>

      <SplitLayout pdfPanel={pdfPanel} aiPanel={aiPanel} />
    </div>
  );
}

