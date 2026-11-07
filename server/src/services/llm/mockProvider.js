export async function* generateStream({ prompt, signal, meta = {} }) {
  // Extract chunks from prompt if available (text chunks and figure-part chunks)
  const chunkRegex = /\[([cr]_[0-9]+_[0-9]+)\]\s*(?:\(Page\s*([0-9]+)[^)]*\))?:\s*([^\n]+)/g;
  const chunks = [];
  let match;
  while ((match = chunkRegex.exec(prompt)) !== null) {
    chunks.push({ chunkId: match[1], page: match[2] || '1', text: match[3] });
  }

  const lines = [];

  if (chunks.length === 0) {
    lines.push(
      JSON.stringify({
        type: 'heading',
        depth: 1,
        text: 'Document Summary',
        sources: [],
      })
    );
    lines.push(
      JSON.stringify({
        type: 'paragraph',
        depth: 1,
        text: 'This document provides an overview of the subject matter discussed in the uploaded text.',
        sources: [],
      })
    );
  } else {
    // Generate intelligent structured segments based on extracted chunks
    const firstChunk = chunks[0];
    const titleText =
      firstChunk.text.length < 50
        ? firstChunk.text
        : firstChunk.text.split(/[:.]/)[0] || 'Core Subject Overview';

    lines.push(
      JSON.stringify({
        type: 'heading',
        depth: 1,
        text: `1. ${titleText}`,
        sources: [firstChunk.chunkId],
      })
    );

    lines.push(
      JSON.stringify({
        type: 'paragraph',
        depth: 1,
        text: `The document begins by outlining key concepts: "${firstChunk.text.slice(0, 150)}${
          firstChunk.text.length > 150 ? '...' : ''
        }".`,
        sources: [firstChunk.chunkId],
      })
    );

    // Group intermediate chunks into bullet points and steps
    for (let i = 1; i < Math.min(chunks.length, 8); i++) {
      const c = chunks[i];
      const type = i % 2 === 0 ? 'bullet' : 'step';
      lines.push(
        JSON.stringify({
          type,
          depth: 1,
          text: `Key Insight: ${c.text.slice(0, 180)}`,
          sources: [c.chunkId],
        })
      );
    }

    if (chunks.length > 3) {
      const lastChunk = chunks[chunks.length - 1];
      lines.push(
        JSON.stringify({
          type: 'heading',
          depth: 2,
          text: 'Synthesis & Conclusions',
          sources: [lastChunk.chunkId],
        })
      );
      lines.push(
        JSON.stringify({
          type: 'paragraph',
          depth: 1,
          text: `In summary, the findings indicate that: ${lastChunk.text.slice(0, 180)}.`,
          sources: [lastChunk.chunkId],
        })
      );
    }
  }

  for (const line of lines) {
    if (signal?.aborted) return;
    // Simulate streaming by yielding character slices or whole line
    yield line + '\n';
    await new Promise((r) => setTimeout(r, 60));
  }
  meta.finishReason = 'STOP';
  meta.model = 'mock';
}

