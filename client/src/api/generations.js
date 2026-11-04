import { request } from './http.js';

export async function createGeneration({ documentId, level = 'medium', goal = 'understanding', question = 'Explain this document' }) {
  return request('/api/generations', {
    method: 'POST',
    body: JSON.stringify({ documentId, level, goal, question }),
  });
}

export async function fetchGeneration(generationId) {
  return request(`/api/generations/${generationId}`);
}

export async function askFollowup({ generationId, question, selectionText, selectionRect, anchorSegmentId }) {
  return request(`/api/generations/${generationId}/ask`, {
    method: 'POST',
    body: JSON.stringify({ question, selectionText, selectionRect, anchorSegmentId }),
  });
}

export async function simplifySegment({ generationId, segmentId }) {
  return request(`/api/generations/${generationId}/simplify`, {
    method: 'POST',
    body: JSON.stringify({ segmentId }),
  });
}

