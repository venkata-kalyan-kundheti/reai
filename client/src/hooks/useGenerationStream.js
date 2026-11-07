import { useEffect } from 'react';
import { connectGenerationStream } from '../api/sse.js';
import { fetchGeneration } from '../api/generations.js';
import { useDocStore } from '../store/useDocStore.js';

const MAX_RECONNECTS = 5;

/**
 * Keeps the store in sync with one generation: streams segments live, shows progress and
 * "AI is busy" notices, and recovers from dropped connections by re-reading the saved state.
 */
export function useGenerationStream(generationId) {
  useEffect(() => {
    if (!generationId) return undefined;

    const { addSegment, setStreamState, setGeneration } = useDocStore.getState();
    let closed = false;
    let reconnects = 0;
    let unsubscribe = null;
    let timer = null;

    const connect = () => {
      unsubscribe = connectGenerationStream(generationId, {
        onMeta: (m) => setStreamState({ status: 'streaming', error: null, progress: m.sectionCount ? { index: 0, count: m.sectionCount } : null }),
        onSegment: (seg) => {
          reconnects = 0;
          addSegment(seg);
          setStreamState({ notice: null });
        },
        onProgress: (p) => setStreamState({ status: 'streaming', progress: { index: p.sectionIndex, count: p.sectionCount, state: p.state } }),
        onNotice: (n) => setStreamState({ notice: n }),
        onDone: () => setStreamState({ status: 'done', notice: null, error: null }),
        onError: (err) => setStreamState({ status: 'failed', notice: null, error: err }),
        onConnectionLost: () => {
          if (closed) return;
          if (reconnects >= MAX_RECONNECTS) {
            setStreamState({
              status: 'failed',
              notice: null,
              error: { code: 'CONNECTION_LOST', message: 'Lost connection to the server.', retryable: true },
            });
            return;
          }
          reconnects++;
          setStreamState({ notice: { type: 'reconnecting' } });
          timer = setTimeout(async () => {
            if (closed) return;
            try {
              const { generation } = await fetchGeneration(generationId);
              if (closed) return;
              if (generation.status === 'streaming' || generation.status === 'pending') connect();
              else setGeneration(generation); // done or failed: just show the saved result
            } catch {
              connect();
            }
          }, 1500 * reconnects);
        },
      });
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [generationId]);
}
