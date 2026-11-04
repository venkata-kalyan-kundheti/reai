import { segmentId } from '../../utils/ids.js';
import { computeConfidence } from './confidence.js';

export function prepareSegment(rawSegment, order, chunkMap) {
  const sources = (rawSegment.sources || []).filter((sId) => chunkMap.has(sId));
  const citedChunks = sources.map((sId) => chunkMap.get(sId));
  const confidence = computeConfidence(rawSegment.text, citedChunks);

  return {
    segmentId: segmentId(order),
    order,
    type: rawSegment.type,
    depth: rawSegment.type === 'heading' ? Math.max(1, Math.min(3, rawSegment.depth || 1)) : 1,
    text: rawSegment.text,
    sources,
    confidence,
  };
}

