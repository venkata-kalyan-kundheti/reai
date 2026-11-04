import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { UploadPage } from './pages/UploadPage.jsx';
import { DocumentPage } from './pages/DocumentPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/doc/:id" element={<DocumentPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

