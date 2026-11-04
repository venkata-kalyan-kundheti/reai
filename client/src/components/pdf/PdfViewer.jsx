import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { PdfPage } from './PdfPage.jsx';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { BackToWhereIWas } from '../common/BackToWhereIWas.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { useViewStore } from '../../store/useViewStore.js';
import { useDocStore } from '../../store/useDocStore.js';
import { getDocumentPdfUrl } from '../../api/documents.js';

// Setup local pdfjs worker from public folder matching pdfjs.version
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`;

export function PdfViewer({ onAskContext }) {
  const { zoom, setActivePage, setSelectionBox, setIsDrawingBox } = useViewStore();
  const { document: docData } = useDocStore();
  const [numPages, setNumPages] = useState(0);
  const [pageHeights, setPageHeights] = useState({});
  const [selectionPrompt, setSelectionPrompt] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const scrollRef = useRef(null);

  const fileProp = React.useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  const loadPdfData = useCallback(async (docId) => {
    if (!docId) return;
    setIsLoadingPdf(true);
    setPdfError(null);
    try {
      const url = getDocumentPdfUrl(docId);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const json = await res.json();
          msg = json?.error?.message || msg;
        } catch {
          // not json
        }
        throw new Error(msg);
      }
      const buffer = await res.arrayBuffer();
      // Pass as Uint8Array object so pdfjs parses directly from memory
      setPdfData(new Uint8Array(buffer));
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setPdfError(err.message || 'Could not load PDF file');
    } finally {
      setIsLoadingPdf(false);
    }
  }, []);

  useEffect(() => {
    if (docData?._id) {
      loadPdfData(docData._id);
    }
  }, [docData?._id, loadPdfData]);

  // Handle standard text selection on the PDF
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        return;
      }

      const text = sel.toString().trim();
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectionPrompt({
        text,
        position: { x: rect.left + rect.width / 2, y: rect.top },
      });
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPdfError(null);
  };

  const handleDocumentLoadError = (err) => {
    console.error('react-pdf document load error:', err);
    setPdfError(err?.message || 'Failed to render PDF preview');
  };

  const handlePageLoaded = (pageNumber, height) => {
    setPageHeights((prev) => ({ ...prev, [pageNumber]: height }));
  };

  const handleBoxDrawn = (box) => {
    setSelectionBox(box);
    setIsDrawingBox(false);
    onAskContext?.({
      selectionRect: box,
      questionHint: `Regarding the selected region on page ${box.page}...`,
    });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop } = scrollRef.current;
    let accumulated = 0;

    for (let n = 1; n <= numPages; n++) {
      const h = pageHeights[n] || 800;
      accumulated += h + 20;
      if (accumulated > scrollTop + 200) {
        setActivePage(n);
        break;
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="pdf-scroll-area" ref={scrollRef} onScroll={handleScroll}>
        {isLoadingPdf && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '60px', color: 'var(--text-secondary)' }}>
            <Spinner size={24} />
            <span>Loading PDF document...</span>
          </div>
        )}

        {pdfError && (
          <div style={{ padding: '40px', textAlign: 'center', maxWidth: '400px', margin: 'auto' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '8px' }}>
              Unable to preview PDF
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              {pdfError}
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => docData?._id && loadPdfData(docData._id)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoadingPdf && !pdfError && fileProp && (
          <Document
            file={fileProp}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '40px' }}>
                <Spinner size={24} />
                <span>Rendering pages...</span>
              </div>
            }
          >
            {Array.from(new Array(numPages), (el, index) => (
              <PdfPage
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                scale={zoom}
                onPageLoaded={handlePageLoaded}
                onBoxDrawn={handleBoxDrawn}
              />
            ))}
          </Document>
        )}
      </div>

      <BackToWhereIWas />

      {selectionPrompt && (
        <SelectionToolbar
          position={selectionPrompt.position}
          text={selectionPrompt.text}
          onAsk={(text) => {
            onAskContext?.({ selectionText: text });
            setSelectionPrompt(null);
            window.getSelection()?.removeAllRanges();
          }}
          onClear={() => {
            setSelectionPrompt(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
