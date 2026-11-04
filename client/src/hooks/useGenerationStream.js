import { useEffect, useRef } from 'react';
import { connectGenerationStream } from '../api/sse.js';
import { useDocStore } from '../store/useDocStore.js';

export function useGenerationStream(generationId) {
  const { addSegment, setGeneration } = useDocStore();
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!generationId) return;

    cleanupRef.current?.();
    cleanupRef.current = connectGenerationStream(generationId, {
      onSegment: (seg) => {
        addSegment(seg);
      },
      onDone: () => {
        // stream finished
      },
      onError: (err) => {
        console.warn('Stream notice:', err);
      },
    });

    return () => {
      cleanupRef.current?.();
    };
  }, [generationId, addSegment, setGeneration]);
}

