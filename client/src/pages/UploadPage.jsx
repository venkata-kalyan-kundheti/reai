import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadDocument, fetchDocument } from '../api/documents.js';
import { Spinner } from '../components/common/Spinner.jsx';
import { ErrorBanner } from '../components/common/ErrorBanner.jsx';

export function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const pollDocumentReady = async (docId) => {
    setStatusMessage('Parsing pages and analyzing text layers...');
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { document: doc } = await fetchDocument(docId);
        if (doc.status === 'ready') {
          navigate(`/doc/${doc._id}`);
          return;
        }
        if (doc.status === 'failed') {
          setError(doc.errorMessage || 'Failed to process document');
          setIsUploading(false);
          return;
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setError('Document processing timed out');
    setIsUploading(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }

    setError(null);
    setIsUploading(true);
    setStatusMessage('Uploading document...');

    try {
      const res = await uploadDocument(file);
      const doc = res.document;
      if (res.reused && doc.status === 'ready') {
        navigate(`/doc/${doc._id}`);
      } else {
        await pollDocumentReady(doc._id);
      }
    } catch (err) {
      setError(err.message || 'Failed to upload document');
      setIsUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="upload-container">
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '8px' }}>
          Re<span style={{ color: 'var(--accent-primary)' }}>AI</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px' }}>
          Split-screen AI document explainer. Every AI explanation is linked directly to the exact source in your document.
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFile(e.target.files?.[0])}
          accept="application/pdf"
          style={{ display: 'none' }}
        />

        {isUploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Spinner size={36} />
            <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{statusMessage}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '2.5rem' }}>📄</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Drop your PDF here, or <span style={{ color: 'var(--accent-primary)' }}>browse</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Supports PDFs up to 25 MB • Fully private guest session
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

