export function connectGenerationStream(generationId, { onMeta, onSegment, onDone, onError }) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const url = `${base}/api/generations/${generationId}/stream`;

  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.addEventListener('meta', (e) => {
    try {
      const data = JSON.parse(e.data);
      onMeta?.(data);
    } catch (err) {
      console.error('Failed to parse meta event', err);
    }
  });

  eventSource.addEventListener('segment', (e) => {
    try {
      const data = JSON.parse(e.data);
      onSegment?.(data);
    } catch (err) {
      console.error('Failed to parse segment event', err);
    }
  });

  eventSource.addEventListener('done', (e) => {
    try {
      const data = JSON.parse(e.data);
      onDone?.(data);
    } catch (err) {
      console.error('Failed to parse done event', err);
    }
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    try {
      if (e.data) {
        const data = JSON.parse(e.data);
        onError?.(data);
      } else {
        onError?.(new Error('SSE connection error'));
      }
    } catch {
      onError?.(new Error('SSE stream interrupted'));
    }
    eventSource.close();
  });

  return () => {
    eventSource.close();
  };
}

