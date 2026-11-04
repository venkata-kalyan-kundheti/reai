export function buildSourceToSegmentIndex(segments = []) {
  const index = new Map(); // chunkId -> Array of segmentId
  for (const seg of segments) {
    if (Array.isArray(seg.sources)) {
      for (const sId of seg.sources) {
        if (!index.has(sId)) {
          index.set(sId, []);
        }
        index.get(sId).push(seg.segmentId);
      }
    }
  }
  return index;
}

