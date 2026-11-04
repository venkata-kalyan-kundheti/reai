import React from 'react';
import { useViewStore } from '../../store/useViewStore.js';

export function BackToWhereIWas() {
  const { historyStack, popHistory, setActivePage } = useViewStore();

  if (historyStack.length === 0) return null;

  const handleClick = () => {
    const prev = popHistory();
    if (!prev) return;

    setActivePage(prev.page);
    const pdfContainer = document.querySelector('.pdf-scroll-area');
    if (pdfContainer && prev.scrollTop !== undefined) {
      pdfContainer.scrollTo({ top: prev.scrollTop, behavior: 'smooth' });
    }
  };

  return (
    <button className="back-pill" onClick={handleClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to where I was (Page {historyStack[historyStack.length - 1]?.page})
    </button>
  );
}

