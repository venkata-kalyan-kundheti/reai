import React, { useState } from 'react';
import { Page } from 'react-pdf';
import { HighlightLayer } from './HighlightLayer.jsx';
import { ChunkHitLayer } from './ChunkHitLayer.jsx';
import { BoxSelectLayer } from './BoxSelectLayer.jsx';

export function PdfPage({ pageNumber, scale, onPageLoaded, onBoxDrawn }) {
  const [dimensions, setDimensions] = useState(null);

  const handlePageLoadSuccess = (page) => {
    const viewport = page.getViewport({ scale });
    setDimensions({ width: viewport.width, height: viewport.height });
    onPageLoaded?.(pageNumber, viewport.height);
  };

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      className="pdf-page-wrapper"
      style={{
        width: dimensions ? `${dimensions.width}px` : undefined,
        minHeight: dimensions ? `${dimensions.height}px` : '600px',
      }}
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        onLoadSuccess={handlePageLoadSuccess}
        renderAnnotationLayer={false}
        renderTextLayer={true}
      />

      {dimensions && (
        <>
          <HighlightLayer
            pageNumber={pageNumber}
            pageWidth={dimensions.width}
            pageHeight={dimensions.height}
          />
          <ChunkHitLayer
            pageNumber={pageNumber}
            pageWidth={dimensions.width}
            pageHeight={dimensions.height}
          />
          <BoxSelectLayer
            pageNumber={pageNumber}
            pageWidth={dimensions.width}
            pageHeight={dimensions.height}
            onBoxDrawn={onBoxDrawn}
          />
        </>
      )}
    </div>
  );
}

