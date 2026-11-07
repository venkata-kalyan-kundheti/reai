import { Document } from '../../models/Document.js';
import { Chunk } from '../../models/Chunk.js';
import { HttpError } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { resolveStoragePath } from '../storage/index.js';
import { extractText } from './extractText.js';
import { buildLines, medianFontSize, buildChunksForPage } from './buildChunks.js';
import { detectFurniture } from './detectFurniture.js';
import { orderLines } from './detectColumns.js';
import { runVisionPass } from './visionPass.js';
import { MIN_TEXT_CHARS, MIN_TEXT_PAGE_RATIO } from './constants.js';

const noText = () =>
  new HttpError(422, 'NO_TEXT_LAYER', 'This PDF has no selectable text. Scanned files are not supported yet.');

export async function runPipeline(documentId) {
  try {
    const doc = await Document.findById(documentId);
    if (!doc) return;

    await Document.updateOne({ _id: doc._id }, { status: 'parsing' });
    const pages = await extractText(resolveStoragePath(doc.storageKey));
    const pagesLines = pages.map((p) => ({ number: p.number, page: p, lines: buildLines(p) }));
    const allLines = pagesLines.flatMap((pl) => pl.lines);
    const rawChars = allLines.reduce((s, l) => s + l.chars, 0);
    const pagesWithText = pagesLines.filter((pl) => pl.lines.length > 0).length;

    if (rawChars < MIN_TEXT_CHARS || pagesWithText < Math.ceil(pages.length * MIN_TEXT_PAGE_RATIO)) {
      throw noText();
    }

    detectFurniture(pagesLines);
    const bodySize = medianFontSize(allLines);
    const chunks = [];
    const pageInfo = [];

    for (const pl of pagesLines) {
      const kept = pl.lines.filter((l) => !l.isFurniture);
      const pageChunks = buildChunksForPage(pl.page, orderLines(kept), bodySize, chunks.length);
      chunks.push(...pageChunks);
      pageInfo.push({
        number: pl.page.number,
        width: pl.page.width,
        height: pl.page.height,
        rotation: pl.page.rotation,
        charCount: pageChunks.reduce((s, c) => s + c.text.length, 0),
      });
    }

    if (!chunks.length) throw noText();

    await Chunk.deleteMany({ documentId: doc._id });
    await Chunk.insertMany(chunks.map((c) => ({ ...c, documentId: doc._id })));

    await Document.updateOne(
      { _id: doc._id },
      {
        status: 'ready',
        pageCount: pages.length,
        pages: pageInfo,
        totalChars: pageInfo.reduce((s, p) => s + p.charCount, 0),
        visionStatus: 'pending',
      }
    );

    // Diagram analysis continues in the background; the document is already usable.
    setImmediate(() => runVisionPass(doc._id));
  } catch (err) {
    const known = err instanceof HttpError;
    logger.error({ err, documentId: String(documentId) }, 'ingestion failed');
    await Document.updateOne(
      { _id: documentId },
      {
        status: 'failed',
        errorCode: known ? err.code : 'PARSE_FAILED',
        errorMessage: known ? err.message : 'Could not process this PDF',
      }
    ).catch(() => {});
  }
}

