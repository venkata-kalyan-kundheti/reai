/**
 * Subscribe to a generation's server-sent events.
 * Returns an unsubscribe function.
 *
 * Server events: meta, segment, progress, notice, done, error (error carries JSON data).
 * A data-less `error` event means the CONNECTION dropped (not that generation failed):
 * we close and report it via onConnectionLost so the caller can re-sync and reconnect.
 */
export function connectGenerationStream(generationId, handlers) {
  const { onMeta, onSegment, onProgress, onNotice, onDone, onError, onConnectionLost } = handlers;
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const es = new EventSource(`${base}/api/generations/${generationId}/stream`, { withCredentials: true });

  const on = (type, cb) =>
    es.addEventListener(type, (e) => {
      try {
        cb?.(JSON.parse(e.data));
      } catch (err) {
        console.error(`Failed to parse ${type} event`, err);
      }
    });

  on('meta', onMeta);
  on('segment', onSegment);
  on('progress', onProgress);
  on('notice', onNotice);

  es.addEventListener('done', (e) => {
    try {
      onDone?.(JSON.parse(e.data));
    } catch {
      onDone?.({});
    }
    es.close();
  });

  es.addEventListener('error', (e) => {
    es.close();
    if (e.data) {
      try {
        onError?.(JSON.parse(e.data));
        return;
      } catch {
        /* fall through */
      }
    }
    onConnectionLost?.();
  });

  return () => es.close();
}
