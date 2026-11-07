export function buildSourceToSegmentIndex(segments = []) {
  const index = new Map(); // chunkId -> Array of segmentId
  for (const seg of segments) {
    if (Array.isArray(seg.sources)) {
      for (const sId of seg.sources) {
        if (!index.has(sId)) index.set(sId, []);
        index.get(sId).push(seg.segmentId);
      }
    }
  }
  return index;
}

/** Look a segment up in the main explanation AND in follow-up answers (Ask / "I didn't get this"). */
export function findSegmentById(segments = [], followups = [], id) {
  if (!id) return null;
  const main = segments.find((s) => s.segmentId === id);
  if (main) return main;
  for (const f of followups) {
    const hit = f.answerSegments?.find((s) => s.segmentId === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Steps of a diagram walkthrough: "step" segments that cite at least one figure region (r_*),
 * in explanation order. Needs 2+ to be worth playing.
 */
export function getWalkthroughSteps(segments = []) {
  const steps = segments.filter((s) => s.type === 'step' && s.sources?.some((id) => id.startsWith('r_')));
  return steps.length >= 2 ? steps : [];
}
