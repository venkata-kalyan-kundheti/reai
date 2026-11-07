import { Document } from '../../models/Document.js';
import { Chunk } from '../../models/Chunk.js';
import { resolveStoragePath } from '../storage/index.js';
import { getVisionProvider } from '../vision/index.js';
import { normalizeRegions, regionToChunk } from '../vision/regions.js';
import { classifyError } from '../llm/errors.js';
import { loadCanvas, openForRender, findFigurePages, renderPageJpeg } from './figures.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const running = new Set();

/**
 * Background pass: find figure pages, ask the vision model for their parts, store them as
 * `image_region` chunks. The document is already usable while this runs; a failure here
 * must never break it.
 */
export async function runVisionPass(documentId) {
  const id = String(documentId);
  if (running.has(id)) return;
  running.add(id);

  let pdf;
  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.status !== 'ready') return;

    if (!(await loadCanvas())) {
      await Document.updateOne({ _id: doc._id }, { visionStatus: 'skipped', visionNote: 'Diagram analysis needs @napi-rs/canvas (npm install in /server).' });
      return;
    }

    pdf = await openForRender(resolveStoragePath(doc.storageKey));
    const figurePages = await findFigurePages(pdf, env.MAX_VISION_PAGES);

    if (!figurePages.length) {
      await Document.updateOne({ _id: doc._id }, { visionStatus: 'done', regionCount: 0, 'visionProgress.total': 0, 'visionProgress.done': 0 });
      return;
    }

    await Document.updateOne({ _id: doc._id }, { visionStatus: 'running', 'visionProgress.total': figurePages.length, 'visionProgress.done': 0 });

    const textChunks = await Chunk.find({ documentId: doc._id, type: { $ne: 'image_region' } })
      .select('chunkId page order type text bbox')
      .lean();
    const provider = getVisionProvider();

    const toInsert = [];
    let pagesDone = 0;
    let failures = 0;
    let lastError = null;

    for (const fp of figurePages) {
      try {
        const pageChunks = textChunks.filter((c) => c.page === fp.page);
        const image = await renderPageJpeg(pdf, fp.page, { scale: env.VISION_RENDER_SCALE });

        const raw = await provider.extractRegions({
          imageBuffer: image.buffer,
          mimeType: image.mimeType,
          page: fp.page,
          textHints: pageChunks.map((c) => c.text.slice(0, 160)),
          textChunks: pageChunks,
        });

        const regions = normalizeRegions(raw, fp.page);
        const lastOrder = pageChunks.reduce((m, c) => Math.max(m, c.order), -1);
        regions.forEach((r, i) => {
          // placed right after the page's text chunks, in flow order (fractions keep text order intact)
          toInsert.push(regionToChunk(r, { documentId: doc._id, page: fp.page, order: lastOrder + (i + 1) / 1000 }));
        });
      } catch (err) {
        const e = classifyError(err);
        failures++;
        lastError = e;
        logger.warn({ page: fp.page, code: e.code }, 'Vision analysis failed for a page');
        // No quota / bad key: every further page would fail the same way.
        if (['QUOTA_EXHAUSTED', 'AUTH_ERROR', 'MODEL_NOT_FOUND'].includes(e.code)) break;
      }
      pagesDone++;
      await Document.updateOne({ _id: doc._id }, { 'visionProgress.done': pagesDone });
    }

    if (toInsert.length) {
      await Chunk.deleteMany({ documentId: doc._id, type: 'image_region' });
      await Chunk.insertMany(toInsert);
    }

    const allFailed = failures === pagesDone && failures > 0;
    await Document.updateOne(
      { _id: doc._id },
      {
        visionStatus: allFailed ? 'failed' : 'done',
        regionCount: toInsert.length,
        visionNote: failures ? `${failures} of ${figurePages.length} pages could not be analysed (${lastError?.code}).` : undefined,
      }
    );
  } catch (err) {
    logger.error({ err, documentId: id }, 'Vision pass crashed');
    await Document.updateOne({ _id: documentId }, { visionStatus: 'failed', visionNote: 'Diagram analysis failed.' }).catch(() => {});
  } finally {
    running.delete(id);
    await pdf?.destroy().catch(() => {});
  }
}
