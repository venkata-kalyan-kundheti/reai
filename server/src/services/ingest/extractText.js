import './pdfjsPolyfills.js';
import fs from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { HttpError } from '../../utils/httpError.js';
import { env } from '../../config/env.js';
import { textItemToRect, isHorizontalItem } from './normalizeRect.js';

export async function extractText(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      throw new HttpError(422, 'PDF_ENCRYPTED', 'This PDF is password protected');
    }
    throw new HttpError(422, 'PDF_CORRUPT', 'This PDF could not be read');
  }

  try {
    if (pdf.numPages < 1) throw new HttpError(422, 'PDF_CORRUPT', 'This PDF has no pages');
    if (pdf.numPages > env.MAX_PAGES) {
      throw new HttpError(422, 'PAGE_LIMIT', `This PDF has more than ${env.MAX_PAGES} pages`);
    }

    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const meta = {
        number: n,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate || 0,
        items: [],
      };

      if (viewport.width > 0 && viewport.height > 0) {
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (typeof item.str !== 'string' || item.str.trim() === '') continue;
          if (!isHorizontalItem(item, viewport)) continue;
          const rect = textItemToRect(item, viewport);
          const fontSize = Math.abs(item.height) || Math.abs(item.transform[3]) || 0;
          if (!rect || !fontSize) continue;
          meta.items.push({ str: item.str, rect, fontSize, hasEOL: !!item.hasEOL });
        }
      }
      page.cleanup();
      pages.push(meta);
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

