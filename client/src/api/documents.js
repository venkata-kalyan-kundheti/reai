import { request } from './http.js';

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/documents', {
    method: 'POST',
    body: formData,
  });
}

export async function fetchDocument(documentId) {
  return request(`/api/documents/${documentId}`);
}

export async function fetchChunks(documentId) {
  return request(`/api/documents/${documentId}/chunks`);
}

export function getDocumentPdfUrl(documentId) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  return `${base}/api/documents/${documentId}/file`;
}

export async function deleteDocument(documentId) {
  return request(`/api/documents/${documentId}`, {
    method: 'DELETE',
  });
}

