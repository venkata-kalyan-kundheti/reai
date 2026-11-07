import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const streamStatus = useDocStore((s) => s.streamState.status);

  // level/goal are read through a ref so changing them never re-runs the document-loading effect
  const levelGoalRef = useRef({ level, goal });
  levelGoalRef.current = { level, goal };

  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false); // a request (create / ask / simplify) is in flight
  const [error, setError] = useState(null);
  const [askContext, setAskContext] = useState(null);

  useHotkeys();
  // finished runs are already complete in the store: only live ones need a stream
  useGenerationStream(generation && generation.status !== 'done' && generation.status !== 'failed' ? generation._id : null);

  const initGeneration = useCallback(
    async (docId, customLevel, customGoal) => {
      const lg = levelGoalRef.current;
      setIsGenerating(true);
      setError(null);
      try {
        const res = await createGeneration({
          documentId: docId,
          level: customLevel ?? lg.level,
          goal: customGoal ?? lg.goal,
        });
        setGeneration(res.generation);
      } catch (err) {
        setError(err.message || 'Failed to start AI generation');
      } finally {
        setIsGenerating(false);
      }
    },
    [setGeneration]
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

  // "Resume" / "Try again": the server continues from the last finished section when it can.
  const handleResume = () => initGeneration(id);

  // Diagram analysis runs in the background after upload: poll until it finishes, then load the regions.
  const visionStatus = doc?.visionStatus;
  useEffect(() => {
    if (!['pending', 'running'].includes(visionStatus)) return undefined;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const { document: fresh } = await fetchDocument(id);
        if (stopped) return;
        setDocument(fresh);
        if (!['pending', 'running'].includes(fresh.visionStatus) && fresh.regionCount > 0) {
          const { chunks } = await fetchChunks(id);
          if (!stopped) setChunks(chunks);
        }
      } catch {
        /* transient: try again on the next tick */
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [visionStatus, id, setDocument, setChunks]);

  const analysing = ['pending', 'running'].includes(visionStatus) && (doc?.visionProgress?.total || 0) > 0;
  const figuresNotLinked = doc?.regionCount > 0 && generation && !String(generation.cacheKey || '').endsWith(':fig');
  const figureBanner =
    analysing || figuresNotLinked ? (
      <div className="figure-banner">
        {figuresNotLinked ? (
          <>
            <span>Found {doc.regionCount} diagram parts. Update the explanation to link them.</span>
            <button className="btn btn-sm btn-primary" onClick={handleResume} disabled={isGenerating}>
              Update
            </button>
          </>
        ) : (
          <span>
            Analysing diagrams ({doc.visionProgress.done}/{doc.visionProgress.total})… you can keep reading.
          </span>
        )}
      </div>
    ) : null;

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
          {(isGenerating || streamStatus === 'streaming') && (
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
        onResume={handleResume}
        figureBanner={figureBanner}
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

